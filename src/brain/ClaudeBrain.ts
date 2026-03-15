import Anthropic from "@anthropic-ai/sdk";
import { MarketSnapshot } from "../market/MarketWatcher";
import { TokenCandidate } from "../market/TokenScanner";
import { PortfolioState } from "../utils/Portfolio";
import { logger } from "../utils/logger";

export type TradeAction = "BUY" | "SELL" | "HOLD";

export interface TradeDecision {
  action:     TradeAction;
  asset:      string;
  tokenAddress?: string; // only set for altcoin trades
  amountUsd:  number;
  confidence: number;
  reasoning:  string;
  signals:    string[];
  isAltcoin?: boolean;
}

const SYSTEM_PROMPT = `You are CryptoSentinel, an autonomous crypto trading agent on Base chain.

You analyze both ETH macro conditions AND trending Base ecosystem tokens (altcoins, memecoins).

STRATEGY:
- ETH/USDC swaps via Uniswap V3 for macro plays
- Base altcoin/memecoin trades when high-score tokens show strong momentum
- Altcoin trades are higher risk — require score >= 60 AND confidence >= 70
- ETH trades require confidence >= 60

RISK RULES:
- Max 2% of portfolio per ETH trade
- Max 1% of portfolio per altcoin trade
- Never trade illiquid tokens (liquidity < $50k)
- When uncertain, HOLD

You must respond with ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "asset": "ETH" | "<TOKEN_SYMBOL>",
  "tokenAddress": "<address or null>",
  "amountUsd": <number>,
  "confidence": <0-100>,
  "reasoning": "<one clear sentence>",
  "signals": ["<signal1>", "<signal2>"],
  "isAltcoin": <true|false>
}`;

export class ClaudeBrain {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async analyze(
    snapshot: MarketSnapshot,
    portfolio: PortfolioState,
    topTokens: TokenCandidate[] = []
  ): Promise<TradeDecision> {

    const tokenSection = topTokens.length > 0
      ? `\nTOP BASE TOKENS (by opportunity score):\n` +
        topTokens.slice(0, 5).map(t =>
          `• ${t.symbol} (${t.name}): score=${t.score} price=$${t.priceUsd.toFixed(6)} ` +
          `1h=${t.priceChange1h.toFixed(1)}% 24h=${t.priceChange24h.toFixed(1)}% ` +
          `vol=$${(t.volumeUsd24h/1000).toFixed(0)}k liq=$${(t.liquidityUsd/1000).toFixed(0)}k ` +
          `signals=[${t.signals.join(", ")}] addr=${t.address}`
        ).join("\n")
      : "\nNo altcoin data available this cycle.";

    const userMessage = `
MACRO MARKET:
ETH Price:    $${snapshot.ethPrice.toFixed(2)}
ETH 24h:      ${snapshot.ethChange24h.toFixed(2)}%
ETH Volume:   $${(snapshot.ethVolume24h / 1e9).toFixed(2)}B
BTC 24h:      ${snapshot.btcChange24h.toFixed(2)}%
Fear & Greed: ${snapshot.fearGreedIndex ?? "unknown"}/100
${tokenSection}

PORTFOLIO:
Total Value:  $${portfolio.totalValueUsd.toFixed(2)}
ETH Balance:  ${portfolio.ethBalance} ETH ($${portfolio.ethValueUsd.toFixed(2)})
USDC Balance: $${portfolio.usdcBalance.toFixed(2)}
Max risk/trade (ETH):     $${(portfolio.totalValueUsd * 0.02).toFixed(2)}
Max risk/trade (altcoin): $${(portfolio.totalValueUsd * 0.01).toFixed(2)}

Analyze both ETH and top Base tokens. Pick the BEST opportunity or HOLD.
Respond with JSON only.`.trim();

    try {
      const response = await this.client.messages.create({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 512,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }],
      });

      const text  = response.content[0].type === "text" ? response.content[0].text : "";
      const clean = text.replace(/```json|```/g, "").trim();
      const decision: TradeDecision = JSON.parse(clean);
      return decision;
    } catch (err) {
      logger.error("Claude brain error:", err);
      return {
        action: "HOLD", asset: "ETH", amountUsd: 0,
        confidence: 0, isAltcoin: false,
        reasoning: "Error during analysis — defaulting to HOLD for safety.",
        signals: ["error-fallback"],
      };
    }
  }
}