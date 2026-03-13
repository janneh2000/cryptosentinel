# 🤖 CryptoSentinel

> Autonomous 24/7 crypto trading agent on Base chain, powered by Claude AI.  
> Built for [The Synthesis Hackathon](https://synthesis.md) — March 2026.

---

## What It Does

CryptoSentinel monitors crypto markets around the clock, reasons about signals using Claude, manages risk automatically, and executes trades on Base chain via Aerodrome DEX — all without human intervention.

**Agent loop (every 60s by default):**
1. 📡 Fetch live market data (ETH price, BTC trend, Fear & Greed index)
2. 🧠 Claude analyzes the data and decides: BUY / SELL / HOLD
3. 🛡️ Risk Guard enforces position sizing and stop-loss rules
4. ⚡ Executor sends the trade on-chain via Aerodrome on Base

---

## Quickstart

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your ANTHROPIC_API_KEY and WALLET_PRIVATE_KEY
```

### 3. Run in dev mode (dry run — no real trades)
```bash
npm run dev
```

### 4. Build and run
```bash
npm run build && npm start
```

---

## Project Structure

```
src/
├── index.ts              # Entry point
├── agent/
│   └── Agent.ts          # Main orchestration loop
├── market/
│   └── MarketWatcher.ts  # CoinGecko price feeds + Fear & Greed
├── brain/
│   └── ClaudeBrain.ts    # Claude AI reasoning layer
├── risk/
│   └── RiskGuard.ts      # Risk rules enforcement
├── executor/
│   └── Executor.ts       # On-chain trade execution (Aerodrome/Base)
└── utils/
    ├── Portfolio.ts       # Wallet balance tracker
    └── logger.ts          # Winston logger
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
- [ ] Aerodrome DEX swap integration
- [ ] Stop-loss auto-trigger
- [ ] Telegram/Discord trade notifications
- [ ] On-chain trade history log

---

## License

MIT — open source as required by The Synthesis hackathon rules.
