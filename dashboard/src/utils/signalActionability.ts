import type { SignalActionability } from "../types";

export interface ActionabilityView {
  isActionable: boolean;
  reasonLabel: string;
}

export function getActionabilityView(
  symbol: string,
  actionableSymbols: Set<string>,
  actionabilityMap: Record<string, SignalActionability>
): ActionabilityView {
  const isActionable = actionableSymbols.has(symbol);
  const reason = actionabilityMap[symbol]?.reason;
  return {
    isActionable,
    reasonLabel: reason ? reason.replaceAll("_", " ") : "unknown",
  };
}
