import { TradeDecision } from "../brain/ClaudeBrain";
import { PortfolioState } from "../utils/Portfolio";
import { logger } from "../utils/logger";

export interface RiskCheckResult {
  ok: boolean;
  reason?: string;
}

export class RiskGuard {
  private maxRiskPerTrade:    number;
  private stopLossThreshold:  number;
  private minConfidence:      number = 60;
  private lastTradeTime:      number = 0;
  private lastTradeAsset:     string = "";
  private tradeCooldownMs:    number = 5 * 60 * 1000; // 5 min cooldown per asset

  constructor() {
    this.maxRiskPerTrade   = parseFloat(process.env.MAX_RISK_PER_TRADE   || "0.02");
    this.stopLossThreshold = parseFloat(process.env.STOP_LOSS_THRESHOLD  || "0.05");
  }

  approve(decision: TradeDecision, portfolio: PortfolioState): RiskCheckResult {
    if (decision.action === "HOLD") return { ok: true };

    // 1. Confidence check
    if (decision.confidence < this.minConfidence) {
      return { ok: false, reason: `Confidence too low: ${decision.confidence}% < ${this.minConfidence}% minimum` };
    }

    // 2. Cooldown — don't spam the same asset every cycle
    const now = Date.now();
    const sameAsset = decision.asset === this.lastTradeAsset;
    const inCooldown = (now - this.lastTradeTime) < this.tradeCooldownMs;
    if (sameAsset && inCooldown) {
      const remaining = Math.round((this.tradeCooldownMs - (now - this.lastTradeTime)) / 1000);
      return { ok: false, reason: `Cooldown active for ${decision.asset} — ${remaining}s remaining` };
    }

    // 3. Trade size check
    const maxPct     = decision.isAltcoin ? 0.01 : this.maxRiskPerTrade;
    const maxAllowed = portfolio.totalValueUsd * maxPct;
    if (decision.amountUsd > maxAllowed) {
      return { ok: false, reason: `Trade size $${decision.amountUsd} exceeds max $${maxAllowed.toFixed(2)} (${maxPct * 100}% of portfolio)` };
    }

    // 4. Min trade size
    if (decision.amountUsd < 1) {
      return { ok: false, reason: `Trade amount $${decision.amountUsd} below $1 minimum` };
    }

    // 5. SELL — enough to sell?
    if (decision.action === "SELL" && portfolio.ethValueUsd < decision.amountUsd) {
      return { ok: false, reason: `Insufficient ETH: have $${portfolio.ethValueUsd.toFixed(2)}, need $${decision.amountUsd}` };
    }

    // 6. BUY — enough USDC?
    if (decision.action === "BUY" && portfolio.usdcBalance < decision.amountUsd) {
      return { ok: false, reason: `Insufficient USDC: have $${portfolio.usdcBalance.toFixed(2)}, need $${decision.amountUsd}` };
    }

    // Approved — record trade
    this.lastTradeTime  = now;
    this.lastTradeAsset = decision.asset;
    logger.info(`   ✅ Risk approved for ${decision.action} ${decision.asset}`);
    return { ok: true };
  }
}