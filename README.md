⚠️ **Warning:** This software is provided for educational and informational purposes only. Nothing in this repository constitutes financial, investment, legal, or tax advice.

# MAHORAGA

An autonomous, LLM-powered trading agent that runs 24/7 on Cloudflare Workers.

[![Discord](https://img.shields.io/discord/1467592472158015553?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/vMFnHe2YBh)

MAHORAGA monitors social sentiment from StockTwits and Reddit, ingests optional Polygon news catalysts, uses AI (OpenAI, Anthropic, Google, xAI, DeepSeek via AI SDK) to analyze signals, and executes trades through Alpaca. It runs as a Cloudflare Durable Object with persistent state, automatic restarts, and 24/7 crypto trading support.

<img width="1278" height="957" alt="dashboard" src="https://github.com/user-attachments/assets/56473ab6-e2c6-45fc-9e32-cf85e69f1a2d" />

## Features

- **24/7 Operation** — Runs on Cloudflare Workers, no local machine required
- **Multi-Source Signals** — StockTwits, Reddit (4 subreddits), optional Polygon news, Twitter confirmation
- **Actionable Symbol Filtering** — LLM research and trade decisions run only on symbols with valid Alpaca tradability + price
- **Multi-Provider LLM** — OpenAI, Anthropic, Google, xAI, DeepSeek via AI SDK or Cloudflare AI Gateway
- **Crypto Trading** — Trade BTC, ETH, SOL around the clock
- **Options Support** — High-conviction options plays
- **Staleness Detection** — Auto-exit positions that lose momentum
- **Pre-Market Analysis** — Prepare trading plans before market open
- **Discord Notifications** — Get alerts on BUY signals
- **Pluggable Strategy System** — Create custom strategies without touching core files

## Requirements

- Node.js 18+
- Cloudflare account (free tier works)
- Alpaca account (free, paper trading supported)
- LLM API key (OpenAI, Anthropic, Google, xAI, DeepSeek) or Cloudflare AI Gateway credentials

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ygwyg/MAHORAGA.git
cd mahoraga
npm install
```

### 2. Create Cloudflare resources

```bash
# Create D1 database
npx wrangler d1 create mahoraga-db
# Copy the database_id to wrangler.jsonc

# Create KV namespace
npx wrangler kv namespace create CACHE
# Copy the id to wrangler.jsonc

# Run migrations
npx wrangler d1 migrations apply mahoraga-db
```

### 3. Set secrets

```bash
# Required
npx wrangler secret put ALPACA_API_KEY
npx wrangler secret put ALPACA_API_SECRET

# API Authentication - generate a secure random token (64+ chars recommended)
# Example: openssl rand -base64 48
npx wrangler secret put MAHORAGA_API_TOKEN

# LLM Provider (choose one mode)
npx wrangler secret put LLM_PROVIDER  # "openai-raw" (default), "ai-sdk", or "cloudflare-gateway"
npx wrangler secret put LLM_MODEL     # e.g. "gpt-4o-mini" or "anthropic/claude-sonnet-4"

# LLM API Keys (based on provider mode)
npx wrangler secret put OPENAI_API_KEY         # For openai-raw or ai-sdk with OpenAI
npx wrangler secret put OPENAI_BASE_URL        # Optional: override OpenAI base URL for openai-raw and ai-sdk (OpenAI models)
# npx wrangler secret put ANTHROPIC_API_KEY    # For ai-sdk with Anthropic
# npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY  # For ai-sdk with Google
# npx wrangler secret put XAI_API_KEY          # For ai-sdk with xAI/Grok
# npx wrangler secret put DEEPSEEK_API_KEY     # For ai-sdk with DeepSeek
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID  # For cloudflare-gateway
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_ID          # For cloudflare-gateway
# npx wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN       # For cloudflare-gateway

# Optional
npx wrangler secret put ALPACA_PAPER         # "true" for paper trading (recommended)
npx wrangler secret put TWITTER_BEARER_TOKEN
npx wrangler secret put POLYGON_API_KEY      # Optional: enables polygon_news gatherer
npx wrangler secret put UNUSUAL_WHALES_API_KEY  # Optional: enables options_flow gatherer
npx wrangler secret put FMP_API_KEY             # Optional: enables congressional gatherer
npx wrangler secret put GOVCON_API_KEY          # Optional: enables contract_awards gatherer
# Free-tier signal bundle (optional; enable via config toggles — all off by default)
npx wrangler secret put FINNHUB_API_KEY         # Optional: enables finnhub_bundle gatherer (market news)
npx wrangler secret put FRED_API_KEY            # Optional: enables fred_macro gatherer (SPY/QQQ macro bias)
# Crypto Fear & Greed (alternative.me) uses no API key — enable with crypto_fng_enabled only
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put KILL_SWITCH_SECRET   # Emergency kill switch (separate from API token)
```

**Free-tier bundle (quota-safe):** Use KV-backed caching (`CACHE` binding) and conservative TTLs: **F&G** ~900–1800s, **Finnhub** ~180–300s, **FRED** ~1–6h. **Staged activation:** (1) `crypto_fng_enabled` only → run an experiment snapshot; (2) add `finnhub_enabled` + Finnhub key → snapshot; (3) add `fred_enabled` + FRED key → snapshot. On HTTP **429**, gatherers backoff with jitter and fall back to cached JSON when available; otherwise they emit no signals (no cycle-breaking throws). Tune TTLs if you see repeated rate limits.

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Enable the agent

All API endpoints require authentication via Bearer token:

```bash
# Set your API token as an env var for convenience
export MAHORAGA_TOKEN="your-api-token"

# Enable the agent
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/enable
```

### 6. Monitor

```bash
# Check status
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/status

# View logs
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/logs

# Emergency kill switch (uses separate KILL_SWITCH_SECRET)
curl -H "Authorization: Bearer $KILL_SWITCH_SECRET" \
  https://mahoraga.bernardoalmeida2004.workers.dev/agent/kill

# Run dashboard locally
cd dashboard && npm install && npm run dev
```

## Local Development

```bash
# Terminal 1 - Start wrangler
npx wrangler dev

# Terminal 2 - Start dashboard  
cd dashboard && npm run dev

# Terminal 3 - Enable the agent
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  http://localhost:8787/agent/enable
```

## Hosted Dashboard (Phone + Anywhere)

The dashboard (main monitoring + experiments panel) can be hosted on Cloudflare Pages and secured with Cloudflare Access.

### 1) Configure production API base

Use [`dashboard/env.example`](dashboard/env.example) as reference:

```bash
VITE_MAHORAGA_API_BASE=https://your-worker-subdomain.workers.dev/agent
```

In Cloudflare Pages project settings, set:
- variable: `VITE_MAHORAGA_API_BASE`
- value: your Worker URL ending in `/agent`

Keep local dev unchanged (`/api` proxy in `vite.config.ts`).

### 2) Deploy to Cloudflare Pages

Recommended Pages settings:
- Root directory: `dashboard`
- Build command: `npm run build`
- Build output directory: `dist`

Optional `wrangler` Pages config is included at [`dashboard/wrangler.toml`](dashboard/wrangler.toml).
SPA fallback redirect is included at [`dashboard/public/_redirects`](dashboard/public/_redirects).

#### Worker vs Pages (two separate deploys)

- **`npx wrangler deploy` (repo root)** publishes the **Worker API** only (`src/`).
- **Cloudflare Pages** publishes the **React dashboard** (`dashboard/dist`).

Updating the Worker does **not** update the hosted UI, and vice versa. Plan releases as **two steps** unless you automate both (see below).

#### Why `VITE_MAHORAGA_API_BASE` must exist at **build** time

Vite inlines `VITE_*` variables when it runs **`npm run build`**. If the variable is missing, the bundle falls back to `/api` (fine for **local** `npm run dev` with the Vite proxy; **wrong** on static Pages).

- **Git-connected Pages:** set `VITE_MAHORAGA_API_BASE` under **Settings → Environment variables** for **Preview** and **Production**, then let Cloudflare run `npm run build`. Each environment has its own values—Preview builds do **not** use Production-only vars.
- **Manual deploy from your laptop:** setting the variable in the Cloudflare UI does **not** affect a bundle you built locally. You must export it **before** `npm run build`, then upload `dist`:

```bash
cd dashboard
export VITE_MAHORAGA_API_BASE="https://<your-worker>.workers.dev/agent"
npm run build
npx wrangler pages deploy dist --project-name <your-pages-project> --branch=main
```

(Use `dist` as the path when your shell’s cwd is `dashboard/`; from repo root the directory is `dashboard/dist`.)

Sanity check: search the built `dist/assets/index-*.js` for your `workers.dev` host—if it’s absent, the build did not see the variable.

#### Troubleshooting: OFFLINE / “Hosted build missing API URL”

1. Confirm **Preview** and **Production** both have `VITE_MAHORAGA_API_BASE` if you use both URLs.
2. **Redeploy after** changing env vars (new build required).
3. Hard-refresh or use a private window (old JS may be cached).
4. **API token:** Pages preview URLs are a different origin than production—paste `MAHORAGA_API_TOKEN` again under Settings on each hostname.

#### Future: simpler “single pipeline” (revisit)

A single CI workflow (e.g. GitHub Actions) can run **`wrangler deploy`** for the Worker and **`npm run build` + `wrangler pages deploy`** for the dashboard on every push to `main`, with `VITE_MAHORAGA_API_BASE` supplied as a repo/Actions secret. That keeps API + UI in sync and avoids forgetting the export-before-build step. Worth setting up when you next have time to wire secrets and branch protection.

### 3) Lock down with Cloudflare Access

1. Cloudflare Dashboard -> Zero Trust -> Access -> Applications -> Add application.
2. Select **Self-hosted**.
3. Application domain: your Pages hostname (or custom domain).
4. Policy:
   - Action: **Allow**
   - Include: your email (or allowed email list/group)
5. Save and test login from an incognito window.

This ensures the dashboard URL is not publicly reachable.

### 4) Token handling model (safe for frontend)

- Enter `MAHORAGA_API_TOKEN` in dashboard Settings -> API Authentication.
- Token is stored only in browser `localStorage`.
- Token is **not** embedded in frontend build variables.
- Use **Clear Token** in settings to remove it immediately on shared devices.

### 5) Hosted verification checklist

After deploy + Access:

1. Open dashboard URL on desktop and phone.
2. Log in via Cloudflare Access.
3. Paste API token in Settings and save/reload.
4. Verify:
   - status/account panels load
   - activity logs populate
   - experiment panel loads run summaries/details
5. If you see Unauthorized (401), re-check token and Worker URL.

## Custom Strategies

Mahoraga uses a **pluggable strategy system**. The core harness is a thin orchestrator — all customizable logic lives in strategy modules. You never need to modify core files.

### How it works

1. Create `src/strategy/my-strategy/index.ts` implementing the `Strategy` interface
2. Change one import line in `src/strategy/index.ts`

```typescript
// src/strategy/index.ts
import { myStrategy } from "./my-strategy";
export const activeStrategy = myStrategy;
```

### What you can customize

| Component | File | What it does |
|-----------|------|--------------|
| **Gatherers** | `gatherers/*.ts` | Fetch signals from data sources (StockTwits, Reddit, etc.) |
| **Prompts** | `prompts/*.ts` | LLM prompt templates for research and analysis |
| **Entry rules** | `rules/entries.ts` | Decide which signals to buy |
| **Exit rules** | `rules/exits.ts` | Decide when to sell positions |
| **Config** | `config.ts` | Default parameters and source weights |

You can reuse default gatherers, mix in custom ones, override prompts, and define your own entry/exit rules — all without touching core files.

### Adding a new data source

Create a gatherer that returns `Signal[]`:

```typescript
import type { Gatherer, StrategyContext } from "../../types";

const myGatherer: Gatherer = {
  name: "my-source",
  gather: async (ctx: StrategyContext) => {
    const res = await fetch("https://your-api.com/data");
    const data = await res.json();
    return data.items.map(item => ({
      symbol: item.ticker,
      source: "my_source",
      source_detail: "my_source_v1",
      sentiment: item.sentiment,
      raw_sentiment: item.sentiment,
      volume: 1,
      freshness: 1.0,
      source_weight: 0.9,
      reason: `MySource: ${item.summary}`,
      timestamp: Date.now(),
    }));
  },
};
```

Then include it in your strategy's `gatherers` array.

See `docs/harness.html` for the full customization guide.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `max_positions` | 5 | Maximum concurrent positions |
| `max_position_value` | 5000 | Maximum $ per position |
| `take_profit_pct` | 10 | Take profit percentage |
| `stop_loss_pct` | 5 | Stop loss percentage |
| `min_sentiment_score` | 0.3 | Minimum sentiment to consider |
| `min_analyst_confidence` | 0.6 | Minimum LLM confidence to trade |
| `crypto_symbols` | BTC/USD, ETH/USD, SOL/USD | Configured crypto universe for actionable crypto decisions |
| `options_enabled` | false | Enable options trading |
| `crypto_enabled` | false | Enable 24/7 crypto trading |
| `llm_model` | gpt-4o-mini | Research model (cheap, for bulk analysis) |
| `llm_analyst_model` | gpt-4o | Analyst model (smart, for trading decisions) |

### LLM Provider Configuration

MAHORAGA supports multiple LLM providers via three modes:

| Mode | Description | Required Env Vars |
|------|-------------|-------------------|
| `openai-raw` | Direct OpenAI API (default) | `OPENAI_API_KEY` |
| `ai-sdk` | Vercel AI SDK with 5 providers | One or more provider keys |
| `cloudflare-gateway` | Cloudflare AI Gateway (/compat) | `CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, `CLOUDFLARE_AI_GATEWAY_TOKEN` |

**Optional OpenAI Base URL Override:**

- `OPENAI_BASE_URL` — Override the base URL used for OpenAI requests. Applies to `LLM_PROVIDER=openai-raw` and OpenAI models in `LLM_PROVIDER=ai-sdk` (models starting with `openai/`). Default: `https://api.openai.com/v1`.

**Cloudflare AI Gateway Notes:**

- This integration calls Cloudflare's OpenAI-compatible `/compat/chat/completions` endpoint and always sends `cf-aig-authorization`.
- It is intended for BYOK/Unified Billing setups where upstream provider keys are configured in Cloudflare (so your worker does not send provider API keys).
- Models use the `{provider}/{model}` format (e.g. `openai/gpt-5-mini`, `google-ai-studio/gemini-2.5-flash`, `anthropic/claude-sonnet-4-5`).

**AI SDK Supported Providers:**

| Provider | Env Var | Example Models |
|----------|---------|----------------|
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-4o`, `openai/o1` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4`, `anthropic/claude-opus-4` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-pro`, `google/gemini-2.5-flash` |
| xAI (Grok) | `XAI_API_KEY` | `xai/grok-4`, `xai/grok-3` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat`, `deepseek/deepseek-reasoner` |

**Example: Using Claude with AI SDK:**

```bash
npx wrangler secret put LLM_PROVIDER      # Set to "ai-sdk"
npx wrangler secret put LLM_MODEL         # Set to "anthropic/claude-sonnet-4"
npx wrangler secret put ANTHROPIC_API_KEY # Your Anthropic API key
```

### Actionable Signal Notes

- `signals` in status can include raw social candidates for observability.
- Trade decisions and signal-level LLM research use the actionable subset only.
- A symbol is actionable when Mahoraga can resolve a tradable Alpaca instrument and fetch a non-zero latest price.
- Cloudflare deployments with high symbol fanout should keep code-level actionability caps/dedupe enabled; `wrangler.jsonc` can also set `limits.subrequests` as a fallback guardrail.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/agent/status` | Full status (account, positions, signals) |
| `/agent/enable` | Enable the agent |
| `/agent/disable` | Disable the agent |
| `/agent/config` | Get or update configuration |
| `/agent/logs` | Get recent logs |
| `/agent/history` | Portfolio/equity history snapshots |
| `/agent/costs` | Aggregated LLM usage and cost totals |
| `/agent/trigger` | Manually trigger (for testing) |
| `/agent/experiments` | List experiment runs + active run id |
| `/agent/experiments/:id` | Get one experiment run with all snapshots |
| `/agent/experiments/start` | Start a run and capture baseline snapshot |
| `/agent/experiments/snapshot` | Capture a labeled checkpoint snapshot |
| `/agent/experiments/stop` | Stop a run (captures final snapshot by default) |
| `/agent/kill` | Emergency kill switch (uses `KILL_SWITCH_SECRET`) |
| `/mcp` | MCP server for tool access |

## Per-Change Experiment Loop

Use this whenever you tweak strategy logic and want objective before/after results.

```bash
# 0) Shared auth vars
export MAHORAGA_URL="https://your-worker.workers.dev"
export MAHORAGA_TOKEN="your-api-token"

# 1) Start a run (captures baseline automatically)
curl -X POST -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  -H "Content-Type: application/json" \
  "$MAHORAGA_URL/agent/experiments/start" \
  -d '{"name":"entry-threshold-v2","hypothesis":"improve actionable ratio","change_notes":"raise min confidence + source confirmation"}'

# 2) Optional checkpoint during the window
curl -X POST -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  -H "Content-Type: application/json" \
  "$MAHORAGA_URL/agent/experiments/snapshot" \
  -d '{"label":"mid-session"}'

# 3) Stop run (captures final snapshot)
curl -X POST -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  -H "Content-Type: application/json" \
  "$MAHORAGA_URL/agent/experiments/stop" \
  -d '{}'

# 4) Review latest runs
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" \
  "$MAHORAGA_URL/agent/experiments"
```

Snapshot comparisons include threshold checks for:
- no runtime alarm error regression
- actionable ratio non-decreasing
- return non-decreasing
- cost per executed trade within tolerance

## Institutional Signal Rollout (Top 3)

New institutional gatherers are wired but disabled by default:
- `options_flow` (Unusual Whales)
- `congressional` (FMP House/Senate)
- `contract_awards` (GovCon)

### Safe activation order

1. Enable only `uoa_enabled=true` and run one experiment window.
2. If pass/fail metrics remain healthy, enable `congressional_enabled=true`.
3. Add `contract_awards_enabled=true` last.

Keep strict caps during rollout:
- `uoa_max_candidates`
- `congressional_max_candidates`
- `contract_awards_max_candidates`

Do not enable a source in production until its API key is configured and paper-trading experiments pass.

## Security

### API Authentication (Required)

All `/agent/*` endpoints require Bearer token authentication using `MAHORAGA_API_TOKEN`:

```bash
curl -H "Authorization: Bearer $MAHORAGA_TOKEN" https://mahoraga.bernardoalmeida2004.workers.dev/agent/status
```

Generate a secure token: `openssl rand -base64 48`

### Emergency Kill Switch

The `/agent/kill` endpoint uses a separate `KILL_SWITCH_SECRET` for emergency shutdown:

```bash
curl -H "Authorization: Bearer $KILL_SWITCH_SECRET" https://mahoraga.bernardoalmeida2004.workers.dev/agent/kill
```

This immediately disables the agent, cancels all alarms, and clears the signal cache.

### Cloudflare Access (Recommended)

For additional security with SSO/email verification, set up Cloudflare Access:

```bash
# 1. Create a Cloudflare API token with Access:Edit permissions
#    https://dash.cloudflare.com/profile/api-tokens

# 2. Run the setup script
CLOUDFLARE_API_TOKEN=your-token \
CLOUDFLARE_ACCOUNT_ID=your-account-id \
MAHORAGA_WORKER_URL=https://mahoraga.your-subdomain.workers.dev \
MAHORAGA_ALLOWED_EMAILS=you@example.com \
npm run setup:access
```

This creates a Cloudflare Access Application with email verification or One-Time PIN.

## Project Structure

```
mahoraga/
├── wrangler.jsonc              # Cloudflare Workers config
├── src/
│   ├── index.ts                # Entry point & routing
│   ├── core/
│   │   ├── types.ts            # Shared types (Signal, AgentState, etc.)
│   │   ├── experiment-metrics.ts # Deterministic experiment metric + verdict utility
│   │   └── policy-broker.ts    # PolicyEngine-wrapped trade execution
│   ├── durable-objects/
│   │   └── mahoraga-harness.ts # Core orchestrator (thin — delegates to strategy)
│   ├── strategy/
│   │   ├── types.ts            # Strategy interface contract
│   │   ├── index.ts            # Active strategy selector (change this one line)
│   │   └── default/            # Default "sentiment-momentum" strategy
│   │       ├── index.ts        # Strategy assembly
│   │       ├── config.ts       # Default config & source weights
│   │       ├── gatherers/      # StockTwits, Reddit, SEC, crypto, Twitter
│   │       ├── prompts/        # LLM prompt templates
│   │       ├── rules/          # Entry/exit/staleness/options/crypto rules
│   │       └── helpers/        # Ticker extraction, sentiment analysis
│   ├── mcp/                    # MCP server & tools
│   ├── policy/                 # Trade validation & risk engine
│   ├── providers/              # Alpaca, LLM providers
│   └── schemas/                # Config schemas (Zod)
├── dashboard/                  # React dashboard
├── docs/                       # Documentation
└── migrations/                 # D1 database migrations
```

## Safety Features

| Feature | Description |
|---------|-------------|
| Paper Trading | Start with `ALPACA_PAPER=true` |
| Kill Switch | Emergency halt via secret |
| Position Limits | Max positions and $ per position |
| Daily Loss Limit | Stops trading after 2% daily loss |
| Staleness Detection | Auto-exit stale positions |
| No Margin | Cash-only trading |
| No Shorting | Long positions only |

## Community

Join our Discord for help and discussion:

**[Discord Server](https://discord.gg/vMFnHe2YBh)**

## Disclaimer

**⚠️ IMPORTANT: READ BEFORE USING**

This software is provided for **educational and informational purposes only**. Nothing in this repository constitutes financial, investment, legal, or tax advice.

**By using this software, you acknowledge and agree that:**

- All trading and investment decisions are made **at your own risk**
- Markets are volatile and **you can lose some or all of your capital**
- No guarantees of performance, profits, or outcomes are made
- The authors and contributors are **not responsible** for any financial losses
- This software may contain bugs or behave unexpectedly
- Past performance does not guarantee future results

**Always start with paper trading and never risk money you cannot afford to lose.**

## License

MIT License - Free for personal and commercial use. See [LICENSE](LICENSE) for full terms.
