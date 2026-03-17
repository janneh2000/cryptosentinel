import { MarketWatcher, MarketSnapshot } from "../market/MarketWatcher";
import { TokenScanner, TokenCandidate } from "../market/TokenScanner";
import { ClaudeBrain, TradeDecision } from "../brain/ClaudeBrain";
import { RiskGuard } from "../risk/RiskGuard";
import { Executor } from "../executor/Executor";
import { Portfolio } from "../utils/Portfolio";
import { TelegramNotifier } from "../notifications/TelegramNotifier";
import { OnChainTradeLog } from "../onchain/TradeLog";
import { startSignalServer, updateLatestSignal } from "../x402/SignalServer";
import { logger } from "../utils/logger";

export class CryptoSentinelAgent {
  private marketWatcher:  MarketWatcher;
  private tokenScanner:   TokenScanner;
  private brain:          ClaudeBrain;
  private riskGuard:      RiskGuard;
  private executor:       Executor;
  private portfolio:      Portfolio;
  private telegram:       TelegramNotifier;
  private tradeLog:       OnChainTradeLog;
  private running:        boolean = false;
  private pollInterval:   number;
  private timer?:         NodeJS.Timeout;
  private cycleCount:     number = 0;

  constructor() {
    this.pollInterval   = parseInt(process.env.POLL_INTERVAL_MS || "60000");
    this.marketWatcher  = new MarketWatcher();
    this.tokenScanner   = new TokenScanner();
    this.brain          = new ClaudeBrain();
    this.riskGuard      = new RiskGuard();
    this.executor       = new Executor();
    this.portfolio      = new Portfolio();
    this.telegram       = new TelegramNotifier();
    this.tradeLog       = new OnChainTradeLog();
  }

  async start(): Promise<void> {
    this.running = true;
    const walletAddress = await this.executor.getWalletAddress();
    logger.info(`📡 Agent loop starting — polling every ${this.pollInterval / 1000}s`);
    logger.info(`🔍 Token scanner: Base ecosystem altcoins + memecoins`);

    // Start x402 signal server
    startSignalServer(parseInt(process.env.SIGNAL_PORT || "3001"));

    await this.telegram.notifyStartup(walletAddress);
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
    this.cycleCount++;
    try {
      logger.info("─────────────────────────────────────");
      logger.info(`🔄 Cycle #${this.cycleCount} starting...`);

      // 1. Market data
      logger.info("📊 Fetching market snapshot...");
      const snapshot: MarketSnapshot = await this.marketWatcher.getSnapshot();
      logger.info(`   ETH: $${snapshot.ethPrice.toFixed(2)} | 24h: ${snapshot.ethChange24h.toFixed(2)}% | F&G: ${snapshot.fearGreedIndex ?? "?"}/100`);

      // 2. Token scan
      logger.info("🔍 Scanning Base ecosystem tokens...");
      let topTokens: TokenCandidate[] = [];
      try {
        topTokens = await this.tokenScanner.scan();
        if (topTokens.length > 0) {
          logger.info(`   Top pick: ${topTokens[0].symbol} (score: ${topTokens[0].score})`);
        }
      } catch(e: any) {
        logger.warn(`   Token scan skipped: ${e.message}`);
      }

      // 3. Portfolio
      const walletAddress  = await this.executor.getWalletAddress();
      const portfolioState = await this.portfolio.getState(walletAddress);
      logger.info(`   Portfolio: $${portfolioState.totalValueUsd.toFixed(2)} | ETH: ${portfolioState.ethBalance.toFixed(4)} | USDC: $${portfolioState.usdcBalance.toFixed(2)}`);

      // 4. Claude reasoning
      logger.info("🧠 Claude is analyzing market + Base tokens...");
      const decision: TradeDecision = await this.brain.analyze(snapshot, portfolioState, topTokens);
      logger.info(`   Decision: ${decision.action} ${decision.asset} | Confidence: ${decision.confidence}%`);
      logger.info(`   Reasoning: ${decision.reasoning}`);
      if (decision.signals?.length) logger.info(`   Signals: ${decision.signals.join(", ")}`);

      // 5. Update x402 signal server with latest analysis
      updateLatestSignal({
        timestamp:  Date.now(),
        action:     decision.action,
        asset:      decision.asset,
        confidence: decision.confidence,
        reasoning:  decision.reasoning,
        signals:    decision.signals || [],
        ethPrice:   snapshot.ethPrice,
        fearGreed:  snapshot.fearGreedIndex ?? 0,
        topTokens:  topTokens.slice(0, 5).map(t => ({
          symbol:   t.symbol,
          score:    t.score,
          price:    t.priceUsd,
          vol24h:   t.volumeUsd24h,
          change1h: t.priceChange1h,
        })),
      });

      // 6. Risk check
      logger.info("🛡️  Running risk checks...");
      const approved = this.riskGuard.approve(decision, portfolioState);
      if (!approved.ok) {
        logger.warn(`   ⚠️  Risk guard blocked: ${approved.reason}`);
        return;
      }

      // 7. Hold path
      if (decision.action === "HOLD") {
        logger.info("   ✋ Holding — no trade this cycle.");
        await this.telegram.notifyHold(decision, snapshot);
        return;
      }

      // 8. Execute
      const label = decision.isAltcoin ? `${decision.asset} (altcoin)` : decision.asset;
      logger.info(`   ✅ Executing ${decision.action} ${label} via Uniswap V3...`);
      const receipt = await this.executor.execute({
        ...decision, ethPrice: snapshot.ethPrice,
      } as any);
      logger.info(`   🎉 Trade done! TX: ${receipt.txHash}`);

      // 9. Notifications + log
      await this.telegram.notifyTradeExecuted(receipt, decision, snapshot);
      const logTx = await this.tradeLog.log(receipt, decision, snapshot.ethPrice);
      if (logTx) logger.info(`   📋 Logged onchain: ${logTx}`);

    } catch(err: any) {
      logger.error("❌ Error during agent tick:", err.message);
      await this.telegram.notifyError(err.message);
    }
  }
}