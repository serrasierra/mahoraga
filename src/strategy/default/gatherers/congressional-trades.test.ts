import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("congressionalTradesGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        FMP_API_KEY: "fmp-key",
      },
      config: {
        congressional_enabled: true,
        congressional_max_candidates: 5,
        congressional_lookback_days: 30,
        crypto_symbols: [],
        allowed_exchanges: ["NASDAQ", "NYSE"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("parses and emits actionable congressional signals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: "NVDA",
            transaction_type: "Purchase",
            amount: "$15,001 - $50,000",
            owner: "Self",
            representative: "Rep One",
            transaction_date: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 910 } }) },
    });

    const { congressionalTradesGatherer } = await import("./congressional-trades");
    const signals = await congressionalTradesGatherer.gather(baseCtx());

    expect(signals).toHaveLength(1);
    expect(signals[0]?.symbol).toBe("NVDA");
    expect(signals[0]?.source).toBe("congressional");
  });

  it("returns empty when key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = baseCtx({ env: {}, config: { ...baseCtx().config, congressional_enabled: true } });

    const { congressionalTradesGatherer } = await import("./congressional-trades");
    const signals = await congressionalTradesGatherer.gather(ctx);

    expect(signals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
