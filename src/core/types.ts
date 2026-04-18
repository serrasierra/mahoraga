/**
 * Core types shared between the harness orchestrator and strategies.
 *
 * These types are the stable contract — changes here affect all strategies.
 */

// Re-export provider types that strategies need
export type { Account, LLMProvider, MarketClock, Position } from "../providers/types";

// Re-export config types
export type { AgentConfig } from "../schemas/agent-config";

// ---------------------------------------------------------------------------
// Signal — produced by data gatherers, consumed by the research & trading loop
// ---------------------------------------------------------------------------

export interface Signal {
  symbol: string;
  source: string;
  source_detail: string;
  sentiment: number;
  raw_sentiment: number;
  volume: number;
  freshness: number;
  source_weight: number;
  reason: string;
  timestamp: number;
  // Optional enrichment fields (gatherers add what they need)
  upvotes?: number;
  comments?: number;
  quality_score?: number;
  subreddits?: string[];
  best_flair?: string | null;
  bullish?: number;
  bearish?: number;
  isCrypto?: boolean;
  momentum?: number;
  price?: number;
}

// ---------------------------------------------------------------------------
// Position tracking — entry metadata persisted across alarm cycles
// ---------------------------------------------------------------------------

export interface PositionEntry {
  symbol: string;
  entry_time: number;
  entry_price: number;
  entry_sentiment: number;
  entry_social_volume: number;
  entry_sources: string[];
  entry_reason: string;
  peak_price: number;
  peak_sentiment: number;
}

// ---------------------------------------------------------------------------
// Social history — rolling time-series for staleness detection
// ---------------------------------------------------------------------------

export interface SocialHistoryEntry {
  timestamp: number;
  volume: number;
  sentiment: number;
}

export interface SocialSnapshotCacheEntry {
  volume: number;
  sentiment: number;
  sources: string[];
}

export interface SignalActionability {
  is_actionable: boolean;
  reason:
    | "ok"
    | "no_price"
    | "asset_not_found"
    | "asset_not_tradable"
    | "exchange_not_allowed"
    | "crypto_symbol_not_configured"
    | "lookup_failed";
  price: number | null;
  normalized_symbol?: string;
  asset_class?: "us_equity" | "crypto";
  checked_at: number;
}

// ---------------------------------------------------------------------------
// Logging & cost tracking
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  agent: string;
  action: string;
  [key: string]: unknown;
}

export interface CostTracker {
  total_usd: number;
  calls: number;
  tokens_in: number;
  tokens_out: number;
}

export interface ExperimentThresholdCheck {
  name: string;
  passed: boolean;
  value: number;
  baseline_value?: number;
  note?: string;
}

export interface ExperimentVerdict {
  passed: boolean;
  checks: ExperimentThresholdCheck[];
}

export interface ExperimentReliabilityMetrics {
  alarm_error_count: number;
  source_error_count: number;
  subrequest_error_count: number;
}

export interface ExperimentSignalFunnelMetrics {
  avg_total_signals: number;
  avg_actionable_signals: number;
  avg_actionable_ratio: number;
}

export interface ExperimentDecisionMetrics {
  researched_signals: number;
  buy_executed: number;
  sell_executed: number;
  verdict_buy: number;
  verdict_wait: number;
  verdict_skip: number;
}

export interface ExperimentCostMetrics {
  total_usd_delta: number;
  calls_delta: number;
  tokens_in_delta: number;
  tokens_out_delta: number;
  cost_per_researched_signal: number;
  cost_per_executed_trade: number;
}

export interface ExperimentReturnMetrics {
  equity_start: number;
  equity_end: number;
  equity_change: number;
  return_pct: number;
  max_drawdown_pct: number;
}

export interface ExperimentMetricsSnapshotData {
  reliability: ExperimentReliabilityMetrics;
  signal_funnel: ExperimentSignalFunnelMetrics;
  decisions: ExperimentDecisionMetrics;
  costs: ExperimentCostMetrics;
  returns: ExperimentReturnMetrics;
}

export interface ExperimentMetricsSnapshot {
  id: string;
  experiment_id: string;
  label: string;
  captured_at: number;
  window_start: number;
  window_end: number;
  metrics: ExperimentMetricsSnapshotData;
  verdict: ExperimentVerdict;
}

export interface ExperimentRun {
  id: string;
  name: string;
  hypothesis?: string;
  change_notes?: string;
  started_at: number;
  ended_at: number | null;
  status: "active" | "completed";
  baseline_cost_tracker: CostTracker;
  baseline_snapshot_id: string | null;
  snapshots: ExperimentMetricsSnapshot[];
}

// ---------------------------------------------------------------------------
// Research results — output of LLM analysis
// ---------------------------------------------------------------------------

export interface ResearchResult {
  symbol: string;
  verdict: "BUY" | "SKIP" | "WAIT";
  confidence: number;
  entry_quality: "excellent" | "good" | "fair" | "poor";
  reasoning: string;
  red_flags: string[];
  catalysts: string[];
  timestamp: number;
}

export interface TwitterConfirmation {
  symbol: string;
  tweet_count: number;
  sentiment: number;
  confirms_existing: boolean;
  highlights: Array<{ author: string; text: string; likes: number }>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Pre-market plan
// ---------------------------------------------------------------------------

export interface PremarketPlan {
  timestamp: number;
  recommendations: Array<{
    action: "BUY" | "SELL" | "HOLD";
    symbol: string;
    confidence: number;
    reasoning: string;
    suggested_size_pct?: number;
  }>;
  market_summary: string;
  high_conviction: string[];
  researched_buys: ResearchResult[];
}

// ---------------------------------------------------------------------------
// Agent state — persisted in DO storage
// ---------------------------------------------------------------------------

export interface AgentState {
  config: import("../schemas/agent-config").AgentConfig;
  signalCache: Signal[];
  actionableSignalCache: Signal[];
  signalActionability: Record<string, SignalActionability>;
  positionEntries: Record<string, PositionEntry>;
  socialHistory: Record<string, SocialHistoryEntry[]>;
  socialSnapshotCache: Record<string, SocialSnapshotCacheEntry>;
  socialSnapshotCacheUpdatedAt: number;
  logs: LogEntry[];
  costTracker: CostTracker;
  lastDataGatherRun: number;
  lastAnalystRun: number;
  lastResearchRun: number;
  lastPositionResearchRun: number;
  signalResearch: Record<string, ResearchResult>;
  positionResearch: Record<string, unknown>;
  stalenessAnalysis: Record<string, unknown>;
  twitterConfirmations: Record<string, TwitterConfirmation>;
  experimentRuns: Record<string, ExperimentRun>;
  experimentOrder: string[];
  activeExperimentId: string | null;
  twitterDailyReads: number;
  twitterDailyReadReset: number;
  lastKnownNextOpenMs: number | null;
  premarketPlan: PremarketPlan | null;
  lastPremarketPlanDayEt: string | null;
  lastClockIsOpen: boolean | null;
  enabled: boolean;
}
