import Anthropic from "@anthropic-ai/sdk";
import { MarketSnapshot } from "../market/MarketWatcher";
import { PortfolioState } from "../utils/Portfolio";
import { logger } from "../utils/logger";

export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface TradeDecision {
  action: TradeAction;
  asset: string;
  amountUsd: number;
  confidence: number; // 0–100
  reasoning: string;
  signals: string[];
}

const SYSTEM_PROMPT = `You are CryptoSentinel, an autonomous crypto trading agent operating on Base chain.

Your job is to analyze market data and make disciplined, risk-aware trading decisions.

RULES:
- Only trade ETH on Base chain via Aerodrome DEX
- Never recommend risking more than the configured max risk per trade
- Be conservative: when uncertain, HOLD
- Think step by step about momentum, volume, fear/greed, and BTC correlation
- Always explain your reasoning clearly

You must respond with ONLY valid JSON in this exact shape:
{
  "action": "BUY" | "SELL" | "HOLD",
  "asset": "ETH",
  "amountUsd": <number>,
  "confidence": <0-100>,
  "reasoning": "<one clear sentence>",
  "signals": ["<signal 1>", "<signal 2>", ...]
}`;

export class ClaudeBrain {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async analyze(
    snapshot: MarketSnapshot,
    portfolio: PortfolioState
  ): Promise<TradeDecision> {
    const userMessage = `
MARKET DATA:
ETH Price: $${snapshot.ethPrice.toFixed(2)}
ETH 24h Change: ${snapshot.ethChange24h.toFixed(2)}%
ETH 24h Volume: $${(snapshot.ethVolume24h / 1e9).toFixed(2)}B
BTC 24h Change: ${snapshot.btcChange24h.toFixed(2)}%
Fear & Greed Index: ${snapshot.fearGreedIndex ?? "unknown"}/100

PORTFOLIO:
Total Value: $${portfolio.totalValueUsd.toFixed(2)}
ETH Holdings: ${portfolio.ethBalance} ETH ($${portfolio.ethValueUsd.toFixed(2)})
USDC Holdings: $${portfolio.usdcBalance.toFixed(2)}
Max risk per trade: $${portfolio.maxRiskUsd.toFixed(2)}

Based on this data, what should I do? Respond with JSON only.
    `.trim();

    try {
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Strip markdown code fences if present
      const clean = text.replace(/```json|```/g, "").trim();
      const decision: TradeDecision = JSON.parse(clean);

      return decision;
    } catch (err) {
      logger.error("Claude brain error:", err);
      // Safe fallback
      return {
        action: "HOLD",
        asset: "ETH",
        amountUsd: 0,
        confidence: 0,
        reasoning: "Error during analysis — defaulting to HOLD for safety.",
        signals: ["error-fallback"],
      };
    }
  }
}
