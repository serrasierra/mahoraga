export interface Account {
  equity: number
  cash: number
  buying_power: number
  portfolio_value: number
}

export interface Position {
  symbol: string
  qty: number
  side: string
  market_value: number
  unrealized_pl: number
  current_price: number
}

export interface Clock {
  is_open: boolean
  next_open: string
  next_close: string
}

export interface Signal {
  symbol: string
  source: string
  sentiment: number
  volume: number
  reason: string
  bullish?: number
  bearish?: number
  score?: number
  upvotes?: number
  isCrypto?: boolean
  momentum?: number
  price?: number
}

export interface SignalActionability {
  is_actionable: boolean
  reason:
    | 'ok'
    | 'no_price'
    | 'asset_not_found'
    | 'asset_not_tradable'
    | 'exchange_not_allowed'
    | 'crypto_symbol_not_configured'
    | 'lookup_failed'
  price: number | null
  normalized_symbol?: string
  asset_class?: 'us_equity' | 'crypto'
  checked_at: number
}

export interface LogEntry {
  timestamp: string
  agent: string
  action: string
  symbol?: string
  [key: string]: unknown
}

export interface CostTracker {
  total_usd: number
  calls: number
  tokens_in: number
  tokens_out: number
}

export interface ExperimentThresholdCheck {
  name: string
  passed: boolean
  value: number
  baseline_value?: number
  note?: string
}

export interface ExperimentVerdict {
  passed: boolean
  checks: ExperimentThresholdCheck[]
}

export interface ExperimentMetricsSnapshotData {
  reliability: {
    alarm_error_count: number
    source_error_count: number
    subrequest_error_count: number
  }
  signal_funnel: {
    avg_total_signals: number
    avg_actionable_signals: number
    avg_actionable_ratio: number
  }
  decisions: {
    researched_signals: number
    buy_executed: number
    sell_executed: number
    verdict_buy: number
    verdict_wait: number
    verdict_skip: number
  }
  costs: {
    total_usd_delta: number
    calls_delta: number
    tokens_in_delta: number
    tokens_out_delta: number
    cost_per_researched_signal: number
    cost_per_executed_trade: number
  }
  returns: {
    equity_start: number
    equity_end: number
    equity_change: number
    return_pct: number
    max_drawdown_pct: number
  }
}

export interface ExperimentSnapshot {
  id: string
  experiment_id: string
  label: string
  captured_at: number
  window_start: number
  window_end: number
  metrics: ExperimentMetricsSnapshotData
  verdict: ExperimentVerdict
}

export interface ExperimentRun {
  id: string
  name: string
  hypothesis?: string
  change_notes?: string
  started_at: number
  ended_at: number | null
  status: 'active' | 'completed'
  baseline_snapshot_id: string | null
  snapshots: ExperimentSnapshot[]
}

export interface ExperimentSummary {
  id: string
  name: string
  hypothesis?: string
  change_notes?: string
  started_at: number
  ended_at: number | null
  status: 'active' | 'completed'
  snapshots: number
  latest_snapshot?: ExperimentSnapshot
}

export interface Config {
  data_poll_interval_ms: number
  analyst_interval_ms: number
  premarket_plan_window_minutes?: number
  market_open_execute_window_minutes?: number
  max_position_value: number
  max_positions: number
  min_sentiment_score: number
  min_analyst_confidence: number
  take_profit_pct: number
  stop_loss_pct: number
  position_size_pct_of_cash: number
  llm_provider?: 'openai-raw' | 'ai-sdk' | 'cloudflare-gateway'
  llm_model: string
  llm_analyst_model?: string
  starting_equity?: number

  // Stale position management
  stale_position_enabled?: boolean
  stale_min_hold_hours?: number
  stale_max_hold_days?: number
  stale_min_gain_pct?: number
  stale_mid_hold_days?: number
  stale_mid_min_gain_pct?: number
  stale_social_volume_decay?: number

  // Options config
  options_enabled?: boolean
  options_min_confidence?: number
  options_max_pct_per_trade?: number
  options_min_dte?: number
  options_max_dte?: number
  options_target_delta?: number
  options_min_delta?: number
  options_max_delta?: number
  options_stop_loss_pct?: number
  options_take_profit_pct?: number

