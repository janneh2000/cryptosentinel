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

export class MarketWatcher {
  async getSnapshot(): Promise<MarketSnapshot> {
    const [prices, fearGreed] = await Promise.allSettled([
      this.fetchPrices(),
      this.fetchFearGreed(),
    ]);

    if (prices.status === "rejected") {
      throw new Error(`Failed to fetch prices: ${prices.reason}`);
    }

    return {
      timestamp:    Date.now(),
      ...prices.value,
      fearGreedIndex: fearGreed.status === "fulfilled" ? fearGreed.value : undefined,
    };
  }

  private async fetchPrices() {
    // Primary: Binance public API — no key, generous rate limits
    try {
      const res = await axios.get(
        "https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22ETHUSDT%22,%22BTCUSDT%22%5D",
        { timeout: 8000 }
      );
      const eth = res.data.find((t: any) => t.symbol === "ETHUSDT");
      const btc = res.data.find((t: any) => t.symbol === "BTCUSDT");
      if (!eth || !btc) throw new Error("Binance symbol not found");

      return {
        ethPrice:     parseFloat(eth.lastPrice),
        ethChange24h: parseFloat(eth.priceChangePercent),
        ethVolume24h: parseFloat(eth.quoteVolume),
        ethMarketCap: 0, // not available from Binance ticker
        btcPrice:     parseFloat(btc.lastPrice),
        btcChange24h: parseFloat(btc.priceChangePercent),
      };
    } catch (binanceErr: any) {
      logger.warn(`Binance API failed (${binanceErr.message}), falling back to CoinGecko...`);
    }

    // Fallback: CoinGecko free tier
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true",
      { timeout: 10000 }
    );
    const e = res.data.ethereum;
    const b = res.data.bitcoin;
    return {
      ethPrice:     e.usd,
      ethChange24h: e.usd_24h_change,
      ethVolume24h: e.usd_24h_vol,
      ethMarketCap: e.usd_market_cap,
      btcPrice:     b.usd,
      btcChange24h: b.usd_24h_change,
    };
  }

  private async fetchFearGreed(): Promise<number> {
    const res = await axios.get("https://api.alternative.me/fng/?limit=1", { timeout: 5000 });
    return parseInt(res.data.data[0].value);
  }
}