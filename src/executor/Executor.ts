import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  maxUint256,
} from "viem";
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

// ─── Base Sepolia Testnet Addresses ──────────────────────────────────────────
const SWAP_ROUTER_SEPOLIA  = "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602" as const;
const WETH_SEPOLIA         = "0x4200000000000000000000000000000000000006" as const;
const USDC_SEPOLIA         = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// ─── Base Mainnet Addresses ───────────────────────────────────────────────────
const AERODROME_ROUTER     = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as const;
const WETH_MAINNET         = "0x4200000000000000000000000000000000000006" as const;
const USDC_MAINNET         = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: "approve",   type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { name: "allowance", type: "function", inputs: [{ name: "owner",   type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
] as const;

const ROUTER_ABI = [
  { name: "swapExactETHForTokens",  type: "function", inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }], stateMutability: "payable" },
  { name: "swapExactTokensForETH",  type: "function", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }], stateMutability: "nonpayable" },
] as const;

export class Executor {
  private walletClient: any;
  private publicClient: any;
  private account: any;
  private isDryRun: boolean;
  private routerAddress: `0x${string}`;
  private wethAddress:   `0x${string}`;
  private usdcAddress:   `0x${string}`;

  constructor() {
    const privateKey  = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    const isSepolia   = process.env.CHAIN === "base-sepolia";
    const chain       = isSepolia ? baseSepolia : base;
    const rpcUrl      = process.env.RPC_URL || "https://sepolia.base.org";

    this.routerAddress = isSepolia ? SWAP_ROUTER_SEPOLIA : AERODROME_ROUTER;
    this.wethAddress   = isSepolia ? WETH_SEPOLIA        : WETH_MAINNET;
    this.usdcAddress   = isSepolia ? USDC_SEPOLIA        : USDC_MAINNET;
    this.isDryRun      = !privateKey || privateKey === "0x...";

    if (!this.isDryRun) {
      this.account      = privateKeyToAccount(privateKey);
      this.walletClient = createWalletClient({ account: this.account, chain, transport: http(rpcUrl) });
      logger.info(`💳 Wallet: ${this.account.address}`);
    } else {
      logger.warn("🔸 No wallet key — DRY RUN mode");
    }

    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  }

  async execute(decision: TradeDecision): Promise<TradeReceipt> {
    if (this.isDryRun) {
      logger.warn("🔸 DRY RUN — no real transaction sent");
      return this.mockReceipt(decision);
    }
    if (decision.action === "BUY")  return this.buyWithEth(decision);
    if (decision.action === "SELL") return this.sellForEth(decision);
    throw new Error(`Unknown action: ${decision.action}`);
  }

  // BUY: swap ETH → USDC (acquiring stable after signal)
  private async buyWithEth(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💸 BUY: swapping ETH → USDC ($${decision.amountUsd})`);
    const ethPrice  = 2135; // TODO: wire in live price from MarketWatcher
    const ethAmount = decision.amountUsd / ethPrice;
    const ethWei    = parseEther(ethAmount.toFixed(6));
    const deadline  = BigInt(Math.floor(Date.now() / 1000) + 300);

    const txHash = await this.walletClient.writeContract({
      address:      this.routerAddress,
      abi:          ROUTER_ABI,
      functionName: "swapExactETHForTokens",
      args:         [BigInt(0), [this.wethAddress, this.usdcAddress], this.account.address, deadline],
      value:        ethWei,
    });

    logger.info(`   📤 TX: ${txHash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    return { txHash, action: decision.action, amountUsd: decision.amountUsd, timestamp: Date.now() };
  }

  // SELL: swap USDC → ETH
  private async sellForEth(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💰 SELL: swapping USDC → ETH ($${decision.amountUsd})`);
    const usdcAmount = parseUnits(decision.amountUsd.toFixed(2), 6);
    await this.ensureApproval(this.usdcAddress, usdcAmount);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const txHash   = await this.walletClient.writeContract({
      address:      this.routerAddress,
      abi:          ROUTER_ABI,
      functionName: "swapExactTokensForETH",
      args:         [usdcAmount, BigInt(0), [this.usdcAddress, this.wethAddress], this.account.address, deadline],
    });

    logger.info(`   📤 TX: ${txHash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    return { txHash, action: decision.action, amountUsd: decision.amountUsd, timestamp: Date.now() };
  }

  private async ensureApproval(token: `0x${string}`, amount: bigint): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: token, abi: ERC20_ABI, functionName: "allowance",
      args: [this.account.address, this.routerAddress],
    }) as bigint;

    if (allowance >= amount) { logger.info("   ✅ Allowance OK"); return; }

    logger.info("   🔓 Approving token spend...");
    const txHash = await this.walletClient.writeContract({
      address: token, abi: ERC20_ABI, functionName: "approve",
      args: [this.routerAddress, maxUint256],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("   ✅ Approved");
  }

  async getWalletAddress(): Promise<string> {
    return this.account?.address ?? "0x0000000000000000000000000000000000000000";
  }

  async getEthBalance(): Promise<string> {
    if (!this.account) return "0";
    const bal = await this.publicClient.getBalance({ address: this.account.address });
    return formatEther(bal);
  }

  private mockReceipt(decision: TradeDecision): TradeReceipt {
    return { txHash: `0xMOCK_${Date.now().toString(16)}`, action: decision.action, amountUsd: decision.amountUsd, timestamp: Date.now() };
  }
}