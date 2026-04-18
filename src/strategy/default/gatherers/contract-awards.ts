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

interface ContractAwardRow {
  award_id?: string;
  id?: string;
  symbol?: string;
  ticker?: string;
  contractor_ticker?: string;
  amount?: number | string;
  obligated_amount?: number | string;
  value?: number | string;
  agency?: string;
  description?: string;
  awarded_at?: string;
  award_date?: string;
}

interface ContractAwardResponse {
  data?: ContractAwardRow[];
  results?: ContractAwardRow[];
}

function pickTicker(row: ContractAwardRow): string {
  return (row.symbol || row.ticker || row.contractor_ticker || "").toUpperCase().trim();
}

function parseAmount(row: ContractAwardRow): number {
  const numeric = [row.amount, row.obligated_amount, row.value]
    .map((value) => (typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : Number(value || 0)))
    .find((value) => Number.isFinite(value) && value > 0);
  return numeric || 0;
}

function parseAwardId(row: ContractAwardRow): string {
  return String(row.award_id || row.id || "").trim();
}

function isWithinLookback(row: ContractAwardRow, days: number): boolean {
  const raw = row.awarded_at || row.award_date;
  if (!raw) return true;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return true;
  return ts >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export const contractAwardsGatherer: Gatherer = {
  name: "contract_awards",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSource(ctx, "ContractAwards", ctx.config.contract_awards_enabled, ctx.env.GOVCON_API_KEY)) return [];

    const sourceWeight = SOURCE_CONFIG.weights.contract_awards ?? 0.85;
    const maxCandidates = ctx.config.contract_awards_max_candidates ?? 10;
    const lookbackDays = ctx.config.contract_awards_lookback_days ?? 30;
    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const alpaca = createAlpacaProviders(ctx.env);

    try {
      const url = "https://api.govconapi.com/api/v1/awards/intelligence";
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${ctx.env.GOVCON_API_KEY}`,
          "x-api-key": ctx.env.GOVCON_API_KEY || "",
        },
      });
      if (!res.ok) {
        ctx.log("ContractAwards", "api_error", { status: res.status });
        return [];
      }

      const payload = (await res.json()) as ContractAwardResponse;
      const rows = payload.data || payload.results || [];
      if (rows.length === 0) {
        ctx.log("ContractAwards", "no_data", {});
        return [];
      }

      const seenAwards = new Set<string>();
      const aggregated = new Map<string, { totalAmount: number; awards: number; agency: string; headline: string }>();
      for (const row of rows) {
        if (!isWithinLookback(row, lookbackDays)) continue;

        const symbol = pickTicker(row);
        const amount = parseAmount(row);
        if (!symbol || amount <= 0) continue;

        const awardId = parseAwardId(row);
        const dedupeKey = awardId ? `${awardId}:${symbol}` : `${symbol}:${Math.round(amount)}:${row.award_date || ""}`;
        if (seenAwards.has(dedupeKey)) continue;
        seenAwards.add(dedupeKey);

        const current = aggregated.get(symbol) ?? {
          totalAmount: 0,
          awards: 0,
          agency: row.agency || "Federal award",
          headline: row.description || "Federal contract award",
        };
        current.totalAmount += amount;
        current.awards += 1;
        if (row.agency) current.agency = row.agency;
        if (row.description) current.headline = row.description;
        aggregated.set(symbol, current);
      }

      const ranked = Array.from(aggregated.entries())
        .map(([symbol, data]) => ({ symbol, ...data }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      const selected = capUniqueActionabilitySymbols(ranked, ctx.config.crypto_symbols || [], maxCandidates);

      const signals: Signal[] = [];
      for (const item of selected) {
        const price = await resolveTradableEquityPrice(item.symbol, alpaca, allowedExchanges);
        if (!price) continue;

        const rawSentiment = boundedSentiment(Math.max(0.2, Math.min(0.95, Math.log10(item.totalAmount) / 8)));
        signals.push({
          symbol: item.symbol,
          source: "contract_awards",
          source_detail: "govcon:awards",
          sentiment: boundedSentiment(rawSentiment * sourceWeight),
          raw_sentiment: rawSentiment,
          volume: item.awards,
          freshness: 1,
          source_weight: sourceWeight,
          reason: toSignalReason(
            "GovCon",
            `${item.agency} awards total ~$${Math.round(item.totalAmount).toLocaleString()} (${item.awards} contracts)`
          ),
          timestamp: Date.now(),
          price,
        });
        await ctx.sleep(50);
      }

      ctx.log("ContractAwards", "gathered_signals", {
        rows: rows.length,
        candidates: ranked.length,
        actionable: signals.length,
      });
      return signals;
    } catch (error) {
      ctx.log("ContractAwards", "error", { message: String(error) });
      return [];
    }
  },
};

export const contractAwardsInternals = {
  pickTicker,
  parseAmount,
  parseAwardId,
};
