import type {
  CostTracker,
  ExperimentCostMetrics,
  ExperimentDecisionMetrics,
  ExperimentMetricsSnapshotData,
  ExperimentReliabilityMetrics,
  ExperimentReturnMetrics,
  ExperimentSignalFunnelMetrics,
  ExperimentThresholdCheck,
  ExperimentVerdict,
  LogEntry,
} from "./types";

interface PortfolioPoint {
  timestamp: number;
  equity: number;
}

interface ComputeExperimentMetricsInput {
  logs: LogEntry[];
  windowStartMs: number;
  windowEndMs: number;
  baselineCostTracker: CostTracker;
  currentCostTracker: CostTracker;
  portfolio: PortfolioPoint[];
}

function toMs(ts: string): number {
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function computeReliability(logs: LogEntry[]): ExperimentReliabilityMetrics {
  const alarmErrors = logs.filter((l) => l.action === "alarm_error").length;
  const sourceErrors = logs.filter((l) => {
    const action = l.action || "";
    return action.includes("error") || action.includes("retry");
  }).length;
  const subrequestErrors = logs.filter((l) => {
    const err = String(l.error || "");
    return err.includes("Too many subrequests");
  }).length;
  return {
    alarm_error_count: alarmErrors,
    source_error_count: sourceErrors,
    subrequest_error_count: subrequestErrors,
  };
}

function computeSignalFunnel(logs: LogEntry[]): ExperimentSignalFunnelMetrics {
  const gather = logs.filter((l) => l.action === "data_gathered");
  const totals = gather.map((g) => Number(g.total || 0));
  const actionable = gather.map((g) => Number(g.actionable_total || 0));
  const ratios = gather.map((g) => {
    const total = Number(g.total || 0);
    const act = Number(g.actionable_total || 0);
    return total > 0 ? clamp01(act / total) : 0;
  });
  return {
    avg_total_signals: average(totals),
    avg_actionable_signals: average(actionable),
    avg_actionable_ratio: average(ratios),
  };
}

function computeDecisions(logs: LogEntry[]): ExperimentDecisionMetrics {
  const researched = logs.filter((l) => l.agent === "SignalResearch" && l.action === "signal_researched");
  let buy = 0;
  let wait = 0;
  let skip = 0;
  for (const item of researched) {
    const verdict = String(item.verdict || "");
    if (verdict === "BUY") buy += 1;
    else if (verdict === "WAIT") wait += 1;
    else if (verdict === "SKIP") skip += 1;
  }
  const buys = logs.filter((l) => l.agent === "PolicyBroker" && l.action === "buy_executed").length;
  const sells = logs.filter((l) => l.agent === "PolicyBroker" && l.action === "sell_executed").length;

  return {
    researched_signals: researched.length,
    buy_executed: buys,
    sell_executed: sells,
    verdict_buy: buy,
    verdict_wait: wait,
    verdict_skip: skip,
  };
}

function computeCosts(
  baseline: CostTracker,
  current: CostTracker,
  researchedSignals: number,
  executedTrades: number
): ExperimentCostMetrics {
  const totalUsdDelta = current.total_usd - baseline.total_usd;
  const callsDelta = current.calls - baseline.calls;
  const tokensInDelta = current.tokens_in - baseline.tokens_in;
  const tokensOutDelta = current.tokens_out - baseline.tokens_out;

  return {
    total_usd_delta: totalUsdDelta,
    calls_delta: callsDelta,
    tokens_in_delta: tokensInDelta,
    tokens_out_delta: tokensOutDelta,
    cost_per_researched_signal: researchedSignals > 0 ? totalUsdDelta / researchedSignals : 0,
    cost_per_executed_trade: executedTrades > 0 ? totalUsdDelta / executedTrades : 0,
  };
}

function computeReturns(portfolio: PortfolioPoint[]): ExperimentReturnMetrics {
  if (portfolio.length === 0) {
    return {
      equity_start: 0,
      equity_end: 0,
      equity_change: 0,
      return_pct: 0,
      max_drawdown_pct: 0,
    };
  }

  const sorted = portfolio.slice().sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0]?.equity ?? 0;
  const last = sorted[sorted.length - 1]?.equity ?? 0;

  let peak = first;
  let maxDd = 0;
  for (const point of sorted) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      const dd = ((peak - point.equity) / peak) * 100;
      maxDd = Math.max(maxDd, dd);
    }
  }

  return {
    equity_start: first,
    equity_end: last,
    equity_change: last - first,
    return_pct: first > 0 ? ((last - first) / first) * 100 : 0,
    max_drawdown_pct: maxDd,
  };
}

export function computeExperimentMetrics(input: ComputeExperimentMetricsInput): ExperimentMetricsSnapshotData {
  const logsInWindow = input.logs.filter((l) => {
    const ms = toMs(l.timestamp);
    return ms >= input.windowStartMs && ms <= input.windowEndMs;
  });

  const reliability = computeReliability(logsInWindow);
  const signal_funnel = computeSignalFunnel(logsInWindow);
  const decisions = computeDecisions(logsInWindow);
  const costs = computeCosts(
    input.baselineCostTracker,
    input.currentCostTracker,
    decisions.researched_signals,
    decisions.buy_executed + decisions.sell_executed
  );
  const returns = computeReturns(input.portfolio);

  return {
    reliability,
    signal_funnel,
    decisions,
    costs,
    returns,
  };
}

export function evaluateExperimentThresholds(
  baseline: ExperimentMetricsSnapshotData | null,
  current: ExperimentMetricsSnapshotData
): ExperimentVerdict {
  if (!baseline) {
    return {
      passed: true,
      checks: [
        {
          name: "baseline_captured",
          passed: true,
          value: 1,
          note: "Baseline snapshot not available yet; comparison deferred.",
        },
      ],
    };
  }

  const checks: ExperimentThresholdCheck[] = [
    {
      name: "no_alarm_error_regression",
      passed: current.reliability.alarm_error_count <= baseline.reliability.alarm_error_count,
      value: current.reliability.alarm_error_count,
      baseline_value: baseline.reliability.alarm_error_count,
    },
    {
      name: "actionable_ratio_non_decreasing",
      passed: current.signal_funnel.avg_actionable_ratio >= baseline.signal_funnel.avg_actionable_ratio,
      value: current.signal_funnel.avg_actionable_ratio,
      baseline_value: baseline.signal_funnel.avg_actionable_ratio,
    },
    {
      name: "return_non_decreasing",
      passed: current.returns.return_pct >= baseline.returns.return_pct,
      value: current.returns.return_pct,
      baseline_value: baseline.returns.return_pct,
    },
    {
      name: "cost_per_trade_within_20pct",
      passed: current.costs.cost_per_executed_trade <= baseline.costs.cost_per_executed_trade * 1.2 || baseline.costs.cost_per_executed_trade === 0,
      value: current.costs.cost_per_executed_trade,
      baseline_value: baseline.costs.cost_per_executed_trade,
      note: "Allows up to 20% higher cost per executed trade.",
    },
  ];

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}
