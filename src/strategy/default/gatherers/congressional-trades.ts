import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import {
  boundedSentiment,
  capUniqueActionabilitySymbols,
  resolveTradableEquityPrice,
  shouldRunSource,
  toSignalReason,
} from "./helpers/source-guards";

interface CongressionalRow {
  symbol?: string;
  ticker?: string;
  transaction_type?: string;
  type?: string;
  owner?: string;
  amount?: string;
  amount_from?: number | string;
  amount_to?: number | string;
  representative?: string;
  disclosure_date?: string;
  transaction_date?: string;
}

function parseRangeMidpoint(input?: string): number {
  if (!input) return 0;
  const parts = input
    .split("-")
    .map((part) => Number(part.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length === 0) return 0;
  if (parts.length === 1) return parts[0] ?? 0;
  return ((parts[0] ?? 0) + (parts[1] ?? 0)) / 2;
}

function parseMidpoint(row: CongressionalRow): number {
  const from = Number(row.amount_from || 0);
  const to = Number(row.amount_to || 0);
  if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > 0) return (from + to) / 2;
  return parseRangeMidpoint(row.amount);
}

function ownershipMultiplier(owner?: string): number {
  const value = (owner || "").toLowerCase();
  if (value.includes("self")) return 1.5;
  if (value.includes("spouse") || value.includes("joint") || value.includes("jt")) return 0.5;
  return 1;
}

function directionFromTransaction(type?: string): number {
  const value = (type || "").toLowerCase();
  if (value.includes("sale") || value.includes("sell")) return -1;
  if (value.includes("purchase") || value.includes("buy")) return 1;
  return 0;
}

function isWithinLookback(row: CongressionalRow, lookbackDays: number): boolean {
  const raw = row.transaction_date || row.disclosure_date;
  if (!raw) return true;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return true;
  return ts >= Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
}

export const congressionalTradesGatherer: Gatherer = {
  name: "congressional",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSource(ctx, "Congressional", ctx.config.congressional_enabled, ctx.env.FMP_API_KEY)) return [];

    const sourceWeight = SOURCE_CONFIG.weights.congressional ?? 0.9;
    const maxCandidates = ctx.config.congressional_max_candidates ?? 10;
    const lookbackDays = ctx.config.congressional_lookback_days ?? 14;
    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const alpaca = createAlpacaProviders(ctx.env);

    const houseUrl = `https://financialmodelingprep.com/api/v4/house-trading?apikey=${ctx.env.FMP_API_KEY}`;
    const senateUrl = `https://financialmodelingprep.com/api/v4/senate-trading?apikey=${ctx.env.FMP_API_KEY}`;

    try {
      const [houseRes, senateRes] = await Promise.all([fetch(houseUrl), fetch(senateUrl)]);
      if (!houseRes.ok || !senateRes.ok) {
        ctx.log("Congressional", "api_error", { house_status: houseRes.status, senate_status: senateRes.status });
        return [];
      }
      const houseRows = ((await houseRes.json()) as CongressionalRow[]) || [];
      const senateRows = ((await senateRes.json()) as CongressionalRow[]) || [];
      const all = [...houseRows, ...senateRows];

      const aggregated = new Map<
        string,
        { weighted: number; mentions: number; totalValue: number; latestDate: number; representative: string }
      >();

      for (const row of all) {
        const symbol = (row.symbol || row.ticker || "").toUpperCase().trim();
        if (!symbol) continue;
        if (!isWithinLookback(row, lookbackDays)) continue;

        const direction = directionFromTransaction(row.transaction_type || row.type);
        if (direction === 0) continue;
        const midpoint = parseMidpoint(row);
        if (midpoint <= 0) continue;

        const ownMult = ownershipMultiplier(row.owner);
        const magnitude = Math.max(0.15, Math.min(1, Math.log10(midpoint) / 6));
        const score = direction * ownMult * magnitude;
        const when = new Date(row.transaction_date || row.disclosure_date || Date.now()).getTime();

        const current = aggregated.get(symbol) ?? {
          weighted: 0,
          mentions: 0,
          totalValue: 0,
          latestDate: 0,
          representative: row.representative || "Congress filing",
        };
        current.weighted += score;
        current.mentions += 1;
        current.totalValue += midpoint;
        if (when > current.latestDate) {
          current.latestDate = when;
          current.representative = row.representative || current.representative;
        }
        aggregated.set(symbol, current);
      }

      const ranked = Array.from(aggregated.entries())
        .map(([symbol, data]) => ({ symbol, ...data }))
        .sort((a, b) => Math.abs(b.weighted) - Math.abs(a.weighted));
      const selected = capUniqueActionabilitySymbols(ranked, ctx.config.crypto_symbols || [], maxCandidates);

      const signals: Signal[] = [];
      for (const item of selected) {
        const price = await resolveTradableEquityPrice(item.symbol, alpaca, allowedExchanges);
        if (!price) continue;

        const rawSentiment = boundedSentiment(item.weighted / Math.max(1, item.mentions));
        const freshness = 1;
        signals.push({
          symbol: item.symbol,
          source: "congressional",
          source_detail: "fmp:house_senate",
          sentiment: boundedSentiment(rawSentiment * sourceWeight),
          raw_sentiment: rawSentiment,
          volume: item.mentions,
          freshness,
          source_weight: sourceWeight,
          reason: toSignalReason(
            "Congress",
            `${item.representative} filings total ~$${Math.round(item.totalValue).toLocaleString()} across ${item.mentions} trades`
          ),
          timestamp: Date.now(),
          price,
        });
        await ctx.sleep(50);
      }

      ctx.log("Congressional", "gathered_signals", {
        rows: all.length,
        candidates: ranked.length,
        actionable: signals.length,
      });
      return signals;
    } catch (error) {
      ctx.log("Congressional", "error", { message: String(error) });
      return [];
    }
  },
};

export const congressionalInternals = {
  parseRangeMidpoint,
  parseMidpoint,
  ownershipMultiplier,
  directionFromTransaction,
};
