import { describe, expect, it, vi } from "vitest";
import type { Signal } from "../core/types";
import { determineSignalActionability } from "./actionability";

const baseSignal: Signal = {
  symbol: "AAPL",
  source: "test",
  source_detail: "test",
  sentiment: 0.5,
  raw_sentiment: 0.5,
  volume: 10,
  freshness: 1,
  source_weight: 1,
  reason: "test",
  timestamp: Date.now(),
};

function createDeps(overrides: Partial<Parameters<typeof determineSignalActionability>[0]> = {}) {
  return {
    signal: baseSignal,
    cryptoSymbols: ["BTC/USD", "ETH/USD"],
    allowedExchanges: ["NASDAQ", "NYSE"],
    nowMs: 123,
    getAsset: vi.fn(async () => ({ tradable: true, exchange: "NASDAQ" })),
    getEquitySnapshot: vi.fn(async () => ({ latest_trade: { price: 100 } })),
    getCryptoSnapshot: vi.fn(async () => ({ latest_trade: { price: 50000 } })),
    ...overrides,
  };
}

describe("determineSignalActionability", () => {
  it("allows tradable equity with price", async () => {
    const result = await determineSignalActionability(createDeps());
    expect(result.is_actionable).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.price).toBe(100);
    expect(result.asset_class).toBe("us_equity");
  });

  it("rejects equity with missing asset", async () => {
    const result = await determineSignalActionability(
      createDeps({ getAsset: vi.fn(async () => null) })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("asset_not_found");
  });

  it("rejects non-tradable equity", async () => {
    const result = await determineSignalActionability(
      createDeps({ getAsset: vi.fn(async () => ({ tradable: false, exchange: "NASDAQ" })) })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("asset_not_tradable");
  });

  it("rejects disallowed exchange", async () => {
    const result = await determineSignalActionability(
      createDeps({ getAsset: vi.fn(async () => ({ tradable: true, exchange: "OTC" })) })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("exchange_not_allowed");
  });

  it("rejects equity with no price", async () => {
    const result = await determineSignalActionability(
      createDeps({
        getEquitySnapshot: vi.fn(async () => ({ latest_trade: { price: 0 }, latest_quote: { ask_price: 0 } })),
      })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("no_price");
  });

  it("rejects unconfigured crypto symbols", async () => {
    const result = await determineSignalActionability(
      createDeps({
        signal: { ...baseSignal, symbol: "BONK/USD", isCrypto: true },
      })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("crypto_symbol_not_configured");
  });

  it("allows configured crypto with price", async () => {
    const result = await determineSignalActionability(
      createDeps({
        signal: { ...baseSignal, symbol: "BTC/USD", isCrypto: true },
      })
    );
    expect(result.is_actionable).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.asset_class).toBe("crypto");
  });

  it("rejects configured crypto when snapshot has no price", async () => {
    const result = await determineSignalActionability(
      createDeps({
        signal: { ...baseSignal, symbol: "ETH/USD", isCrypto: true },
        getCryptoSnapshot: vi.fn(async () => ({ latest_trade: { price: 0 }, latest_quote: { ask_price: 0 } })),
      })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("no_price");
  });

  it("returns lookup_failed when dependency throws", async () => {
    const result = await determineSignalActionability(
      createDeps({
        getAsset: vi.fn(async () => {
          throw new Error("boom");
        }),
      })
    );
    expect(result.is_actionable).toBe(false);
    expect(result.reason).toBe("lookup_failed");
  });
});
