import { getActionabilityKey } from "../../../../durable-objects/actionability-keys";
import type { StrategyContext } from "../../../types";

type AlpacaLike = {
  trading: {
    getAsset: (symbol: string) => Promise<{ tradable?: boolean; exchange?: string } | null>;
  };
  marketData: {
    getSnapshot: (symbol: string) => Promise<{ latest_trade?: { price?: number }; latest_quote?: { ask_price?: number } } | null>;
  };
};

export function shouldRunSource(
  ctx: StrategyContext,
  sourceLabel: string,
  enabled: boolean | undefined,
  apiKey: string | undefined
): boolean {
  if (!enabled) {
    ctx.log(sourceLabel, "disabled_by_config", {});
    return false;
  }
  if (!apiKey) {
    ctx.log(sourceLabel, "disabled_no_key", {});
    return false;
  }
  return true;
}

export function capUniqueActionabilitySymbols<T extends { symbol: string }>(
  items: T[],
  cryptoSymbols: string[],
  maxCandidates: number
): T[] {
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const item of items) {
    const key = getActionabilityKey(item.symbol, cryptoSymbols);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= maxCandidates) break;
  }
  return selected;
}

export async function resolveTradableEquityPrice(
  symbol: string,
  alpaca: AlpacaLike,
  allowedExchanges: string[]
): Promise<number | null> {
  const normalized = symbol.toUpperCase().trim();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(normalized)) return null;

  const asset = await alpaca.trading.getAsset(normalized).catch(() => null);
  if (!asset?.tradable) return null;
  if (asset.exchange && !allowedExchanges.includes(asset.exchange)) return null;

  const snapshot = await alpaca.marketData.getSnapshot(normalized).catch(() => null);
  const price = snapshot?.latest_trade?.price || snapshot?.latest_quote?.ask_price || 0;
  return price > 0 ? price : null;
}

export function toSignalReason(source: string, detail: string): string {
  return `${source}: ${detail}`.slice(0, 180);
}

export function boundedSentiment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

const KV_SRC_PREFIX = "mahoraga:src:";

/**
 * Run a source that does not require an API key (still gated by config flag).
 */
export function shouldRunSourceNoKey(
  ctx: StrategyContext,
  sourceLabel: string,
  enabled: boolean | undefined
): boolean {
  if (!enabled) {
    ctx.log(sourceLabel, "disabled_by_config", {});
    return false;
  }
  return true;
}

export type CachedJsonFetchResult<T> = {
  data: T | null;
  fromCache: boolean;
};

/**
 * KV-backed JSON GET with soft TTL (KV expiration) and 429 exponential backoff + jitter.
 * Never throws — returns null data on hard failure (callers emit empty signals).
 */
export async function cachedJsonFetch<T>(
  ctx: StrategyContext,
  options: {
    namespace: string;
    cacheKeySuffix: string;
    ttlSeconds: number;
    url: string;
    init?: RequestInit;
    label: string;
    maxRetriesOn429?: number;
  }
): Promise<CachedJsonFetchResult<T>> {
  const { namespace, cacheKeySuffix, ttlSeconds, url, init, label, maxRetriesOn429 = 3 } = options;
  const key = `${KV_SRC_PREFIX}${namespace}:${cacheKeySuffix}`;
  const cache = ctx.env.CACHE;

  const readCache = async (): Promise<T | null> => {
    if (!cache) return null;
    const raw = await cache.get(key, "text").catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  try {
    const cached = await readCache();
    if (cached !== null) {
      ctx.log(label, "cache_hit", { key: cacheKeySuffix });
      return { data: cached, fromCache: true };
    }

    for (let attempt = 0; attempt <= maxRetriesOn429; attempt++) {
      const res = await fetch(url, init);
      if (res.status === 429) {
        ctx.log(label, "rate_limited_429", { attempt, url: url.slice(0, 96) });
        if (attempt < maxRetriesOn429) {
          const base = Math.min(30_000, 500 * 2 ** attempt);
          const jitter = Math.floor(Math.random() * 400);
          await ctx.sleep(base + jitter);
          continue;
        }
        const stale = await readCache();
        if (stale !== null) {
          ctx.log(label, "fallback_cache_after_429", {});
          return { data: stale, fromCache: true };
        }
        return { data: null, fromCache: false };
      }

      if (!res.ok) {
        ctx.log(label, "http_error", { status: res.status });
        const stale = await readCache();
        if (stale !== null) {
          ctx.log(label, "fallback_stale_cache", { status: res.status });
          return { data: stale, fromCache: true };
        }
        return { data: null, fromCache: false };
      }

      const text = await res.text();
      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        ctx.log(label, "json_parse_error", {});
        return { data: null, fromCache: false };
      }

      if (cache) {
        await cache.put(key, JSON.stringify(data), { expirationTtl: Math.max(60, ttlSeconds) }).catch(() => {});
      }
      return { data, fromCache: false };
    }

    return { data: null, fromCache: false };
  } catch (error) {
    ctx.log(label, "fetch_error", { message: String(error) });
    const stale = await readCache();
    if (stale !== null) {
      return { data: stale, fromCache: true };
    }
    return { data: null, fromCache: false };
  }
}

