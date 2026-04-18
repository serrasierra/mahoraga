/**
 * Finnhub — single-call general market news bundle, cached with KV TTL.
 * Uses one `/news?category=general` request per cache window; symbols come from article `related` fields.
 */

import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import { calculateTimeDecay } from "../helpers/sentiment";
import {
  boundedSentiment,
  cachedJsonFetch,
  resolveTradableEquityPrice,
  shouldRunSource,
  toSignalReason,
} from "./helpers/source-guards";

interface FinnhubNewsItem {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
}

function parseRelatedTickers(related: string | undefined): string[] {
  if (!related || typeof related !== "string") return [];
  const out: string[] = [];
  for (const part of related.split(/[,\s]+/)) {
    const s = part.replace(/^[\s$]+/, "").toUpperCase().trim();
    if (/^[A-Z]{1,5}$/.test(s)) out.push(s);
  }
  return out;
}

function tickersFromHeadline(headline: string | undefined, allow: Set<string>): string[] {
  if (!headline) return [];
  const caps = headline.toUpperCase().match(/\b([A-Z]{2,5})\b/g);
  if (!caps) return [];
  const out: string[] = [];
  for (const m of caps) {
    const s = m.toUpperCase();
    if (allow.has(s)) out.push(s);
  }
  return out;
}

/** Uppercase tokens that look like tickers but are usually English / media (not equities). */
const HEADLINE_TICKER_STOPWORDS = new Set([
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HAS",
  "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "TWO", "WHO", "BOY", "DID", "LET", "PUT", "SAY", "SHE",
  "TOO", "USE", "ANY", "BAD", "BIG", "END", "FAR", "FEW", "GOT", "MAN", "MEN", "MET", "MRS", "OFF", "OWN", "RED", "RUN",
  "SAID", "SAW", "SET", "SIX", "TEN", "TOP", "TRY", "VIA", "WAY", "WHY", "WIN", "YES", "YET", "CNN", "BBC", "USA", "CEO",
  "CFO", "IPO", "NYSE", "SEC", "GDP", "CPI", "EPS", "ATH", "YTD", "LAST", "NEXT", "WEEK", "YEAR", "TIME", "JUST", "OVER",
]);

function headlineTickerCandidates(text: string | undefined): string[] {
  if (!text) return [];
  const caps = text.toUpperCase().match(/\b([A-Z]{2,5})\b/g);
  if (!caps) return [];
  const out: string[] = [];
  for (const m of caps) {
    const s = m.toUpperCase();
    if (HEADLINE_TICKER_STOPWORDS.has(s)) continue;
    if (/^[A-Z]{2,5}$/.test(s)) out.push(s);
  }
  return out;
}

/**
 * Strict: only symbols in `allow`. Relaxed: any ticker from Finnhub `related` + headline/summary candidates (minus stopwords).
 */
function pickSymbolsFromNews(
  sorted: FinnhubNewsItem[],
  maxSymbols: number,
  allow: Set<string>,
  blocked: Set<string>,
  strict: boolean
): { symbol: string; raw: number; published: number }[] {
  const picked: { symbol: string; raw: number; published: number }[] = [];
  const seen = new Set<string>();

  outer: for (const article of sorted) {
    const text = `${article.headline || ""} ${article.summary || ""}`;
    const raw = headlineSentiment(text);
    const published = article.datetime || Math.floor(Date.now() / 1000);

    const tickers = strict
      ? [
          ...parseRelatedTickers(article.related),
          ...tickersFromHeadline(article.headline, allow),
          ...tickersFromHeadline(article.summary, allow),
        ]
      : [
          ...parseRelatedTickers(article.related),
          ...headlineTickerCandidates(article.headline),
          ...headlineTickerCandidates(article.summary),
        ];

    for (const sym of tickers) {
      if (!/^[A-Z]{1,5}$/.test(sym)) continue;
      if (blocked.has(sym) || seen.has(sym)) continue;
      if (strict && !allow.has(sym)) continue;

      seen.add(sym);
      picked.push({ symbol: sym, raw, published });
      if (picked.length >= maxSymbols) break outer;
    }
  }

  return picked;
}

