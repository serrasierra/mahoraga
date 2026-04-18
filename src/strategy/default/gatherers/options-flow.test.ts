import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("optionsFlowGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        UNUSUAL_WHALES_API_KEY: "uw-key",
      },
      config: {
        uoa_enabled: true,
        uoa_max_candidates: 5,
        uoa_min_premium: 100000,
        crypto_symbols: [],
        allowed_exchanges: ["NASDAQ", "NYSE"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("returns actionable, capped options flow signals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { symbol: "AAPL", sentiment: "bullish", premium: 250000, size: 10, trade_code: "normal" },
            { symbol: "MSFT", sentiment: "bearish", premium: 220000, size: 5, trade_code: "normal" },
          ],
        }),
      })
    );

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 123 } }) },
    });

    const { optionsFlowGatherer } = await import("./options-flow");
    const signals = await optionsFlowGatherer.gather(baseCtx());

    expect(signals.length).toBe(2);
    expect(signals[0]?.source).toBe("options_flow");
    expect(signals[0]?.price).toBe(123);
  });

  it("returns empty when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { optionsFlowGatherer } = await import("./options-flow");
    const ctx = baseCtx({ config: { ...baseCtx().config, uoa_enabled: false } });
    const signals = await optionsFlowGatherer.gather(ctx);

    expect(signals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
