import type { Signal } from "../../../core/types";
import { createAlpacaProviders } from "../../../providers/alpaca";
import type { Gatherer, StrategyContext } from "../../types";
import { SOURCE_CONFIG } from "../config";
import { calculateTimeDecay } from "../helpers/sentiment";
import {
  boundedSentiment,
  capUniqueActionabilitySymbols,
  resolveTradableEquityPrice,
  shouldRunSource,
  toSignalReason,
} from "./helpers/source-guards";

interface OptionsFlowRow {
  symbol?: string;
  ticker?: string;
  underlying_symbol?: string;
  sentiment?: string;
  direction?: string;
  option_type?: string;
  side?: string;
  premium?: number | string;
  notional?: number | string;
  total_premium?: number | string;
  size?: number | string;
  sale_cond_codes?: string | string[];
  trade_code?: string;
  created_at?: string;
  timestamp?: string;
}

interface OptionsFlowResponse {
  data?: OptionsFlowRow[];
  results?: OptionsFlowRow[];
  trades?: OptionsFlowRow[];
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const stripped = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(stripped);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getSymbol(row: OptionsFlowRow): string {
  return (row.symbol || row.ticker || row.underlying_symbol || "").toUpperCase().trim();
}

function getPremium(row: OptionsFlowRow): number {
  return Math.max(asNumber(row.premium), asNumber(row.notional), asNumber(row.total_premium));
}

function isDisallowedTradeCode(row: OptionsFlowRow): boolean {
  const tradeCode = (row.trade_code || "").toLowerCase();
  if (tradeCode === "derivative_priced") return true;

  const saleCodes = Array.isArray(row.sale_cond_codes) ? row.sale_cond_codes.join(",") : row.sale_cond_codes || "";
  return saleCodes.toLowerCase().includes("average_price_trade");
}

function sentimentFromRow(row: OptionsFlowRow): number {
  const text = `${row.sentiment || ""} ${row.direction || ""} ${row.option_type || ""} ${row.side || ""}`.toLowerCase();
  if (text.includes("bear") || text.includes("put") || text.includes("sell")) return -0.65;
  if (text.includes("bull") || text.includes("call") || text.includes("buy")) return 0.65;
  return 0.2;
}

export const optionsFlowGatherer: Gatherer = {
  name: "options_flow",
  gather: async (ctx: StrategyContext): Promise<Signal[]> => {
    if (!shouldRunSource(ctx, "OptionsFlow", ctx.config.uoa_enabled, ctx.env.UNUSUAL_WHALES_API_KEY)) return [];

    const sourceWeight = SOURCE_CONFIG.weights.options_flow ?? 0.95;
    const maxCandidates = ctx.config.uoa_max_candidates ?? 10;
    const minPremium = ctx.config.uoa_min_premium ?? 100_000;
    const allowedExchanges = ctx.config.allowed_exchanges ?? ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"];
    const alpaca = createAlpacaProviders(ctx.env);

    try {
      const url = new URL("https://api.unusualwhales.com/api/option-trades/flow-alerts");
      url.searchParams.set("limit", String(Math.max(25, maxCandidates * 5)));
      url.searchParams.set("min_premium", String(minPremium));

      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${ctx.env.UNUSUAL_WHALES_API_KEY}`,
        },
      });
      if (!res.ok) {
        ctx.log("OptionsFlow", "api_error", { status: res.status });
        return [];
      }

      const payload = (await res.json()) as OptionsFlowResponse;
      const rows = payload.data || payload.results || payload.trades || [];
      if (rows.length === 0) {
        ctx.log("OptionsFlow", "no_data", {});
        return [];
      }

      const ranked = rows
        .map((row) => {
          const symbol = getSymbol(row);
          const premium = getPremium(row);
          const raw = sentimentFromRow(row);
          return { row, symbol, premium, raw };
        })
        .filter((item) => item.symbol && item.premium >= minPremium)
        .filter((item) => !isDisallowedTradeCode(item.row))
        .sort((a, b) => b.premium - a.premium);

      const selected = capUniqueActionabilitySymbols(
        ranked.map((item) => ({ ...item, symbol: item.symbol })),
        ctx.config.crypto_symbols || [],
        maxCandidates
      );

      const signals: Signal[] = [];
      for (const candidate of selected) {
        const price = await resolveTradableEquityPrice(candidate.symbol, alpaca, allowedExchanges);
        if (!price) continue;

        const ts = candidate.row.created_at || candidate.row.timestamp;
        const published = ts ? Math.floor(new Date(ts).getTime() / 1000) : Math.floor(Date.now() / 1000);
        const freshness = calculateTimeDecay(published);
        const sentiment = boundedSentiment(candidate.raw * sourceWeight * freshness);

        signals.push({
          symbol: candidate.symbol,
          source: "options_flow",
          source_detail: "uoa:flow_alert",
          sentiment,
          raw_sentiment: candidate.raw,
          volume: Math.max(1, Math.round(asNumber(candidate.row.size) || 1)),
          freshness,
          source_weight: sourceWeight,
          reason: toSignalReason(
            "UOA",
            `${candidate.symbol} premium ${Math.round(candidate.premium).toLocaleString()} direction ${(candidate.row.direction || "unknown").toUpperCase()}`
          ),
          timestamp: Date.now(),
          price,
        });
        await ctx.sleep(50);
      }

      ctx.log("OptionsFlow", "gathered_signals", {
        candidates: ranked.length,
        actionable: signals.length,
      });
      return signals;
    } catch (error) {
      ctx.log("OptionsFlow", "error", { message: String(error) });
      return [];
    }
  },
};
