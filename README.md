# ⚡ CryptoSentinel

> Autonomous 24/7 crypto trading agent on Base chain, powered by Claude AI.
> Built for The Synthesis Hackathon & PL_Genesis: Frontiers of Collaboration — March 2026.

**Live Dashboard:** [cryptosentinel-zeta.vercel.app](https://cryptosentinel-zeta.vercel.app)
**Demo Video:** [youtu.be/RZpKAPxMGlI](https://youtu.be/RZpKAPxMGlI)
**On-chain Contract:** [0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD](https://sepolia.basescan.org/address/0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD)

---

## What It Does

CryptoSentinel monitors crypto markets around the clock, reasons about signals using Claude AI, manages risk automatically, and executes trades on Base chain via Uniswap V3 — all without human intervention.

**Agent loop (every 5 minutes):**
1. 📡 Fetch live market data — ETH/BTC via Binance API, Fear & Greed index
2. 🔍 Scan Base ecosystem tokens — AERO, BRETT, DEGEN, TOSHI via DexScreener
3. 🧠 Claude Sonnet analyzes all signals and decides: BUY / SELL / HOLD
4. 🛡️ Risk Guard enforces stop-loss, cooldowns, position sizing
5. ⚡ Executor sends the trade onchain via Uniswap V3 on Base Sepolia
6. 📱 Telegram notification sent to operator
7. 📋 Trade permanently logged to TradeLog.sol onchain
8. 📡 x402 signal server updated — other agents can pay 0.10 USDC to receive the signal

---

## Live Stats

- **111+ trades** executed autonomously over 4 days
- **0 human interventions** required for trading decisions
- **5 tools** orchestrated per cycle
- **$0** real funds at risk — Base Sepolia testnet

---

## Architecture

```
MarketWatcher → TokenScanner → ClaudeBrain → RiskGuard → Executor → TradeLog
     ↓               ↓              ↓            ↓           ↓          ↓
  Binance API    DexScreener    Claude AI    Stop-Loss    Uniswap V3  Base Sepolia
  Fear&Greed                   Sonnet 4.6   Cooldown     SwapRouter   Contract
                                                ↓
                                          x402 Signal Server
                                          (0.10 USDC/call)
```

---

## x402 Signal API

CryptoSentinel exposes Claude's trading analysis as a paid HTTP endpoint — agent-to-agent commerce on Base:

```bash
# Free preview (no payment needed)
curl http://localhost:3001/api/preview

# Full signal — returns 402 Payment Required with USDC payment instructions
curl http://localhost:3001/api/signals

# After paying 0.10 USDC on Base Sepolia:
curl http://localhost:3001/api/signals \
  -H "X-Payment-Tx: 0xYOUR_TX_HASH"

# Agent discovery card (ERC-8004 compatible)
curl http://localhost:3001/.well-known/agent-card.json
```

---

## Onchain Artifacts

| Artifact | Network | Link |
|---|---|---|
| TradeLog Contract | Base Sepolia | [0xA40E8DA38760...](https://sepolia.basescan.org/address/0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD#events) |
| ERC-8004 Direct Registration | Base Sepolia | [0x2fac686e...](https://sepolia.basescan.org/tx/0x2fac686e9217a0936e88ff5387f75b232ff1409ca9c14c5bece51531d6ecc500) |
| Synthesis ERC-8004 Registration | Base Mainnet | [0xebabc0c0...](https://basescan.org/tx/0xebabc0c09521b346859eec22c19cff27c691f104b76a50849202bc19674fb9c9) |
| ERC-8004 Self-Custody Transfer | Base Mainnet | [0x23a63384...](https://basescan.org/tx/0x23a63384cdd1635ad7fe145b9d4e431341ff57bd348d6481c5ca3043d16836fe) |
| Trading Wallet | Base Sepolia | [0xdCA68E19...](https://sepolia.basescan.org/address/0xdCA68E190D47B62E330C9DEb634103A6479eC4fA) |

---

## Agent Manifests

- [`agent.json`](./agent.json) — DevSpot Agent Manifest (capabilities, ERC-8004 identity, tools, compute constraints)
- [`agent_log.json`](./agent_log.json) — Structured execution log (decisions, tool calls, errors, self-corrections)

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript / Node.js |
| AI Brain | Claude claude-sonnet-4-6 (Anthropic SDK) |
| Blockchain | viem, Base Sepolia |
| DEX | Uniswap V3 SwapRouter02 |
| Price Feed | Binance Public API |
| Token Scanner | DexScreener API |
| Notifications | Telegram Bot API |
| Onchain Log | TradeLog.sol (Solidity 0.8.20) |
| Signal API | Express + x402 protocol |
| Dashboard | Vanilla JS + Chart.js + ethers.js (Vercel) |
| Identity | ERC-8004 Identity Registry |

---

## Quickstart

```bash
git clone https://github.com/janneh2000/cryptosentinel
cd cryptosentinel
npm install
cp .env.example .env
# Add: ANTHROPIC_API_KEY, WALLET_PRIVATE_KEY, TELEGRAM_BOT_TOKEN
npm run dev
```

---

## Safety Guardrails

- Minimum 60% confidence before any trade
- Max 2% portfolio risk per ETH trade, 1% per altcoin
- 5-minute cooldown between same-asset trades
- Stop-loss auto-trigger at 5% drawdown
- Portfolio drawdown protection at 10%
- All errors default to HOLD — never panic sell

---

## Completed Features

- [x] Live market data (Binance API + Fear & Greed)
- [x] Claude AI reasoning layer (claude-sonnet-4-6)
- [x] Base ecosystem token scanner (DexScreener)
- [x] Risk Guard — stop-loss, cooldowns, position sizing
- [x] Uniswap V3 swap execution on Base
- [x] Telegram trade notifications
- [x] TradeLog.sol — immutable onchain trade history (111+ trades)
- [x] Live dashboard on Vercel
- [x] x402 signal server — pay-per-signal API
- [x] ERC-8004 identity registration (Base Sepolia + Mainnet)
- [x] ERC-8004 self-custody confirmed
- [x] agent.json + agent_log.json DevSpot manifests

---

## License

MIT — open source as required by hackathon rules.

---

Built with ⚡ by Alie Janneh (@cjanneh2000) + Claude AI · March 2026