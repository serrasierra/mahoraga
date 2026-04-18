export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARTIFACTS: R2Bucket;
  SESSION: DurableObjectNamespace;
  MAHORAGA_HARNESS?: DurableObjectNamespace;

  ALPACA_API_KEY: string;
  ALPACA_API_SECRET: string;
  ALPACA_PAPER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  XAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  LLM_PROVIDER?: "openai-raw" | "ai-sdk" | "cloudflare-gateway";
  LLM_MODEL?: string;
  TWITTER_BEARER_TOKEN?: string;
  POLYGON_API_KEY?: string;
  UNUSUAL_WHALES_API_KEY?: string;
  FMP_API_KEY?: string;
  GOVCON_API_KEY?: string;
  /** Free-tier: Finnhub REST (https://finnhub.io/docs/api) */
  FINNHUB_API_KEY?: string;
  /** Free-tier: FRED macro series (https://fred.stlouisfed.org/docs/api/fred/) */
  FRED_API_KEY?: string;
  DISCORD_WEBHOOK_URL?: string;
  MAHORAGA_API_TOKEN: string;
  KILL_SWITCH_SECRET: string;

  ENVIRONMENT: string;
  FEATURE_LLM_RESEARCH: string;
  FEATURE_OPTIONS: string;

  DEFAULT_MAX_POSITION_PCT: string;
  DEFAULT_MAX_NOTIONAL_PER_TRADE: string;
  DEFAULT_MAX_DAILY_LOSS_PCT: string;
  DEFAULT_COOLDOWN_MINUTES: string;
  DEFAULT_MAX_OPEN_POSITIONS: string;
  DEFAULT_APPROVAL_TTL_SECONDS: string;

  /** Optional: ms to wait between per-symbol LLM research calls (default 500). Raise on low OpenAI RPM tiers (e.g. 20000 for ~3 RPM). */
  SIGNAL_RESEARCH_GAP_MS?: string;
}

declare module "cloudflare:workers" {
  interface Env extends Env { }
}
