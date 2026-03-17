/**
 * Register CryptoSentinel with the ERC-8004 Identity Registry on Base Sepolia
 * 
 * Run: ts-node src/scripts/registerERC8004.ts
 * 
 * This gives CryptoSentinel a permanent onchain identity token
 * separate from The Synthesis registration.
 */

import dotenv from "dotenv";
dotenv.config();

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { logger } from "../utils/logger";

// ERC-8004 Identity Registry — same address on 20+ chains
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentURI", type: "string" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// Our agent registration JSON
const AGENT_REGISTRATION = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "CryptoSentinel",
  description:
    "Autonomous 24/7 crypto trading agent on Base chain. Uses Claude AI to analyze markets, execute trades via Uniswap V3, scan Base ecosystem tokens, and log every decision immutably onchain. Built for The Synthesis Hackathon.",
  image: "https://cryptosentinel-zeta.vercel.app/icon.png",
  services: [
    {
      name: "signals",
      endpoint: "http://localhost:3001/api/signals",
      version: "1.0.0",
      price: "0.10 USDC",
      protocol: "x402",
    },
    {
      name: "A2A",
      endpoint: "http://localhost:3001/.well-known/agent-card.json",
      version: "0.3.0",
    },
  ],
  x402Support: true,
  active: true,
  supportedTrust: ["reputation"],
  links: {
    dashboard: "https://cryptosentinel-zeta.vercel.app",
    github: "https://github.com/janneh2000/cryptosentinel",
    contract: "0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD",
  },
};

async function main() {
  const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
  if (!privateKey || privateKey === "0x...") {
    logger.error("❌ Set WALLET_PRIVATE_KEY in .env first");
    process.exit(1);
  }

  const account       = privateKeyToAccount(privateKey);
  const walletClient  = createWalletClient({ account, chain: baseSepolia, transport: http() });
  const publicClient  = createPublicClient({ chain: baseSepolia, transport: http() });

  logger.info(`🤖 Registering CryptoSentinel on ERC-8004 (Base Sepolia)`);
  logger.info(`   Wallet: ${account.address}`);
  logger.info(`   Registry: ${IDENTITY_REGISTRY}`);

  // Use a data URL since we don't have IPFS — works fine for hackathon
  const agentURI = `data:application/json,${encodeURIComponent(JSON.stringify(AGENT_REGISTRATION))}`;

  try {
    const txHash = await walletClient.writeContract({
      address:      IDENTITY_REGISTRY,
      abi:          REGISTRY_ABI,
      functionName: "register",
      args:         [agentURI, "0x"],
    });

    logger.info(`   📤 TX submitted: ${txHash}`);
    logger.info(`   ⏳ Waiting for confirmation...`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    logger.info(`   🔗 https://sepolia.basescan.org/tx/${txHash}`);
    logger.info(`   🎉 CryptoSentinel is now registered on ERC-8004!`);
    logger.info(`   Add this tx to your hackathon submission as an onchain artifact.`);

  } catch(e: any) {
    logger.error("Registration failed:", e.message);
  }
}

main();