function headlineSentiment(text: string): number {
  const t = text.toLowerCase();
  let score = 0;
  const neg = ["crash", "plunge", "lawsuit", "bear", "miss", "cut", "fraud", "probe", "downgrade", "bankrupt", "selloff"];
  const pos = ["beat", "upgrade", "surge", "record", "growth", "bull", "breakthrough", "expands", "soars", "rally"];
  for (const w of neg) if (t.includes(w)) score -= 0.12;
  for (const w of pos) if (t.includes(w)) score += 0.12;
  return boundedSentiment(score);
}

export const finnhubBundleGatherer: Gatherer = {
  name: "finnhub_bundle",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSource(ctx, "FinnhubBundle", ctx.config.finnhub_enabled, ctx.env.FINNHUB_API_KEY)) {
      return [];
    }

    const token = ctx.env.FINNHUB_API_KEY!;
    const maxSymbols = Math.min(30, Math.max(1, ctx.config.finnhub_max_symbols ?? 10));
    const ttl = ctx.config.finnhub_cache_ttl_seconds ?? 240;
    const allow = new Set(
      (ctx.config.finnhub_symbols || []).map((s) => s.replace(/^[\s$]+/, "").toUpperCase().trim()).filter(Boolean)
    );
    const blocked = new Set((ctx.config.ticker_blacklist || []).map((s) => s.toUpperCase()));
    const sourceWeight = SOURCE_CONFIG.weights.finnhub_bundle ?? 0.82;
    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const alpaca = createAlpacaProviders(ctx.env);

    const url = new URL("https://finnhub.io/api/v1/news");
    url.searchParams.set("category", "general");
    url.searchParams.set("token", token);

    const { data, fromCache } = await cachedJsonFetch<FinnhubNewsItem[]>(ctx, {
      namespace: "finnhub",
      cacheKeySuffix: "news:general:v1",
      ttlSeconds: ttl,
      url: url.toString(),
      label: "FinnhubBundle",
    });

    if (!data || !Array.isArray(data) || data.length === 0) {
      ctx.log("FinnhubBundle", "no_data", { fromCache });
      return [];
    }

    const sorted = [...data].sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

    let picked = pickSymbolsFromNews(sorted, maxSymbols, allow, blocked, true);
    if (picked.length === 0) {
      picked = pickSymbolsFromNews(sorted, maxSymbols, allow, blocked, false);
      if (picked.length > 0) {
        ctx.log("FinnhubBundle", "relaxed_symbol_match", { count: picked.length, fromCache });
      }
    }

    if (picked.length === 0) {
      ctx.log("FinnhubBundle", "no_matching_symbols", { articles: data.length, fromCache });
      return [];
    }

    const signals: Signal[] = [];
    for (const item of picked) {
      try {
        const price = await resolveTradableEquityPrice(item.symbol, alpaca, allowedExchanges);
        if (!price) continue;

        const freshness = calculateTimeDecay(item.published);
        const sentiment = boundedSentiment(item.raw * sourceWeight * freshness);

        signals.push({
          symbol: item.symbol,
          source: "finnhub_bundle",
          source_detail: "finnhub:general_news",
          sentiment,
          raw_sentiment: item.raw,
          volume: 1,
          freshness,
          source_weight: sourceWeight,
          reason: toSignalReason("Finnhub", `${item.symbol} general news (${fromCache ? "cache" : "live"})`),
          timestamp: Date.now(),
          price,
        });
        await ctx.sleep(40);
      } catch {
        /* continue */
      }
    }

    ctx.log("FinnhubBundle", "gathered_signals", { count: signals.length, candidates: picked.length });
    return signals;
  },
};
