/**
 * Polygon News gatherer — actionable catalysts from recent market headlines.
 *
 * Filters symbols to tradable + priced assets before emitting signals.
 */

import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import { isCryptoSymbol, normalizeCryptoSymbol } from "../helpers/crypto";
import { calculateTimeDecay, detectSentiment } from "../helpers/sentiment";

interface PolygonArticle {
  title?: string;
  description?: string;
  ticker?: string;
  tickers?: string[];
  source?: string;
  published_utc?: string;
}

interface PolygonNewsResponse {
  results?: PolygonArticle[];
}

type AggregatedTicker = {
  mentions: number;
  sentimentNumerator: number;
  totalDecay: number;
  sourceDetails: Set<string>;
  freshestPublished: number;
  latestTitle: string;
};

function isConfiguredCryptoSymbol(symbol: string, configured: string[]): boolean {
  const normalized = normalizeCryptoSymbol(symbol);
  return configured.some((candidate) => normalizeCryptoSymbol(candidate) === normalized);
}

function parsePublishedSeconds(publishedUtc?: string): number {
  if (!publishedUtc) return Math.floor(Date.now() / 1000);
  const ms = new Date(publishedUtc).getTime();
  if (!Number.isFinite(ms)) return Math.floor(Date.now() / 1000);
  return Math.floor(ms / 1000);
}

export const polygonNewsGatherer: Gatherer = {
  name: "polygon_news",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    const apiKey = ctx.env.POLYGON_API_KEY;
    if (!apiKey) {
      ctx.log("PolygonNews", "disabled_no_key", {});
      return [];
    }

    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const sourceWeight = SOURCE_CONFIG.weights.polygon_news ?? 0.88;
    const alpaca = createAlpacaProviders(ctx.env);

    try {
      const MAX_TICKERS_TO_VALIDATE = 25;
      const lookbackHours = 4;
      const publishedGteIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
      const url = new URL("https://api.polygon.io/v2/reference/news");
      url.searchParams.set("limit", "50");
      url.searchParams.set("order", "desc");
      url.searchParams.set("sort", "published_utc");
      url.searchParams.set("published_utc.gte", publishedGteIso);
      url.searchParams.set("apiKey", apiKey);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        ctx.log("PolygonNews", "api_error", { status: res.status });
        return [];
      }

      const payload = (await res.json()) as PolygonNewsResponse;
      const articles = payload.results || [];
      if (articles.length === 0) {
        ctx.log("PolygonNews", "no_articles", {});
        return [];
      }

      const aggregated = new Map<string, AggregatedTicker>();

      for (const article of articles) {
        const text = `${article.title || ""} ${article.description || ""}`.trim();
        if (!text) continue;

        const tickers =
          article.tickers && article.tickers.length > 0 ? article.tickers : article.ticker ? [article.ticker] : [];
        if (tickers.length === 0) continue;

        const rawSentiment = detectSentiment(text);
        const publishedSec = parsePublishedSeconds(article.published_utc);
        const decay = calculateTimeDecay(publishedSec);

        for (const raw of tickers) {
          const symbol = raw.toUpperCase().trim();
          if (!symbol) continue;

          let entry = aggregated.get(symbol);
          if (!entry) {
            entry = {
              mentions: 0,
              sentimentNumerator: 0,
              totalDecay: 0,
              sourceDetails: new Set<string>(),
              freshestPublished: 0,
              latestTitle: article.title || "Polygon news catalyst",
            };
            aggregated.set(symbol, entry);
          }

          entry.mentions += 1;
          entry.sentimentNumerator += rawSentiment * decay;
          entry.totalDecay += decay;
          if (article.source) entry.sourceDetails.add(article.source);
          if (publishedSec >= entry.freshestPublished) {
            entry.freshestPublished = publishedSec;
            entry.latestTitle = article.title || entry.latestTitle;
          }
        }
      }

      const rankedCandidates = Array.from(aggregated.entries()).sort((a, b) => {
        if (b[1].mentions !== a[1].mentions) return b[1].mentions - a[1].mentions;
        return Math.abs(b[1].sentimentNumerator) - Math.abs(a[1].sentimentNumerator);
      });

      const dedupedCandidates: Array<[string, AggregatedTicker]> = [];
      const seenActionabilityKeys = new Set<string>();
      for (const [symbol, data] of rankedCandidates) {
        const normalizedSymbol = symbol.toUpperCase();
        const isCryptoCandidate = isCryptoSymbol(normalizedSymbol, ctx.config.crypto_symbols || []);
        const key = isCryptoCandidate
          ? `crypto:${normalizeCryptoSymbol(normalizedSymbol)}`
          : `equity:${normalizedSymbol}`;
        if (seenActionabilityKeys.has(key)) continue;
        seenActionabilityKeys.add(key);
        dedupedCandidates.push([symbol, data]);
        if (dedupedCandidates.length >= MAX_TICKERS_TO_VALIDATE) break;
      }

      const actionableSignals: Signal[] = [];
      for (const [symbol, data] of dedupedCandidates) {
        let actionable = false;
        let price = 0;

        try {
          const configuredCrypto = isCryptoSymbol(symbol, ctx.config.crypto_symbols || []);
          if (configuredCrypto) {
            const normalized = normalizeCryptoSymbol(symbol);
            if (!isConfiguredCryptoSymbol(normalized, ctx.config.crypto_symbols || [])) {
              continue;
            }
            const snapshot = await alpaca.marketData.getCryptoSnapshot(normalized).catch(() => null);
            price = snapshot?.latest_trade?.price || snapshot?.latest_quote?.ask_price || 0;
            actionable = price > 0;
          } else {
            const asset = await alpaca.trading.getAsset(symbol).catch(() => null);
            if (asset && asset.tradable && allowedExchanges.includes(asset.exchange)) {
              const snapshot = await alpaca.marketData.getSnapshot(symbol).catch(() => null);
              price = snapshot?.latest_trade?.price || snapshot?.latest_quote?.ask_price || 0;
              actionable = price > 0;
            }
          }
        } catch {
          actionable = false;
        }

        if (!actionable) continue;

        const avgRawSentiment = data.totalDecay > 0 ? data.sentimentNumerator / data.totalDecay : 0;
        const freshness = calculateTimeDecay(data.freshestPublished || Math.floor(Date.now() / 1000));
        const weightedSentiment = avgRawSentiment * sourceWeight * freshness;

        actionableSignals.push({
          symbol,
          source: "polygon_news",
          source_detail:
            data.sourceDetails.size > 0
              ? `polygon:${Array.from(data.sourceDetails).join("+").slice(0, 80)}`
              : "polygon:news",
          sentiment: weightedSentiment,
          raw_sentiment: avgRawSentiment,
          volume: data.mentions,
          freshness,
          source_weight: sourceWeight,
          reason: `Polygon: ${data.latestTitle.slice(0, 120)}`,
          timestamp: Date.now(),
          price,
        });

        await ctx.sleep(100);
      }

      const capped = actionableSignals.sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment)).slice(0, 20);

      ctx.log("PolygonNews", "gathered_signals", {
        articles: articles.length,
        candidates: dedupedCandidates.length,
        actionable: capped.length,
        capped_off: Math.max(0, aggregated.size - dedupedCandidates.length),
      });
      return capped;
    } catch (error) {
      ctx.log("PolygonNews", "error", { message: String(error) });
      return [];
    }
  },
};
