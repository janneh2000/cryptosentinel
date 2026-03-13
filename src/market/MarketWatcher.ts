import axios from "axios";
import { logger } from "../utils/logger";

export interface MarketSnapshot {
  timestamp: number;
  ethPrice: number;
  ethChange24h: number;
  ethVolume24h: number;
  ethMarketCap: number;
  btcPrice: number;
  btcChange24h: number;
  fearGreedIndex?: number;
  gasPrice?: string;
}

const COINGECKO_URL = "https://api.coingecko.com/api/v3";

export class MarketWatcher {
  async getSnapshot(): Promise<MarketSnapshot> {
    const [prices, fearGreed] = await Promise.allSettled([
      this.fetchPrices(),
      this.fetchFearGreed(),
    ]);

    const priceData = prices.status === "fulfilled" ? prices.value : null;

    if (!priceData) {
      throw new Error("Failed to fetch price data from CoinGecko");
    }

    return {
      timestamp: Date.now(),
      ethPrice: priceData.ethereum.usd,
      ethChange24h: priceData.ethereum.usd_24h_change,
      ethVolume24h: priceData.ethereum.usd_24h_vol,
      ethMarketCap: priceData.ethereum.usd_market_cap,
      btcPrice: priceData.bitcoin.usd,
      btcChange24h: priceData.bitcoin.usd_24h_change,
      fearGreedIndex:
        fearGreed.status === "fulfilled"
          ? fearGreed.value
          : undefined,
    };
  }

  private async fetchPrices() {
    const response = await axios.get(`${COINGECKO_URL}/simple/price`, {
      params: {
        ids: "ethereum,bitcoin",
        vs_currencies: "usd",
        include_24hr_change: true,
        include_24hr_vol: true,
        include_market_cap: true,
      },
    });
    return response.data;
  }

  private async fetchFearGreed(): Promise<number> {
    // Alternative Fear & Greed API (free, no key needed)
    const response = await axios.get("https://api.alternative.me/fng/?limit=1");
    return parseInt(response.data.data[0].value);
  }

  // Format snapshot as a readable string for Claude
  snapshotToText(snapshot: MarketSnapshot): string {
    return `
MARKET SNAPSHOT (${new Date(snapshot.timestamp).toISOString()})
─────────────────────────────────────
ETH Price:    $${snapshot.ethPrice.toFixed(2)}
ETH 24h:      ${snapshot.ethChange24h.toFixed(2)}%
ETH Volume:   $${(snapshot.ethVolume24h / 1e9).toFixed(2)}B
BTC Price:    $${snapshot.btcPrice.toFixed(2)}
BTC 24h:      ${snapshot.btcChange24h.toFixed(2)}%
Fear & Greed: ${snapshot.fearGreedIndex ?? "N/A"} / 100
    `.trim();
  }
}
