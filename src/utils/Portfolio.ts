import { createPublicClient, http, formatEther } from "viem";
import { base, baseSepolia } from "viem/chains";

export interface PortfolioState {
  totalValueUsd: number;
  ethBalance: number;
  ethValueUsd: number;
  usdcBalance: number;
  maxRiskUsd: number;
}

// USDC ABI (just balanceOf)
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export class Portfolio {
  private publicClient;
  private maxRiskPerTrade: number;

  constructor() {
    const chain = process.env.CHAIN === "base-sepolia" ? baseSepolia : base;
    const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    this.maxRiskPerTrade = parseFloat(process.env.MAX_RISK_PER_TRADE || "0.02");
  }

  async getState(walletAddress?: string): Promise<PortfolioState> {
    // Mock state if no wallet configured
    if (!walletAddress || walletAddress === "0x0000000000000000000000000000000000000000") {
      return this.mockState();
    }

    try {
      const [ethBalanceWei, usdcRaw] = await Promise.all([
        this.publicClient.getBalance({ address: walletAddress as `0x${string}` }),
        this.publicClient.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [walletAddress as `0x${string}`],
        }),
      ]);

      // These will be calculated with real ETH price from MarketWatcher in a real integration
      const ethBalance = parseFloat(formatEther(ethBalanceWei));
      const usdcBalance = Number(usdcRaw) / 1e6;

      // Placeholder ETH price — in production, pass from MarketWatcher
      const ethPrice = 3000;
      const ethValueUsd = ethBalance * ethPrice;
      const totalValueUsd = ethValueUsd + usdcBalance;

      return {
        totalValueUsd,
        ethBalance,
        ethValueUsd,
        usdcBalance,
        maxRiskUsd: totalValueUsd * this.maxRiskPerTrade,
      };
    } catch {
      return this.mockState();
    }
  }

  private mockState(): PortfolioState {
    const total = 1000;
    return {
      totalValueUsd: total,
      ethBalance: 0.1,
      ethValueUsd: 300,
      usdcBalance: 700,
      maxRiskUsd: total * this.maxRiskPerTrade,
    };
  }
}
