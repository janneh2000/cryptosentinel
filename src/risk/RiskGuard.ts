import { TradeDecision } from "../brain/ClaudeBrain";
import { PortfolioState } from "../utils/Portfolio";

export interface RiskCheckResult {
  ok: boolean;
  reason?: string;
}

export class RiskGuard {
  private maxRiskPerTrade: number;
  private stopLossThreshold: number;
  private minConfidence: number = 60; // Claude must be ≥60% confident

  constructor() {
    this.maxRiskPerTrade = parseFloat(process.env.MAX_RISK_PER_TRADE || "0.02");
    this.stopLossThreshold = parseFloat(process.env.STOP_LOSS_THRESHOLD || "0.05");
  }

  approve(decision: TradeDecision, portfolio: PortfolioState): RiskCheckResult {
    // 1. HOLD always passes
    if (decision.action === "HOLD") {
      return { ok: true };
    }

    // 2. Confidence check
    if (decision.confidence < this.minConfidence) {
      return {
        ok: false,
        reason: `Confidence too low: ${decision.confidence}% < ${this.minConfidence}% minimum`,
      };
    }

    // 3. Trade size check — can't risk more than maxRiskPerTrade of portfolio
    const maxAllowed = portfolio.totalValueUsd * this.maxRiskPerTrade;
    if (decision.amountUsd > maxAllowed) {
      return {
        ok: false,
        reason: `Trade size $${decision.amountUsd} exceeds max allowed $${maxAllowed.toFixed(2)} (${this.maxRiskPerTrade * 100}% of portfolio)`,
      };
    }

    // 4. Minimum trade size — avoid dust transactions
    if (decision.amountUsd < 1) {
      return {
        ok: false,
        reason: `Trade amount $${decision.amountUsd} is below $1 minimum`,
      };
    }

    // 5. For SELL — make sure we have enough ETH to sell
    if (decision.action === "SELL") {
      if (portfolio.ethValueUsd < decision.amountUsd) {
        return {
          ok: false,
          reason: `Insufficient ETH: trying to sell $${decision.amountUsd} but only have $${portfolio.ethValueUsd.toFixed(2)}`,
        };
      }
    }

    // 6. For BUY — make sure we have enough USDC
    if (decision.action === "BUY") {
      if (portfolio.usdcBalance < decision.amountUsd) {
        return {
          ok: false,
          reason: `Insufficient USDC: trying to buy $${decision.amountUsd} but only have $${portfolio.usdcBalance.toFixed(2)}`,
        };
      }
    }

    return { ok: true };
  }
}
