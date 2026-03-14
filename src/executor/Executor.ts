import {
  createWalletClient, createPublicClient, http,
  parseEther, parseUnits, formatEther, maxUint256, encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { TradeDecision } from "../brain/ClaudeBrain";
import { logger } from "../utils/logger";

export interface TradeReceipt {
  txHash: string; action: string; amountUsd: number;
  amountToken: string; timestamp: number; blockNumber?: bigint;
}

// Uniswap V3 SwapRouter02 — same address on Base mainnet
const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as const;
const WETH_BASE      = "0x4200000000000000000000000000000000000006" as const;
const USDC_BASE      = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const WETH_SEPOLIA   = "0x4200000000000000000000000000000000000006" as const;
const USDC_SEPOLIA   = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const POOL_FEE       = 500; // 0.05% — most liquid ETH/USDC pool on Base

const ROUTER_ABI = [
  { name: "exactInputSingle", type: "function", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "tokenIn",           type: "address" },
      { name: "tokenOut",          type: "address" },
      { name: "fee",               type: "uint24"  },
      { name: "recipient",         type: "address" },
      { name: "amountIn",          type: "uint256" },
      { name: "amountOutMinimum",  type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ]}],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  { name: "multicall", type: "function", stateMutability: "payable",
    inputs: [{ name: "deadline", type: "uint256" }, { name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

const ERC20_ABI = [
  { name: "approve",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount",  type: "uint256" }], outputs: [{ name: "", type: "bool"    }] },
  { name: "allowance", type: "function", stateMutability: "view",       inputs: [{ name: "owner",   type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }],                                       outputs: [{ name: "", type: "uint256" }] },
] as const;

export class Executor {
  private walletClient: any;
  private publicClient: any;
  private account: any;
  private isDryRun: boolean;
  private isSepolia: boolean;
  private wethAddress: `0x${string}`;
  private usdcAddress: `0x${string}`;

  constructor() {
    const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    this.isSepolia   = process.env.CHAIN === "base-sepolia";
    const chain      = this.isSepolia ? baseSepolia : base;
    const rpcUrl     = process.env.RPC_URL || "https://sepolia.base.org";
    this.wethAddress = this.isSepolia ? WETH_SEPOLIA : WETH_BASE;
    this.usdcAddress = this.isSepolia ? USDC_SEPOLIA : USDC_BASE;
    this.isDryRun    = !privateKey || privateKey === "0x...";

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
    if (this.isDryRun || this.isSepolia) {
      if (this.isSepolia) logger.info("🧪 Testnet — simulating Uniswap V3 swap");
      return this.mockReceipt(decision);
    }
    if (decision.action === "BUY")  return this.swapEthForUsdc(decision);
    if (decision.action === "SELL") return this.swapUsdcForEth(decision);
    throw new Error(`Unknown action: ${decision.action}`);
  }

  // BUY: send ETH → receive USDC via Uniswap V3
  private async swapEthForUsdc(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💸 Uniswap V3 BUY: ETH → USDC ($${decision.amountUsd})`);
    const ethPrice  = (decision as any).ethPrice ?? 2135;
    const ethWei    = parseEther((decision.amountUsd / ethPrice).toFixed(8));
    const deadline  = BigInt(Math.floor(Date.now() / 1000) + 300);

    const swapData = encodeFunctionData({
      abi: ROUTER_ABI, functionName: "exactInputSingle",
      args: [{ tokenIn: this.wethAddress, tokenOut: this.usdcAddress, fee: POOL_FEE,
               recipient: this.account.address, amountIn: ethWei,
               amountOutMinimum: BigInt(0), sqrtPriceLimitX96: BigInt(0) }],
    });

    const txHash = await this.walletClient.writeContract({
      address: UNISWAP_ROUTER, abi: ROUTER_ABI, functionName: "multicall",
      args: [deadline, [swapData]], value: ethWei,
    });

    logger.info(`   📤 TX: ${txHash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`   ✅ Block ${receipt.blockNumber}`);
    return { txHash, action: decision.action, amountUsd: decision.amountUsd, amountToken: `${(decision.amountUsd / ethPrice).toFixed(6)} ETH`, timestamp: Date.now(), blockNumber: receipt.blockNumber };
  }

  // SELL: send USDC → receive ETH via Uniswap V3
  private async swapUsdcForEth(decision: TradeDecision): Promise<TradeReceipt> {
    logger.info(`💰 Uniswap V3 SELL: USDC → ETH ($${decision.amountUsd})`);
    const usdcAmount = parseUnits(decision.amountUsd.toFixed(2), 6);
    await this.ensureApproval(this.usdcAddress, usdcAmount);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

    const txHash = await this.walletClient.writeContract({
      address: UNISWAP_ROUTER, abi: ROUTER_ABI, functionName: "exactInputSingle",
      args: [{ tokenIn: this.usdcAddress, tokenOut: this.wethAddress, fee: POOL_FEE,
               recipient: this.account.address, amountIn: usdcAmount,
               amountOutMinimum: BigInt(0), sqrtPriceLimitX96: BigInt(0) }],
    });

    logger.info(`   📤 TX: ${txHash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`   ✅ Block ${receipt.blockNumber}`);
    return { txHash, action: decision.action, amountUsd: decision.amountUsd, amountToken: `${decision.amountUsd} USDC`, timestamp: Date.now(), blockNumber: receipt.blockNumber };
  }

  private async ensureApproval(token: `0x${string}`, amount: bigint): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: token, abi: ERC20_ABI, functionName: "allowance",
      args: [this.account.address, UNISWAP_ROUTER],
    }) as bigint;
    if (allowance >= amount) { logger.info("   ✅ Allowance OK"); return; }
    logger.info("   🔓 Approving USDC for Uniswap V3...");
    const tx = await this.walletClient.writeContract({
      address: token, abi: ERC20_ABI, functionName: "approve", args: [UNISWAP_ROUTER, maxUint256],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: tx });
    logger.info("   ✅ Approved");
  }

  async getWalletAddress(): Promise<string> { return this.account?.address ?? "0x0000000000000000000000000000000000000000"; }
  async getEthBalance(): Promise<string> {
    if (!this.account) return "0";
    return formatEther(await this.publicClient.getBalance({ address: this.account.address }));
  }

  private mockReceipt(decision: TradeDecision): TradeReceipt {
    return { txHash: `0xMOCK_${Date.now().toString(16)}`, action: decision.action, amountUsd: decision.amountUsd, amountToken: "SIMULATED", timestamp: Date.now() };
  }
}