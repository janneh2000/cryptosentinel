import {
  createWalletClient, createPublicClient, http, encodeAbiParameters, parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { TradeReceipt } from "../executor/Executor";
import { TradeDecision } from "../brain/ClaudeBrain";
import { logger } from "../utils/logger";

// ─── TradeLog Smart Contract ABI ─────────────────────────────────────────────
// This is the ABI of our deployed TradeLog.sol contract
// Deploy it once and set TRADE_LOG_CONTRACT in .env
export const TRADE_LOG_ABI = [
  {
    name: "logTrade",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "action",     type: "string"  },
      { name: "amountUsd",  type: "uint256" },
      { name: "ethPrice",   type: "uint256" },
      { name: "confidence", type: "uint8"   },
      { name: "reasoning",  type: "string"  },
      { name: "txHash",     type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "TradeLogged",
    type: "event",
    inputs: [
      { name: "agent",      type: "address", indexed: true  },
      { name: "action",     type: "string",  indexed: false },
      { name: "amountUsd",  type: "uint256", indexed: false },
      { name: "ethPrice",   type: "uint256", indexed: false },
      { name: "confidence", type: "uint8",   indexed: false },
      { name: "reasoning",  type: "string",  indexed: false },
      { name: "txHash",     type: "bytes32", indexed: false },
      { name: "timestamp",  type: "uint256", indexed: false },
    ],
  },
  {
    name: "getTrades",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "action",     type: "string"  },
          { name: "amountUsd",  type: "uint256" },
          { name: "ethPrice",   type: "uint256" },
          { name: "confidence", type: "uint8"   },
          { name: "reasoning",  type: "string"  },
          { name: "txHash",     type: "bytes32" },
          { name: "timestamp",  type: "uint256" },
        ],
      },
    ],
  },
] as const;

// ─── Solidity source (deploy this to Base Sepolia) ───────────────────────────
export const TRADE_LOG_SOLIDITY = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CryptoSentinel TradeLog
/// @notice On-chain immutable record of all AI trading decisions
/// @dev Deployed on Base as part of The Synthesis hackathon submission
contract TradeLog {
    struct Trade {
        string  action;
        uint256 amountUsd;
        uint256 ethPrice;
        uint8   confidence;
        string  reasoning;
        bytes32 txHash;
        uint256 timestamp;
    }

    mapping(address => Trade[]) private trades;

    event TradeLogged(
        address indexed agent,
        string  action,
        uint256 amountUsd,
        uint256 ethPrice,
        uint8   confidence,
        string  reasoning,
        bytes32 txHash,
        uint256 timestamp
    );

    function logTrade(
        string  calldata action,
        uint256 amountUsd,
        uint256 ethPrice,
        uint8   confidence,
        string  calldata reasoning,
        bytes32 txHash
    ) external {
        Trade memory t = Trade({
            action:     action,
            amountUsd:  amountUsd,
            ethPrice:   ethPrice,
            confidence: confidence,
            reasoning:  reasoning,
            txHash:     txHash,
            timestamp:  block.timestamp
        });
        trades[msg.sender].push(t);
        emit TradeLogged(msg.sender, action, amountUsd, ethPrice, confidence, reasoning, txHash, block.timestamp);
    }

    function getTrades(address agent) external view returns (Trade[] memory) {
        return trades[agent];
    }

    function getTradeCount(address agent) external view returns (uint256) {
        return trades[agent].length;
    }
}
`;

export class OnChainTradeLog {
  private walletClient: any;
  private publicClient: any;
  private account: any;
  private contractAddress: `0x${string}` | null;
  private enabled: boolean;

  constructor() {
    const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
    const isSepolia  = process.env.CHAIN === "base-sepolia";
    const chain      = isSepolia ? baseSepolia : base;
    const rpcUrl     = process.env.RPC_URL || "https://sepolia.base.org";
    const contractAddr = process.env.TRADE_LOG_CONTRACT;

    this.contractAddress = contractAddr as `0x${string}` | null ?? null;
    this.enabled = !!(privateKey && privateKey !== "0x..." && this.contractAddress);

    if (!this.enabled) {
      logger.warn("📋 On-chain trade log disabled — set TRADE_LOG_CONTRACT in .env after deploying TradeLog.sol");
      return;
    }

    this.account      = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({ account: this.account, chain, transport: http(rpcUrl) });
    this.publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    logger.info(`📋 On-chain trade log enabled: ${this.contractAddress}`);
  }

  async log(receipt: TradeReceipt, decision: TradeDecision, ethPrice: number): Promise<string | null> {
    if (!this.enabled || !this.contractAddress) return null;

    try {
      logger.info("📋 Writing trade to on-chain log...");

      // Pad txHash to bytes32
      const txHashBytes = receipt.txHash.startsWith("0xMOCK")
        ? ("0x" + "0".repeat(64)) as `0x${string}`
        : receipt.txHash as `0x${string}`;

      const txHash = await this.walletClient.writeContract({
        address:      this.contractAddress,
        abi:          TRADE_LOG_ABI,
        functionName: "logTrade",
        args: [
          decision.action,
          BigInt(Math.round(decision.amountUsd * 100)), // store as cents
          BigInt(Math.round(ethPrice * 100)),
          decision.confidence,
          decision.reasoning,
          txHashBytes,
        ],
      });

      logger.info(`   ✅ Trade logged on-chain: ${txHash}`);
      return txHash;
    } catch (err: any) {
      logger.warn(`📋 On-chain log failed: ${err.message}`);
      return null;
    }
  }

  async getTradeHistory(agentAddress: string): Promise<any[]> {
    if (!this.enabled || !this.contractAddress) return [];
    try {
      return await this.publicClient.readContract({
        address:      this.contractAddress,
        abi:          TRADE_LOG_ABI,
        functionName: "getTrades",
        args:         [agentAddress as `0x${string}`],
      }) as any[];
    } catch {
      return [];
    }
  }
}