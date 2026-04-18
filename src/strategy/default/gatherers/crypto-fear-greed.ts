/**
 * Alternative.me Crypto Fear & Greed — no API key; KV-cached polling.
 */

import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import {
  boundedSentiment,
  cachedJsonFetch,
  shouldRunSourceNoKey,
  toSignalReason,
} from "./helpers/source-guards";

function parseFngIndex(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { value?: unknown };
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const cryptoFearGreedGatherer: Gatherer = {
  name: "crypto_fear_greed",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSourceNoKey(ctx, "CryptoFearGreed", ctx.config.crypto_fng_enabled)) {
      return [];
    }

    const ttl = ctx.config.crypto_fng_cache_ttl_seconds ?? 1200;
    const sourceWeight = SOURCE_CONFIG.weights.crypto_fear_greed ?? 0.55;
    const symbols = ctx.config.crypto_symbols || ["BTC/USD", "ETH/USD"];
    const alpaca = createAlpacaProviders(ctx.env);

    const { data, fromCache } = await cachedJsonFetch<unknown>(ctx, {
      namespace: "altme",
      cacheKeySuffix: "fng:v1",
      ttlSeconds: ttl,
      url: "https://api.alternative.me/fng/?limit=1",
      label: "CryptoFearGreed",
    });

    const idx = data !== null ? parseFngIndex(data) : null;
    if (idx === null) {
      ctx.log("CryptoFearGreed", "no_index", { fromCache });
      return [];
    }

    const raw = boundedSentiment(((idx - 50) / 50) * 0.35);
    const signals: Signal[] = [];

    for (const symbol of symbols) {
      try {
        const snapshot = await alpaca.marketData.getCryptoSnapshot(symbol);
        const price = snapshot?.latest_trade?.price || 0;
        if (!price) continue;

        const sentiment = boundedSentiment(raw * sourceWeight);

        signals.push({
          symbol,
          source: "crypto_fear_greed",
          source_detail: "alternative_me:fng",
          sentiment,
          raw_sentiment: raw,
          volume: snapshot?.daily_bar?.v || 1,
          freshness: 1,
          source_weight: sourceWeight,
          reason: toSignalReason("F&G", `crypto fear/greed ${idx} (${fromCache ? "cache" : "live"})`),
          timestamp: Date.now(),
          isCrypto: true,
          price,
        });
        await ctx.sleep(50);
      } catch {
        /* continue */
      }
    }

    ctx.log("CryptoFearGreed", "gathered_signals", { count: signals.length });
    return signals;
  },
};
