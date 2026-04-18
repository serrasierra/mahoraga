/**
 * Entry rules — decide which signals to buy.
 *
 * Core handles PolicyEngine checks and actual order execution.
 * Core ALWAYS enforces stop-loss from config as a safety floor.
 */

import type { Account, Position, ResearchResult } from "../../../core/types";
import type { BuyCandidate, StrategyContext } from "../../types";

/**
 * Select entry candidates from LLM-researched signals.
 *
 * Filters for BUY verdicts above min confidence threshold,
 * skips already-held symbols, and ranks by confidence.
 */
export function selectEntries(
  ctx: StrategyContext,
  research: ResearchResult[],
  positions: Position[],
  account: Account
): BuyCandidate[] {
  const heldSymbols = new Set(positions.map((p) => p.symbol));
  const candidates: BuyCandidate[] = [];
  const sourceStatsBySymbol = new Map<string, { sources: Set<string>; avgSentiment: number }>();

  if (positions.length >= ctx.config.max_positions) return [];

  for (const signal of ctx.signals) {
    const entry = sourceStatsBySymbol.get(signal.symbol) || {
      sources: new Set<string>(),
      avgSentiment: 0,
    };
    entry.sources.add(signal.source);
    entry.avgSentiment = (entry.avgSentiment + signal.sentiment) / 2;
    sourceStatsBySymbol.set(signal.symbol, entry);
  }

  const buyResearch = research
    .filter((r) => r.verdict === "BUY" && r.confidence >= ctx.config.min_analyst_confidence)
    .filter((r) => !heldSymbols.has(r.symbol))
    .sort((a, b) => b.confidence - a.confidence);

  for (const r of buyResearch.slice(0, 3)) {
    if (positions.length + candidates.length >= ctx.config.max_positions) break;

    const signalStats = sourceStatsBySymbol.get(r.symbol);
    const sourceCount = signalStats?.sources.size || 0;
    const hasPolygonSource = signalStats?.sources.has("polygon_news") || false;
    const avgSignalSentiment = signalStats?.avgSentiment || 0;

    if (hasPolygonSource && sourceCount < 2 && r.confidence < Math.max(ctx.config.min_analyst_confidence + 0.1, 0.7)) {
      continue;
    }

    const confidenceBoost = hasPolygonSource && sourceCount >= 2 && avgSignalSentiment > 0.3 ? 0.05 : 0;
    const effectiveConfidence = Math.min(1, r.confidence + confidenceBoost);
    const sizePct = Math.min(20, ctx.config.position_size_pct_of_cash);
    const notional = Math.min(account.cash * (sizePct / 100) * effectiveConfidence, ctx.config.max_position_value);

    if (notional < 100) continue;

    const shouldUseOptions =
      ctx.config.options_enabled &&
      effectiveConfidence >= ctx.config.options_min_confidence &&
      r.entry_quality === "excellent";

    candidates.push({
      symbol: r.symbol,
      confidence: effectiveConfidence,
      reason: r.reasoning,
      notional,
      useOptions: shouldUseOptions,
    });
  }

  return candidates;
}
