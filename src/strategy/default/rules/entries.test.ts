import { describe, expect, it, vi } from "vitest";
import type { ResearchResult, Signal } from "../../../core/types";
import type { StrategyContext } from "../../types";
import { DEFAULT_CONFIG } from "../config";
import { selectEntries } from "./entries";

function makeCtx(signals: Signal[]): StrategyContext {
  return {
    env: {} as any,
    config: { ...DEFAULT_CONFIG, min_analyst_confidence: 0.6, max_positions: 5, position_size_pct_of_cash: 20 },
    llm: null,
    log: vi.fn(),
    trackLLMCost: vi.fn(),
    sleep: vi.fn(),
    broker: {
      getAccount: vi.fn(),
      getPositions: vi.fn(),
      getClock: vi.fn(),
      buy: vi.fn(),
      sell: vi.fn(),
    },
    state: {
      get: vi.fn(),
      set: vi.fn(),
    },
    signals,
    positionEntries: {},
  } as unknown as StrategyContext;
}

function makeResearch(symbol: string, confidence: number): ResearchResult {
  return {
    symbol,
    verdict: "BUY",
    confidence,
    entry_quality: "good",
    reasoning: "positive catalysts",
    red_flags: [],
    catalysts: [],
    timestamp: Date.now(),
  };
}

describe("selectEntries polygon confirmation", () => {
  it("keeps skip bias for low-confidence polygon-only symbols", () => {
    const ctx = makeCtx([
      {
        symbol: "AAPL",
        source: "polygon_news",
        source_detail: "polygon:news",
        sentiment: 0.4,
        raw_sentiment: 0.4,
        volume: 2,
        freshness: 1,
        source_weight: 0.88,
        reason: "news",
        timestamp: Date.now(),
      },
    ]);

    const candidates = selectEntries(ctx, [makeResearch("AAPL", 0.65)], [], { cash: 10_000 } as any);
    expect(candidates).toHaveLength(0);
  });

  it("allows normal path with slight boost when Polygon aligns with another source", () => {
    const ctx = makeCtx([
      {
        symbol: "AAPL",
        source: "polygon_news",
        source_detail: "polygon:news",
        sentiment: 0.45,
        raw_sentiment: 0.45,
        volume: 2,
        freshness: 1,
        source_weight: 0.88,
        reason: "news",
        timestamp: Date.now(),
      },
      {
        symbol: "AAPL",
        source: "reddit",
        source_detail: "reddit_stocks",
        sentiment: 0.55,
        raw_sentiment: 0.55,
        volume: 3,
        freshness: 0.9,
        source_weight: 0.8,
        reason: "social",
        timestamp: Date.now(),
      },
    ]);

    const candidates = selectEntries(ctx, [makeResearch("AAPL", 0.65)], [], { cash: 10_000 } as any);
    expect(candidates).toHaveLength(1);
    const first = candidates[0]!;
    expect(first.symbol).toBe("AAPL");
    expect(first.confidence).toBeCloseTo(0.7, 5);
    expect(first.notional).toBeCloseTo(1400, 2);
  });
});
