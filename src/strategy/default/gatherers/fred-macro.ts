/**
 * FRED macro regime — low-frequency bias signals for broad ETFs (SPY/QQQ).
 * Conservative magnitudes; per-series KV cache with long TTL.
 */

import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import {
  boundedSentiment,
  cachedJsonFetch,
  resolveTradableEquityPrice,
  shouldRunSource,
  toSignalReason,
} from "./helpers/source-guards";

interface FredObservationsPayload {
  observations?: Array<{ date?: string; value?: string }>;
}

function parseLatestValue(payload: FredObservationsPayload): number | null {
  const obs = payload.observations?.[0];
  const v = obs?.value;
  if (v === undefined || v === null || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function biasForSeries(seriesId: string, value: number): number {
  const id = seriesId.toUpperCase();
  if (id === "VIXCLS") {
    if (value > 28) return -0.1;
    if (value > 22) return -0.05;
    if (value < 14) return 0.06;
    return 0.02;
  }
  if (id === "DGS10" || id === "DGS2") {
    if (value > 5.2) return -0.04;
    if (value < 3) return 0.02;
    return 0;
  }
  if (id === "FEDFUNDS") {
    if (value > 5) return -0.03;
    return 0;
  }
  return 0;
}

export const fredMacroGatherer: Gatherer = {
  name: "fred_macro",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSource(ctx, "FredMacro", ctx.config.fred_enabled, ctx.env.FRED_API_KEY)) {
      return [];
    }

    const apiKey = ctx.env.FRED_API_KEY!;
    const ttl = ctx.config.fred_cache_ttl_seconds ?? 14_400;
    const seriesIds = (ctx.config.fred_series || []).slice(0, 8);
    if (seriesIds.length === 0) {
      ctx.log("FredMacro", "no_series", {});
      return [];
    }

    const sourceWeight = SOURCE_CONFIG.weights.fred_macro ?? 0.45;
    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const alpaca = createAlpacaProviders(ctx.env);

    const biases: number[] = [];
    for (const seriesId of seriesIds) {
      const sid = seriesId.trim();
      if (!sid) continue;
      const url = new URL("https://api.stlouisfed.org/fred/series/observations");
      url.searchParams.set("series_id", sid);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("sort_order", "desc");

      const { data } = await cachedJsonFetch<FredObservationsPayload>(ctx, {
        namespace: "fred",
        cacheKeySuffix: `obs:${sid}`,
        ttlSeconds: ttl,
        url: url.toString(),
        label: "FredMacro",
        maxRetriesOn429: 2,
      });

      const latest = data ? parseLatestValue(data) : null;
      if (latest === null) continue;
      biases.push(biasForSeries(sid, latest));
    }

    if (biases.length === 0) {
      ctx.log("FredMacro", "no_observations", {});
      return [];
    }

    const combined =
      biases.reduce((a, b) => a + b, 0) / biases.length;
    const macroRaw = boundedSentiment(combined);
    const clampedMacro = boundedSentiment(Math.max(-0.12, Math.min(0.12, macroRaw)));

    const targets = ["SPY", "QQQ"];
    const signals: Signal[] = [];

    for (const symbol of targets) {
      if ((ctx.config.ticker_blacklist || []).map((s) => s.toUpperCase()).includes(symbol)) continue;
      const price = await resolveTradableEquityPrice(symbol, alpaca, allowedExchanges);
      if (!price) continue;

      const sentiment = boundedSentiment(clampedMacro * sourceWeight);

      signals.push({
        symbol,
        source: "fred_macro",
        source_detail: "fred:macro_regime",
        sentiment,
        raw_sentiment: clampedMacro,
        volume: 1,
        freshness: 1,
        source_weight: sourceWeight,
        reason: toSignalReason("FRED", `macro regime bias (${seriesIds.join(",")})`),
        timestamp: Date.now(),
        price,
      });
      await ctx.sleep(30);
    }

    ctx.log("FredMacro", "gathered_signals", { count: signals.length });
    return signals;
  },
};
