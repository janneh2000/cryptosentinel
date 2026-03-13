import dotenv from "dotenv";
dotenv.config();

import { CryptoSentinelAgent } from "./agent/Agent";
import { logger } from "./utils/logger";

async function main() {
  logger.info("🚀 CryptoSentinel starting up...");
  logger.info("⛓️  Target chain: Base");
  logger.info("🤖 AI brain: Claude claude-sonnet-4-6");

  const agent = new CryptoSentinelAgent();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("🛑 Shutting down CryptoSentinel...");
    await agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("🛑 Shutting down CryptoSentinel...");
    await agent.stop();
    process.exit(0);
  });

  await agent.start();
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