  // Crypto trading config (24/7)
  crypto_enabled?: boolean
  crypto_symbols?: string[]
  crypto_momentum_threshold?: number
  crypto_max_position_value?: number
  crypto_take_profit_pct?: number
  crypto_stop_loss_pct?: number

  // Institutional signal sources
  uoa_enabled?: boolean
  uoa_max_candidates?: number
  uoa_min_premium?: number
  congressional_enabled?: boolean
  congressional_max_candidates?: number
  congressional_lookback_days?: number
  contract_awards_enabled?: boolean
  contract_awards_max_candidates?: number
  contract_awards_lookback_days?: number

  /** Free-tier: Finnhub general news bundle (requires FINNHUB_API_KEY) */
  finnhub_enabled?: boolean
  finnhub_max_symbols?: number
  finnhub_cache_ttl_seconds?: number
  finnhub_symbols?: string[]

  /** Free-tier: FRED macro bias for SPY/QQQ (requires FRED_API_KEY) */
  fred_enabled?: boolean
  fred_series?: string[]
  fred_cache_ttl_seconds?: number

  /** Free-tier: Alternative.me crypto fear & greed (no key) */
  crypto_fng_enabled?: boolean
  crypto_fng_cache_ttl_seconds?: number

  // Custom ticker blacklist (insider trading restrictions, etc.)
  ticker_blacklist?: string[]
}

export interface SignalResearch {
  verdict: 'BUY' | 'SKIP' | 'WAIT'
  confidence: number
  entry_quality: 'excellent' | 'good' | 'fair' | 'poor'
  reasoning: string
  red_flags: string[]
  catalysts: string[]
  sentiment: number
  timestamp: number
}

export interface PositionResearch {
  recommendation: 'HOLD' | 'SELL' | 'ADD'
  risk_level: 'low' | 'medium' | 'high'
  reasoning: string
  key_factors: string[]
  timestamp: number
}

export interface PositionEntry {
  symbol: string
  entry_time: number
  entry_price: number
  entry_sentiment: number
  entry_social_volume: number
  entry_sources: string[]
  entry_reason: string
  peak_price: number
  peak_sentiment: number
}

export interface TwitterConfirmation {
  symbol: string
  query: string
  tweetCount: number
  sentiment: number
  bullishCount: number
  bearishCount: number
  influencerMentions: number
  averageEngagement: number
  timestamp: number
}

export interface PremarketPlan {
  timestamp: number
  summary: string
  recommendations: Array<{
    symbol: string
    action: 'BUY' | 'SELL' | 'HOLD' | 'SKIP'
    confidence: number
    reasoning: string
    entry_price?: number
    target_price?: number
    stop_loss?: number
  }>
  highConvictionPlays: string[]
  marketOutlook: string
}

export interface StalenessAnalysis {
  symbol: string
  score: number
  holdDays: number
  gainPct: number
  socialVolumeDecay: number
  shouldExit: boolean
  reasons: string[]
}

export interface OvernightActivity {
  signalsGathered: number
  signalsResearched: number
  buySignals: number
  twitterConfirmations: number
  premarketPlanReady: boolean
  lastUpdated: number
}

export interface PortfolioSnapshot {
  timestamp: number
  equity: number
  pl: number
  pl_pct: number
}

export interface PositionHistory {
  symbol: string
  prices: number[]
  timestamps: number[]
}

export interface Status {
  account: Account | null
  positions: Position[]
  clock: Clock | null
  config: Config
  signals: Signal[]
  actionableSignals?: Signal[]
  signalActionability?: Record<string, SignalActionability>
  logs: LogEntry[]
  costs: CostTracker
  lastAnalystRun: number
  lastResearchRun: number
  signalResearch: Record<string, SignalResearch>
  positionResearch: Record<string, PositionResearch>
  portfolioHistory?: PortfolioSnapshot[]
  positionHistory?: Record<string, PositionHistory>
  positionEntries?: Record<string, PositionEntry>
  twitterConfirmations?: Record<string, TwitterConfirmation>
  premarketPlan?: PremarketPlan | null
  stalenessAnalysis?: Record<string, StalenessAnalysis>
  overnightActivity?: OvernightActivity
  activeExperimentId?: string | null
  experimentSummaries?: ExperimentSummary[]
}
