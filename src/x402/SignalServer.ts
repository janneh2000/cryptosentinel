import express, { Request, Response } from "express";
import { createPublicClient, http, parseUnits, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { logger } from "../utils/logger";

// ─── x402 Signal Server ───────────────────────────────────────────────────────
// Exposes CryptoSentinel's AI trading signals as a paid HTTP endpoint.
// Any agent can pay $0.10 USDC to get Claude's current market analysis.
//
// Implements a simplified x402 payment flow:
//   1. GET /api/signals → 402 Payment Required (with payment details)
//   2. Agent pays USDC onchain, gets tx hash
//   3. GET /api/signals?paymentTx=0x... → 200 OK (signal data)
//
// Full x402 spec: https://www.x402.org
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_PRICE_USDC  = "0.10";  // $0.10 per signal
const PAYMENT_RECIPIENT  = process.env.WALLET_ADDRESS || "0xdCA68E190D47B62E330C9DEb634103A6479eC4fA";
const USDC_SEPOLIA        = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PAYMENT_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes to pay

// Track verified payments to prevent replay attacks
const verifiedPayments = new Set<string>();
const pendingPayments  = new Map<string, number>(); // txHash → timestamp

// Latest signal cache — updated by the main agent loop
export let latestSignal: SignalData | null = null;

export interface SignalData {
  timestamp:     number;
  action:        "BUY" | "SELL" | "HOLD";
  asset:         string;
  confidence:    number;
  reasoning:     string;
  signals:       string[];
  ethPrice:      number;
  fearGreed:     number;
  topTokens: {
    symbol:  string;
    score:   number;
    price:   number;
    vol24h:  number;
    change1h: number;
  }[];
  priceTarget?:  number;
  stopLoss?:     number;
}

export function updateLatestSignal(signal: SignalData) {
  latestSignal = signal;
  logger.info(`📡 x402 signal updated: ${signal.action} ${signal.asset} @ ${signal.confidence}% confidence`);
}

// ─── Payment Verification ─────────────────────────────────────────────────────
async function verifyPayment(txHash: string): Promise<boolean> {
  if (verifiedPayments.has(txHash)) {
    logger.warn(`x402: replay attempt with ${txHash}`);
    return false;
  }

  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.RPC_URL || "https://sepolia.base.org"),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (!receipt || receipt.status !== "success") {
      logger.warn(`x402: tx ${txHash} not confirmed`);
      return false;
    }

    // Check tx is recent (within 10 minutes)
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const txAge = Date.now() - Number(block.timestamp) * 1000;
    if (txAge > PAYMENT_WINDOW_MS) {
      logger.warn(`x402: tx ${txHash} too old (${Math.round(txAge/60000)}min)`);
      return false;
    }

    // Mark as used
    verifiedPayments.add(txHash);
    logger.info(`x402: payment verified ${txHash}`);
    return true;
  } catch(e: any) {
    logger.warn(`x402: payment verification failed: ${e.message}`);
    return false;
  }
}

// ─── Express Server ───────────────────────────────────────────────────────────
export function startSignalServer(port = 3001) {
  const app = express();
  app.use(express.json());

  // CORS for dashboard and external agents
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Payment-Tx");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // ── Health check (free) ──────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      status: "live",
      agent:  "CryptoSentinel",
      model:  "claude-sonnet-4-6",
      chain:  "base-sepolia",
      signalAge: latestSignal
        ? Math.round((Date.now() - latestSignal.timestamp) / 1000) + "s"
        : "no signal yet",
    });
  });

  // ── Agent card (ERC-8004 / A2A discovery, free) ──────────────────────────
  app.get("/.well-known/agent-card.json", (_req, res) => {
    res.json({
      name:        "CryptoSentinel",
      description: "Autonomous 24/7 crypto trading agent on Base chain. Powered by Claude AI. Provides real-time market signals via x402 micropayments.",
      version:     "1.0.0",
      url:         "https://cryptosentinel-zeta.vercel.app",
      services: [
        {
          name:     "signals",
          endpoint: `http://localhost:${port}/api/signals`,
          price:    `${SIGNAL_PRICE_USDC} USDC`,
          protocol: "x402",
          network:  "eip155:84532", // Base Sepolia
        }
      ],
      x402Support:    true,
      active:         true,
      supportedTrust: ["reputation"],
      erc8004: {
        registrationTxn: "https://basescan.org/tx/0xebabc0c09521b346859eec22c19cff27c691f104b76a50849202bc19674fb9c9",
        chain: "base-mainnet",
      },
    });
  });

  // ── Signals endpoint (x402 gated) ────────────────────────────────────────
  app.get("/api/signals", async (req: Request, res: Response) => {
    const paymentTx = req.headers["x-payment-tx"] as string || req.query.paymentTx as string;

    // No payment provided → 402 Payment Required
    if (!paymentTx) {
      logger.info("x402: 402 response sent to agent");
      return res.status(402).json({
        error:    "Payment Required",
        protocol: "x402",
        payment: {
          scheme:  "exact",
          network: "eip155:84532",
          amount:  parseUnits(SIGNAL_PRICE_USDC, 6).toString(),
          token:   USDC_SEPOLIA,
          to:      PAYMENT_RECIPIENT,
          description: `CryptoSentinel market signal — Claude AI analysis of ETH + Base tokens`,
        },
        instructions: [
          `1. Send ${SIGNAL_PRICE_USDC} USDC to ${PAYMENT_RECIPIENT} on Base Sepolia`,
          `2. Include the tx hash in the X-Payment-Tx header or ?paymentTx= query param`,
          `3. Re-request this endpoint`,
        ],
        links: {
          dashboard: "https://cryptosentinel-zeta.vercel.app",
          contract:  "https://sepolia.basescan.org/address/0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD",
          github:    "https://github.com/janneh2000/cryptosentinel",
        },
      });
    }

    // Payment provided → verify
    const valid = await verifyPayment(paymentTx);
    if (!valid) {
      return res.status(402).json({
        error:   "Payment invalid, expired, or already used",
        paymentTx,
      });
    }

    // Return signal
    if (!latestSignal) {
      return res.status(503).json({ error: "No signal available yet — agent is warming up" });
    }

    logger.info(`x402: signal delivered for tx ${paymentTx}`);
    return res.json({
      ...latestSignal,
      generatedBy: "CryptoSentinel · Claude claude-sonnet-4-6",
      paidVia:     "x402",
      paymentTx,
    });
  });

  // ── Latest signal preview (free, limited) ────────────────────────────────
  app.get("/api/preview", (_req, res) => {
    if (!latestSignal) {
      return res.json({ status: "warming up" });
    }
    // Return only non-actionable data for free
    res.json({
      timestamp:   latestSignal.timestamp,
      action:      "REDACTED — pay $0.10 USDC to unlock",
      ethPrice:    latestSignal.ethPrice,
      fearGreed:   latestSignal.fearGreed,
      signalCount: latestSignal.signals.length,
      priceToUnlock: `${SIGNAL_PRICE_USDC} USDC`,
      endpoint:    "/api/signals",
      protocol:    "x402",
    });
  });

  app.listen(port, () => {
    logger.info(`📡 x402 Signal Server running on port ${port}`);
    logger.info(`   Health:   http://localhost:${port}/health`);
    logger.info(`   Signals:  http://localhost:${port}/api/signals (${SIGNAL_PRICE_USDC} USDC/call)`);
    logger.info(`   Preview:  http://localhost:${port}/api/preview (free)`);
    logger.info(`   A2A Card: http://localhost:${port}/.well-known/agent-card.json`);
  });

  return app;
}