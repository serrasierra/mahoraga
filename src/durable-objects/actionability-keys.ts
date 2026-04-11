import type { Signal } from "../core/types";
import { isCryptoSymbol, normalizeCryptoSymbol } from "../strategy/default/helpers/crypto";

export function getActionabilityKey(symbol: string, cryptoSymbols: string[]): string {
  const normalizedSymbol = symbol.toUpperCase().trim();
  if (isCryptoSymbol(normalizedSymbol, cryptoSymbols) || normalizedSymbol.includes("/")) {
    return `crypto:${normalizeCryptoSymbol(normalizedSymbol)}`;
  }
  return `equity:${normalizedSymbol}`;
}

export function selectUniqueActionabilityCandidates(
  signals: Signal[],
  cryptoSymbols: string[],
  maxCandidates: number
): Array<[string, Signal]> {
  const byKey = new Map<string, Signal>();
  for (const signal of signals) {
    const key = getActionabilityKey(signal.symbol, cryptoSymbols);
    if (byKey.has(key)) continue;
    byKey.set(key, signal);
    if (byKey.size >= maxCandidates) break;
  }
  return Array.from(byKey.entries());
}
