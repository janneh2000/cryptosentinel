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
  score: number;
  signals: string[];
}

// Known Base ecosystem tokens to always check
const BASE_TOKENS = [
  "0x532f27101965dd16442E59d40670FaF5eBB142E4", // BRETT
  "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", // TOSHI
  "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", // DEGEN
  "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
  "0xCfA3Ef56d303AE4fAabA0592388F19d7C3399FB4", // CBBTC (coinbase BTC)
  "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe", // HIGHER
].join(",");

const BLACKLIST = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0x4200000000000000000000000000000000000006",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
]);

const MIN_LIQUIDITY_USD = 30_000;
const MIN_VOLUME_24H    = 5_000;
const MIN_TX_24H        = 20;

export class TokenScanner {
  private lastScan: TokenCandidate[] = [];
  private lastScanTime: number = 0;
  private scanCacheMs = 5 * 60 * 1000;

  async scan(): Promise<TokenCandidate[]> {
    if (Date.now() - this.lastScanTime < this.scanCacheMs && this.lastScan.length > 0) {
      logger.info(`📡 Token scan cache hit (${this.lastScan.length} tokens)`);
      return this.lastScan;
    }

    logger.info("📡 Scanning Base ecosystem for trending tokens...");

    try {
      const [known, searched] = await Promise.allSettled([
        this.fetchKnownBaseTokens(),
        this.fetchTrendingSearch(),
      ]);

      const all: TokenCandidate[] = [];
      if (known.status    === "fulfilled") all.push(...known.value);
      if (searched.status === "fulfilled") all.push(...searched.value);

      // Deduplicate by address
      const seen = new Set<string>();
      const unique = all.filter(t => {
        const k = t.address.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });

      const filtered = unique
        .filter(t => this.passesFilters(t))
        .map(t => ({ ...t, ...this.scoreToken(t) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      logger.info(`   Found ${filtered.length} qualified tokens on Base`);
      filtered.forEach(t =>
        logger.info(`   • ${t.symbol}: score=${t.score} vol=$${(t.volumeUsd24h/1000).toFixed(0)}k liq=$${(t.liquidityUsd/1000).toFixed(0)}k 1h=${t.priceChange1h.toFixed(1)}%`)
      );

      this.lastScan     = filtered;
      this.lastScanTime = Date.now();
      return filtered;
    } catch (err: any) {
      logger.warn(`📡 Token scan failed: ${err.message}`);
      return [];
    }
  }

  // Fetch pairs for known Base tokens by address
  private async fetchKnownBaseTokens(): Promise<TokenCandidate[]> {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${BASE_TOKENS}`,
      { timeout: 10000 }
    );
    const pairs = res.data?.pairs || [];
    // Only keep Base chain pairs
    return this.parsePairs(pairs.filter((p: any) => p?.chainId === "base"));
  }

  // Search trending on Base using DexScreener search
  private async fetchTrendingSearch(): Promise<TokenCandidate[]> {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/search?q=base+meme`,
      { timeout: 10000 }
    );
    const pairs = (res.data?.pairs || []).filter((p: any) => p?.chainId === "base");
    return this.parsePairs(
      pairs.sort((a: any, b: any) =>
        parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0)
      ).slice(0, 30)
    );
  }

  private parsePairs(pairs: any[]): TokenCandidate[] {
    if (!Array.isArray(pairs)) return [];
    return pairs.map(p => {
      try {
        const bt = p.baseToken || {};
        return {
          name:           bt.name    || "Unknown",
          symbol:         bt.symbol  || "???",
          address:        (bt.address || "").toLowerCase() as `0x${string}`,
          priceUsd:       parseFloat(p.priceUsd             || "0"),
          priceChange1h:  parseFloat(p.priceChange?.h1      || "0"),
          priceChange24h: parseFloat(p.priceChange?.h24     || "0"),
          volumeUsd24h:   parseFloat(p.volume?.h24          || "0"),
          liquidityUsd:   parseFloat(p.liquidity?.usd       || "0"),
          marketCap:      parseFloat(p.marketCap            || "0"),
          fdv:            parseFloat(p.fdv                  || "0"),
          txns24h:        (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0),
          pairAddress:    p.pairAddress || "",
          dexId:          p.dexId       || "",
          score:   0,
          signals: [],
        } as TokenCandidate;
      } catch { return null; }
    }).filter(Boolean) as TokenCandidate[];
  }

  private passesFilters(t: TokenCandidate): boolean {
    if (BLACKLIST.has(t.address.toLowerCase())) return false;
    if (!t.address || t.address.length < 10)    return false;
    if (t.liquidityUsd < MIN_LIQUIDITY_USD)      return false;
    if (t.volumeUsd24h  < MIN_VOLUME_24H)        return false;
    if (t.txns24h       < MIN_TX_24H)            return false;
    if (t.priceUsd     <= 0)                     return false;
    return true;
  }

  private scoreToken(t: TokenCandidate): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // Volume (0-30)
    if      (t.volumeUsd24h > 1_000_000) { score += 30; signals.push("vol >$1M"); }
    else if (t.volumeUsd24h >   500_000) { score += 20; signals.push("vol >$500k"); }
    else if (t.volumeUsd24h >   100_000) { score += 10; signals.push("vol >$100k"); }

    // Price momentum (0-25)
    if      (t.priceChange1h  > 10) { score += 25; signals.push(`+${t.priceChange1h.toFixed(1)}% 1h`); }
    else if (t.priceChange1h  >  5) { score += 15; signals.push(`+${t.priceChange1h.toFixed(1)}% 1h`); }
    else if (t.priceChange24h > 20) { score += 20; signals.push(`+${t.priceChange24h.toFixed(1)}% 24h`); }
    else if (t.priceChange24h > 10) { score += 10; signals.push(`+${t.priceChange24h.toFixed(1)}% 24h`); }

    // Liquidity (0-20)
    if      (t.liquidityUsd > 500_000) { score += 20; signals.push("liq >$500k"); }
    else if (t.liquidityUsd > 200_000) { score += 15; signals.push("liq >$200k"); }
    else if (t.liquidityUsd > 100_000) { score += 10; signals.push("liq >$100k"); }

    // Activity (0-15)
    if      (t.txns24h > 5000) { score += 15; signals.push(`${t.txns24h} txns`); }
    else if (t.txns24h > 1000) { score += 10; signals.push(`${t.txns24h} txns`); }
    else if (t.txns24h >  200) { score += 5;  signals.push(`${t.txns24h} txns`); }

    // Small cap bonus (0-10)
    if (t.marketCap > 0 && t.marketCap < 5_000_000)  { score += 10; signals.push("micro-cap"); }
    else if (t.marketCap < 20_000_000)                { score += 5;  signals.push("small-cap"); }

    // Penalty for dumps
    if (t.priceChange24h < -20) { score -= 15; signals.push("⚠ -20% 24h"); }
    else if (t.priceChange24h < -10) { score -= 8; }

    return { score: Math.max(0, Math.min(100, score)), signals };
  }

  getLastScan(): TokenCandidate[] { return this.lastScan; }
}