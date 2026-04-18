import type { Signal, SignalActionability } from "../core/types";
import { isCryptoSymbol, normalizeCryptoSymbol } from "../strategy/default/helpers/crypto";

type AssetLookup = { tradable: boolean; exchange: string } | null;
type SnapshotLookup = { latest_trade?: { price?: number }; latest_quote?: { ask_price?: number } } | null;

export interface ActionabilityDeps {
  signal: Signal;
  cryptoSymbols: string[];
  allowedExchanges: string[];
  nowMs: number;
  getAsset: (symbol: string) => Promise<AssetLookup>;
  getEquitySnapshot: (symbol: string) => Promise<SnapshotLookup>;
  getCryptoSnapshot: (symbol: string) => Promise<SnapshotLookup>;
}

function extractPrice(snapshot: SnapshotLookup): number {
  return snapshot?.latest_trade?.price || snapshot?.latest_quote?.ask_price || 0;
}

function isConfiguredCryptoSymbol(symbol: string, configured: string[]): boolean {
  const normalizedInput = normalizeCryptoSymbol(symbol);
  return configured.some((candidate) => normalizeCryptoSymbol(candidate) === normalizedInput);
}

export async function determineSignalActionability(deps: ActionabilityDeps): Promise<SignalActionability> {
  const { signal, cryptoSymbols, allowedExchanges, nowMs } = deps;
  const symbol = signal.symbol;

  try {
    if (signal.isCrypto || isCryptoSymbol(symbol, cryptoSymbols) || symbol.includes("/")) {
      const normalized = normalizeCryptoSymbol(symbol);
      if (!isConfiguredCryptoSymbol(normalized, cryptoSymbols)) {
        return {
          is_actionable: false,
          reason: "crypto_symbol_not_configured",
          price: null,
          normalized_symbol: normalized,
          asset_class: "crypto",
          checked_at: nowMs,
        };
      }

      const snapshot = await deps.getCryptoSnapshot(normalized);
      const price = extractPrice(snapshot);
      return {
        is_actionable: price > 0,
        reason: price > 0 ? "ok" : "no_price",
        price: price > 0 ? price : null,
        normalized_symbol: normalized,
        asset_class: "crypto",
        checked_at: nowMs,
      };
    }

    const asset = await deps.getAsset(symbol);
    if (!asset) {
      return {
        is_actionable: false,
        reason: "asset_not_found",
        price: null,
        asset_class: "us_equity",
        checked_at: nowMs,
      };
    }
    if (!asset.tradable) {
      return {
        is_actionable: false,
        reason: "asset_not_tradable",
        price: null,
        asset_class: "us_equity",
        checked_at: nowMs,
      };
    }
    if (allowedExchanges.length > 0 && !allowedExchanges.includes(asset.exchange)) {
      return {
        is_actionable: false,
        reason: "exchange_not_allowed",
        price: null,
        asset_class: "us_equity",
        checked_at: nowMs,
      };
    }

    const snapshot = await deps.getEquitySnapshot(symbol);
    const price = extractPrice(snapshot);
    return {
      is_actionable: price > 0,
      reason: price > 0 ? "ok" : "no_price",
      price: price > 0 ? price : null,
      asset_class: "us_equity",
      checked_at: nowMs,
    };
  } catch {
    return {
      is_actionable: false,
      reason: "lookup_failed",
      price: null,
      checked_at: nowMs,
    };
  }
}
