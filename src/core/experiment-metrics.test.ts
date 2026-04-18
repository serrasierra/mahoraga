import { describe, expect, it } from "vitest";
import { computeExperimentMetrics, evaluateExperimentThresholds } from "./experiment-metrics";
import type { CostTracker, LogEntry } from "./types";

const baselineCosts: CostTracker = {
  total_usd: 1,
  calls: 10,
  tokens_in: 1000,
  tokens_out: 500,
};

describe("computeExperimentMetrics", () => {
  it("computes deterministic reliability, funnel, decisions, costs, and returns", () => {
    const logs: LogEntry[] = [
      {
        timestamp: "2026-04-06T00:00:00.000Z",
        agent: "System",
        action: "data_gathered",
        total: 20,
        actionable_total: 10,
      },
      {
        timestamp: "2026-04-06T00:01:00.000Z",
        agent: "System",
        action: "alarm_error",
        error: "Error: Too many subrequests by single Worker invocation",
      },
      {
        timestamp: "2026-04-06T00:02:00.000Z",
        agent: "SignalResearch",
        action: "signal_researched",
        verdict: "BUY",
      },
      {
        timestamp: "2026-04-06T00:03:00.000Z",
        agent: "PolicyBroker",
        action: "buy_executed",
      },
    ];

    const metrics = computeExperimentMetrics({
      logs,
      windowStartMs: new Date("2026-04-06T00:00:00.000Z").getTime(),
      windowEndMs: new Date("2026-04-06T00:05:00.000Z").getTime(),
      baselineCostTracker: baselineCosts,
      currentCostTracker: {
        total_usd: 2,
        calls: 12,
        tokens_in: 1300,
        tokens_out: 700,
      },
      portfolio: [
        { timestamp: 1, equity: 100_000 },
        { timestamp: 2, equity: 101_000 },
        { timestamp: 3, equity: 99_500 },
      ],
    });

    expect(metrics.reliability.alarm_error_count).toBe(1);
    expect(metrics.reliability.subrequest_error_count).toBe(1);
    expect(metrics.signal_funnel.avg_actionable_ratio).toBeCloseTo(0.5);
    expect(metrics.decisions.researched_signals).toBe(1);
    expect(metrics.decisions.buy_executed).toBe(1);
    expect(metrics.costs.total_usd_delta).toBeCloseTo(1);
    expect(metrics.returns.return_pct).toBeCloseTo(-0.5);
  });
});

describe("evaluateExperimentThresholds", () => {
  it("returns failing checks when current metrics regress", () => {
    const baseline = computeExperimentMetrics({
      logs: [],
      windowStartMs: 0,
      windowEndMs: 1,
      baselineCostTracker: baselineCosts,
      currentCostTracker: baselineCosts,
      portfolio: [{ timestamp: 1, equity: 100 }],
    });

    const current = {
      ...baseline,
      reliability: { ...baseline.reliability, alarm_error_count: 2 },
      signal_funnel: { ...baseline.signal_funnel, avg_actionable_ratio: 0.1 },
      returns: { ...baseline.returns, return_pct: -1 },
      costs: { ...baseline.costs, cost_per_executed_trade: 5 },
    };

    const verdict = evaluateExperimentThresholds(baseline, current);
    expect(verdict.passed).toBe(false);
    expect(verdict.checks.some((check) => check.passed === false)).toBe(true);
  });
});
