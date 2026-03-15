import axios from "axios";
import { logger } from "../utils/logger";

export interface TokenCandidate {
  name: string;
  symbol: string;
  address: `0x${string}`;
  priceUsd: number;
  priceChange1h: number;
  priceChange24h: number;
  volumeUsd24h: number;
  liquidityUsd: number;
  marketCap: number;
  pairAddress: string;
  dexId: string;
  txns24h: number;
  fdv: number;
  score: number; // 0–100 composite score
  signals: string[];
}

// Tokens we always skip — stables, wrapped assets, already tracked
const BLACKLIST = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0x4200000000000000000000000000000000000006", // WETH
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
]);

// Minimum thresholds to filter out rugs and dust
const MIN_LIQUIDITY_USD  = 50_000;   // $50k minimum liquidity
const MIN_VOLUME_24H     = 10_000;   // $10k minimum daily volume
const MIN_TX_24H         = 50;       // at least 50 transactions
const MAX_FDV_MARKETCAP  = 500_000_000; // max $500M FDV to find gems

export class TokenScanner {
  private lastScan: TokenCandidate[] = [];
  private lastScanTime: number = 0;
  private scanCacheMs = 5 * 60 * 1000; // cache for 5 minutes

  async scan(): Promise<TokenCandidate[]> {
    // Return cached results if recent
    if (Date.now() - this.lastScanTime < this.scanCacheMs && this.lastScan.length > 0) {
      logger.info(`📡 Token scan cache hit (${this.lastScan.length} tokens)`);
      return this.lastScan;
    }

    logger.info("📡 Scanning Base ecosystem for trending tokens...");

    try {
      const [trending, topGainers] = await Promise.allSettled([
        this.fetchTrendingOnBase(),
        this.fetchTopGainersOnBase(),
      ]);

      const all: TokenCandidate[] = [];

      if (trending.status === "fulfilled") all.push(...trending.value);
      if (topGainers.status === "fulfilled") all.push(...topGainers.value);

      // Deduplicate by address
      const seen = new Set<string>();
      const unique = all.filter(t => {
        const key = t.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Filter and score
      const filtered = unique
        .filter(t => this.passesFilters(t))
        .map(t => ({ ...t, ...this.scoreToken(t) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // top 10 candidates

      logger.info(`   Found ${filtered.length} qualified tokens on Base`);
      filtered.forEach(t => logger.info(`   • ${t.symbol}: score=${t.score} vol=$${(t.volumeUsd24h/1000).toFixed(0)}k liq=$${(t.liquidityUsd/1000).toFixed(0)}k`));

      this.lastScan = filtered;
      this.lastScanTime = Date.now();
      return filtered;
    } catch (err: any) {
      logger.warn(`📡 Token scan failed: ${err.message}`);
      return [];
    }
  }

  // Fetch trending pairs on Base from DexScreener
  private async fetchTrendingOnBase(): Promise<TokenCandidate[]> {
    const res = await axios.get(
      "https://api.dexscreener.com/latest/dex/tokens/trending?chainId=base",
      { timeout: 8000 }
    );
    return this.parseDexScreenerPairs(res.data?.pairs || res.data || []);
  }

  // Fetch top gainers on Base from DexScreener search
  private async fetchTopGainersOnBase(): Promise<TokenCandidate[]> {
    const res = await axios.get(
      "https://api.dexscreener.com/latest/dex/search?q=base&chainId=base",
      { timeout: 8000 }
    );
    const pairs = res.data?.pairs || [];
    // Sort by 24h volume and price change
    return this.parseDexScreenerPairs(
      pairs.sort((a: any, b: any) =>
        (parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0))
      ).slice(0, 30)
    );
  }

  private parseDexScreenerPairs(pairs: any[]): TokenCandidate[] {
    if (!Array.isArray(pairs)) return [];

    return pairs
      .filter(p => p?.chainId === "base" || p?.chainId === undefined)
      .map(p => {
        try {
          const baseToken = p.baseToken || {};
          const addr = (baseToken.address || "").toLowerCase() as `0x${string}`;
          return {
            name:          baseToken.name    || "Unknown",
            symbol:        baseToken.symbol  || "???",
            address:       addr as `0x${string}`,
            priceUsd:      parseFloat(p.priceUsd || "0"),
            priceChange1h: parseFloat(p.priceChange?.h1  || "0"),
            priceChange24h:parseFloat(p.priceChange?.h24 || "0"),
            volumeUsd24h:  parseFloat(p.volume?.h24      || "0"),
            liquidityUsd:  parseFloat(p.liquidity?.usd   || "0"),
            marketCap:     parseFloat(p.marketCap        || "0"),
            fdv:           parseFloat(p.fdv              || "0"),
            txns24h:       (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
            pairAddress:   p.pairAddress || "",
            dexId:         p.dexId       || "",
            score:         0,
            signals:       [],
          } as TokenCandidate;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as TokenCandidate[];
  }

  private passesFilters(t: TokenCandidate): boolean {
    if (BLACKLIST.has(t.address.toLowerCase())) return false;
    if (!t.address || t.address.length < 10)   return false;
    if (t.liquidityUsd < MIN_LIQUIDITY_USD)     return false;
    if (t.volumeUsd24h  < MIN_VOLUME_24H)       return false;
    if (t.txns24h       < MIN_TX_24H)           return false;
    if (t.fdv > MAX_FDV_MARKETCAP && t.fdv > 0) return false;
    if (t.priceUsd <= 0)                        return false;
    return true;
  }

  private scoreToken(t: TokenCandidate): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // Volume surge signal (0–30 pts)
    if (t.volumeUsd24h > 1_000_000) { score += 30; signals.push("high volume >$1M"); }
    else if (t.volumeUsd24h > 500_000) { score += 20; signals.push("volume >$500k"); }
    else if (t.volumeUsd24h > 100_000) { score += 10; signals.push("volume >$100k"); }

    // Price momentum (0–25 pts)
    if (t.priceChange1h > 10)  { score += 25; signals.push(`+${t.priceChange1h.toFixed(1)}% 1h surge`); }
    else if (t.priceChange1h > 5) { score += 15; signals.push(`+${t.priceChange1h.toFixed(1)}% 1h`); }
    else if (t.priceChange24h > 20) { score += 20; signals.push(`+${t.priceChange24h.toFixed(1)}% 24h`); }
    else if (t.priceChange24h > 10) { score += 10; signals.push(`+${t.priceChange24h.toFixed(1)}% 24h`); }

    // Liquidity health (0–20 pts)
    if (t.liquidityUsd > 500_000) { score += 20; signals.push("strong liquidity >$500k"); }
    else if (t.liquidityUsd > 200_000) { score += 15; signals.push("good liquidity >$200k"); }
    else if (t.liquidityUsd > 100_000) { score += 10; signals.push("liquidity >$100k"); }

    // Transaction activity (0–15 pts)
    if (t.txns24h > 5000) { score += 15; signals.push(`${t.txns24h} txns/day`); }
    else if (t.txns24h > 1000) { score += 10; signals.push(`${t.txns24h} txns/day`); }
    else if (t.txns24h > 200) { score += 5; signals.push(`${t.txns24h} txns/day`); }

    // Small cap gem bonus (0–10 pts)
    if (t.marketCap > 0 && t.marketCap < 5_000_000)  { score += 10; signals.push("micro-cap gem"); }
    else if (t.marketCap < 20_000_000) { score += 5; signals.push("small-cap"); }

    // Penalty for negative momentum
    if (t.priceChange24h < -20) { score -= 15; signals.push("⚠ down -20% 24h"); }
    else if (t.priceChange24h < -10) { score -= 8; }

    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  getLastScan(): TokenCandidate[] {
    return this.lastScan;
  }
}