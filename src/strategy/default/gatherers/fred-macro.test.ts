import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("fredMacroGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        FRED_API_KEY: "fred-key",
        CACHE: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
      config: {
        fred_enabled: true,
        fred_series: ["VIXCLS"],
        fred_cache_ttl_seconds: 14_400,
        ticker_blacklist: [],
        allowed_exchanges: ["NYSE", "ARCA"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("returns empty when disabled or no key", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { fredMacroGatherer } = await import("./fred-macro");
    expect(await fredMacroGatherer.gather(baseCtx({ config: { ...baseCtx().config, fred_enabled: false } }))).toEqual([]);
    expect(await fredMacroGatherer.gather(baseCtx({ env: { FRED_API_KEY: undefined, CACHE: baseCtx().env.CACHE } }))).toEqual(
      []
    );
  });

  it("emits conservative SPY/QQQ signals when observations parse", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          observations: [{ date: "2024-01-01", value: "30" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "ARCA" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 400 } }) },
    });

    const { fredMacroGatherer } = await import("./fred-macro");
    const signals = await fredMacroGatherer.gather(baseCtx());

    expect(signals.length).toBe(2);
    expect(signals.map((s) => s.symbol).sort()).toEqual(["QQQ", "SPY"]);
    expect(signals[0]?.source).toBe("fred_macro");
  });

  it("uses stale cache on http error when KV has data", async () => {
    const stale = JSON.stringify({
      observations: [{ date: "2024-01-01", value: "18" }],
    });
    const cacheGet = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(stale);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "err",
    });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "ARCA" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 400 } }) },
    });

    const ctx = baseCtx({
      env: {
        FRED_API_KEY: "fred-key",
        CACHE: {
          get: cacheGet,
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    const { fredMacroGatherer } = await import("./fred-macro");
    const signals = await fredMacroGatherer.gather(ctx);

    expect(signals.length).toBeGreaterThan(0);
  });
});
