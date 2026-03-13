import { createWalletClient, createPublicClient, http, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { TradeDecision } from "../brain/ClaudeBrain";
import { logger } from "../utils/logger";

export interface TradeReceipt {
  txHash: string;
  action: string;
  amountUsd: number;
  timestamp: number;
}

// Aerodrome Router on Base Mainnet
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export class Executor {
  private walletClient;
  private publicClient;
  private account;
  private isDryRun: boolean;

  constructor() {
    const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    const chain = process.env.CHAIN === "base-sepolia" ? baseSepolia : base;
    const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

    // Dry run if no private key configured
    this.isDryRun = !privateKey || privateKey === "0x...";

    if (!this.isDryRun) {
      this.account = privateKeyToAccount(privateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport: http(rpcUrl),
      });
    }

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }

  async execute(decision: TradeDecision): Promise<TradeReceipt> {
    if (this.isDryRun) {
      logger.warn("🔸 DRY RUN MODE — no real transaction sent");
      return this.mockReceipt(decision);
    }

    if (decision.action === "BUY") {
      return await this.buyEth(decision);
    } else if (decision.action === "SELL") {
      return await this.sellEth(decision);
    }

    throw new Error(`Unknown action: ${decision.action}`);
  }

  private async buyEth(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💸 Buying ETH worth $${decision.amountUsd} via Aerodrome...`);

    // TODO: Implement actual Aerodrome swap call
    // This is where you'd encode the swap calldata and send via walletClient
    // For now, returns a mock until DEX integration is wired up
    logger.warn("⚠️  DEX integration pending — returning mock receipt");
    return this.mockReceipt(decision);
  }

  private async sellEth(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💰 Selling ETH worth $${decision.amountUsd} via Aerodrome...`);

    // TODO: Implement actual Aerodrome swap call
    logger.warn("⚠️  DEX integration pending — returning mock receipt");
    return this.mockReceipt(decision);
  }

  private mockReceipt(decision: TradeDecision): TradeReceipt {
    return {
      txHash: `0xMOCK_${Date.now().toString(16)}`,
      action: decision.action,
      amountUsd: decision.amountUsd,
      timestamp: Date.now(),
    };
  }

  async getWalletAddress(): Promise<string> {
    if (!this.account) return "0x0000000000000000000000000000000000000000";
    return this.account.address;
  }
}
