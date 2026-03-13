import { MarketWatcher, MarketSnapshot } from "../market/MarketWatcher";
import { ClaudeBrain, TradeDecision } from "../brain/ClaudeBrain";
import { RiskGuard } from "../risk/RiskGuard";
import { Executor } from "../executor/Executor";
import { Portfolio } from "../utils/Portfolio";
import { logger } from "../utils/logger";

export class CryptoSentinelAgent {
  private marketWatcher: MarketWatcher;
  private brain: ClaudeBrain;
  private riskGuard: RiskGuard;
  private executor: Executor;
  private portfolio: Portfolio;
  private running: boolean = false;
  private pollInterval: number;
  private timer?: NodeJS.Timeout;

  constructor() {
    this.pollInterval = parseInt(process.env.POLL_INTERVAL_MS || "60000");
    this.marketWatcher = new MarketWatcher();
    this.brain = new ClaudeBrain();
    this.riskGuard = new RiskGuard();
    this.executor = new Executor();
    this.portfolio = new Portfolio();
  }

  async start(): Promise<void> {
    this.running = true;
    logger.info(`📡 Agent loop starting — polling every ${this.pollInterval / 1000}s`);

    // Run immediately on start, then on interval
    await this.tick();

    this.timer = setInterval(async () => {
      if (this.running) await this.tick();
    }, this.pollInterval);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    logger.info("✅ Agent stopped cleanly.");
  }

  private async tick(): Promise<void> {
    try {
      logger.info("─────────────────────────────────────");
      logger.info("🔄 New agent cycle starting...");

      // 1. Gather market data
      logger.info("📊 Fetching market snapshot...");
      const snapshot: MarketSnapshot = await this.marketWatcher.getSnapshot();
      logger.info(`   ETH: $${snapshot.ethPrice} | 24h change: ${snapshot.ethChange24h}%`);

      // 2. Get portfolio state
      const portfolioState = await this.portfolio.getState();
      logger.info(`   Portfolio value: $${portfolioState.totalValueUsd}`);

      // 3. Ask Claude to reason about the market
      logger.info("🧠 Claude is analyzing the market...");
      const decision: TradeDecision = await this.brain.analyze(snapshot, portfolioState);
      logger.info(`   Decision: ${decision.action} | Confidence: ${decision.confidence}%`);
      logger.info(`   Reasoning: ${decision.reasoning}`);

      // 4. Check decision against risk rules
      logger.info("🛡️  Running risk checks...");
      const approved = this.riskGuard.approve(decision, portfolioState);

      if (!approved.ok) {
        logger.warn(`   ⚠️  Risk guard blocked trade: ${approved.reason}`);
        return;
      }

      // 5. Execute if action is not HOLD
      if (decision.action === "HOLD") {
        logger.info("   ✋ Holding — no trade this cycle.");
        return;
      }

      logger.info(`   ✅ Risk approved — executing ${decision.action}...`);
      const receipt = await this.executor.execute(decision);
      logger.info(`   🎉 Trade executed! Tx: ${receipt.txHash}`);

    } catch (err) {
      logger.error("❌ Error during agent tick:", err);
    }
  }
}
