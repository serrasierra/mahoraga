import { describe, expect, it } from "vitest";
import type { Signal } from "../core/types";
import { getActionabilityKey, selectUniqueActionabilityCandidates } from "./actionability-keys";

function makeSignal(symbol: string): Signal {
  return {
    symbol,
    source: "test",
    source_detail: "test",
    sentiment: 0.5,
    raw_sentiment: 0.5,
    volume: 1,
    freshness: 1,
    source_weight: 1,
    reason: "test",
    timestamp: Date.now(),
  };
}

describe("actionability key helpers", () => {
  it("normalizes crypto aliases into one key", () => {
    const cryptoSymbols = ["BTC/USD", "ETH/USD"];
    expect(getActionabilityKey("BTCUSD", cryptoSymbols)).toBe("crypto:BTC/USD");
    expect(getActionabilityKey("btc/usd", cryptoSymbols)).toBe("crypto:BTC/USD");
  });

  it("dedupes by normalized key and respects cap", () => {
    const cryptoSymbols = ["BTC/USD", "ETH/USD"];
    const signals: Signal[] = [
      makeSignal("BTCUSD"),
      makeSignal("BTC/USD"),
      makeSignal("AAPL"),
      makeSignal("MSFT"),
      makeSignal("NVDA"),
    ];

    const out = selectUniqueActionabilityCandidates(signals, cryptoSymbols, 3);
    expect(out).toHaveLength(3);
    expect(out.map(([key]) => key)).toEqual(["crypto:BTC/USD", "equity:AAPL", "equity:MSFT"]);
  });
});
