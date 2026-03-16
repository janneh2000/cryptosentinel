import axios from "axios";
import { TradeReceipt } from "../executor/Executor";
import { TradeDecision } from "../brain/ClaudeBrain";
import { MarketSnapshot } from "../market/MarketWatcher";
import { logger } from "../utils/logger";

export class TelegramNotifier {
  private botToken: string;
  private chatId: string;
  private enabled: boolean;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.chatId   = process.env.TELEGRAM_CHAT_ID   || "";
    this.enabled  = !!(this.botToken && this.chatId);
    if (this.enabled) logger.info("📱 Telegram notifications enabled");
    else logger.warn("📱 Telegram not configured — skipping notifications");
  }

  async notifyTradeExecuted(receipt: TradeReceipt, decision: TradeDecision, snapshot: MarketSnapshot): Promise<void> {
    if (!this.enabled) return;

    const emoji    = decision.action === "BUY" ? "🟢" : "🔴";
    const asset    = decision.asset || "ETH";
    const isAlt    = decision.isAltcoin ? ` (Base altcoin)` : "";
    const chainUrl = process.env.CHAIN === "base-sepolia"
      ? `https://sepolia.basescan.org/tx/${receipt.txHash}`
      : `https://basescan.org/tx/${receipt.txHash}`;

    const isMock = receipt.txHash.startsWith("0xMOCK");

    const message = `
${emoji} *CryptoSentinel Trade Executed*

*Action:* ${decision.action} ${asset}${isAlt}
*Amount:* $${receipt.amountUsd.toFixed(2)} (${receipt.amountToken})
*DEX:* Uniswap V3 on Base${isMock ? " _(testnet simulation)_" : ""}

📊 *Market at execution:*
• ETH Price: $${snapshot.ethPrice.toFixed(2)}
• 24h Change: ${snapshot.ethChange24h.toFixed(2)}%
• Fear & Greed: ${snapshot.fearGreedIndex ?? "N/A"}/100

🧠 *Claude's reasoning:*
_${decision.reasoning}_
Confidence: ${decision.confidence}%

🔗 [View on Basescan](${chainUrl})
`.trim();

    await this.send(message);
  }

  async notifyHold(decision: TradeDecision, snapshot: MarketSnapshot): Promise<void> {
    if (!this.enabled) return;
    if (decision.confidence < 80) return;

    const message = `
✋ *CryptoSentinel — Holding Position*

ETH: $${snapshot.ethPrice.toFixed(2)} (${snapshot.ethChange24h.toFixed(2)}%)
Fear & Greed: ${snapshot.fearGreedIndex ?? "N/A"}/100

_${decision.reasoning}_
`.trim();

    await this.send(message);
  }

  async notifyStartup(walletAddress: string): Promise<void> {
    if (!this.enabled) return;
    const message = `
🚀 *CryptoSentinel is Live!*

Agent started on ${process.env.CHAIN === "base-sepolia" ? "Base Sepolia (testnet)" : "Base Mainnet"}
Wallet: \`${walletAddress}\`
Poll interval: every ${parseInt(process.env.POLL_INTERVAL_MS || "60000") / 1000}s
DEX: Uniswap V3
Scanner: Base ecosystem altcoins + memecoins

_Monitoring markets 24/7..._
`.trim();
    await this.send(message);
  }

  async notifyError(error: string): Promise<void> {
    if (!this.enabled) return;
    await this.send(`⚠️ *CryptoSentinel Error*\n\n\`${error}\``);
  }

  private async send(message: string): Promise<void> {
    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id:    this.chatId,
        text:       message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      logger.info("📱 Telegram notification sent");
    } catch (err: any) {
      logger.warn(`📱 Telegram send failed: ${err.message}`);
    }
  }
}