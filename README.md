# ⚡ CryptoSentinel

> Autonomous 24/7 crypto trading agent on Base chain, powered by Claude AI.  
> Built for [The Synthesis Hackathon](https://synthesis.md) — March 2026.

**Live Dashboard:** [cryptosentinel-zeta.vercel.app](https://cryptosentinel-zeta.vercel.app)  
**On-chain Contract:** [0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD](https://sepolia.basescan.org/address/0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD)

---

## What It Does

CryptoSentinel monitors crypto markets around the clock, reasons about signals using Claude AI, manages risk automatically, and executes trades on Base chain via Uniswap V3 — all without human intervention.

**Agent loop (every 60s):**
1. 📡 Fetch live market data (ETH price, BTC trend, Fear & Greed index)
2. 🧠 Claude analyzes the data and decides: BUY / SELL / HOLD
3. 🛡️ Risk Guard enforces position sizing and confidence thresholds
4. ⚡ Executor sends the trade on-chain via Uniswap V3 on Base
5. 📱 Telegram notification sent to operator
6. 📋 Trade permanently logged to on-chain TradeLog contract

---

## Quickstart

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your ANTHROPIC_API_KEY, WALLET_PRIVATE_KEY, TELEGRAM_BOT_TOKEN
```

### 3. Run in dev mode
```bash
npm run dev
```

---

## Project Structure

```
src/
├── index.ts                    # Entry point
├── agent/
│   └── Agent.ts                # Main orchestration loop
├── market/
│   └── MarketWatcher.ts        # CoinGecko price feeds + Fear & Greed
├── brain/
│   └── ClaudeBrain.ts          # Claude AI reasoning layer
├── risk/
│   └── RiskGuard.ts            # Risk rules enforcement
├── executor/
│   └── Executor.ts             # Uniswap V3 trade execution on Base
├── notifications/
│   └── TelegramNotifier.ts     # Real-time Telegram trade alerts
├── onchain/
│   └── TradeLog.ts             # On-chain immutable trade history
└── utils/
    ├── Portfolio.ts             # Wallet balance tracker
    └── logger.ts               # Winston logger
index.html                      # Live dashboard (deployed on Vercel)
vercel.json                     # Vercel static deployment config
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key |
| `WALLET_PRIVATE_KEY` | — | Dedicated trading wallet private key |
| `RPC_URL` | `https://sepolia.base.org` | Base RPC endpoint |
| `CHAIN` | `base-sepolia` | `base-sepolia` or `base` |
| `POLL_INTERVAL_MS` | `60000` | Market check frequency |
| `MAX_RISK_PER_TRADE` | `0.02` | Max % of portfolio per trade |
| `STOP_LOSS_THRESHOLD` | `0.05` | Stop-loss trigger % |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID |
| `TRADE_LOG_CONTRACT` | — | Deployed TradeLog.sol address |

---

## ⚠️ Security

- **Never use your main wallet.** Create a dedicated wallet with only what you're willing to lose.
- **Never commit `.env`** — it's in `.gitignore`.
- Start on **Base Sepolia testnet** before using real funds.

---

## Roadmap

- [x] Market data fetching (CoinGecko + Fear & Greed)
- [x] Claude AI reasoning layer
- [x] Risk Guard (position sizing, confidence threshold)
- [x] Portfolio state tracking
- [x] Uniswap V3 swap integration on Base
- [x] Telegram trade notifications
- [x] On-chain trade history log (TradeLog.sol)
- [x] Live dashboard deployed on Vercel
- [ ] Stop-loss auto-trigger
- [ ] Multi-token support (Base ecosystem altcoins + memecoins)
- [ ] Historical P&L analytics

---

## On-Chain Artifacts

| Artifact | Network | Address / TX |
|---|---|---|
| ERC-8004 Agent Identity | Base Mainnet | [View on Basescan](https://basescan.org/tx/0xebabc0c09521b346859eec22c19cff27c691f104b76a50849202bc19674fb9c9) |
| TradeLog.sol Contract | Base Sepolia | [0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD](https://sepolia.basescan.org/address/0xA40E8DA38760eAf987eF85CD00b28319F11c4CAD) |

---

## License

MIT — open source as required by The Synthesis hackathon rules.