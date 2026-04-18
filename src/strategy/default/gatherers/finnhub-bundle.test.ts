import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("finnhubBundleGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        FINNHUB_API_KEY: "fh-key",
        CACHE: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
      config: {
        finnhub_enabled: true,
        finnhub_max_symbols: 10,
        finnhub_cache_ttl_seconds: 240,
        finnhub_symbols: ["AAPL", "MSFT", "NVDA"],
        ticker_blacklist: [],
        crypto_symbols: [],
        allowed_exchanges: ["NASDAQ", "NYSE"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("returns empty when disabled or no key", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const { finnhubBundleGatherer } = await import("./finnhub-bundle");
    expect(
      await finnhubBundleGatherer.gather(baseCtx({ config: { ...baseCtx().config, finnhub_enabled: false } }))
    ).toEqual([]);
    expect(
      await finnhubBundleGatherer.gather(baseCtx({ env: { FINNHUB_API_KEY: undefined, CACHE: baseCtx().env.CACHE } }))
    ).toEqual([]);
  });

  it("uses cache hit and skips fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const cached = JSON.stringify([
      {
        datetime: Math.floor(Date.now() / 1000),
        headline: "NVDA beats",
        related: "NVDA",
        summary: "test",
      },
    ]);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 100 } }) },
    });

    const ctx = baseCtx({
      env: {
        FINNHUB_API_KEY: "fh-key",
        CACHE: {
          get: vi.fn().mockResolvedValue(cached),
          put: vi.fn(),
        },
      },
    });

    const { finnhubBundleGatherer } = await import("./finnhub-bundle");
    const signals = await finnhubBundleGatherer.gather(ctx);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0]?.symbol).toBe("NVDA");
    expect(signals[0]?.source).toBe("finnhub_bundle");
  });

  it("falls back after 429 when stale cache exists", async () => {
    const stale = JSON.stringify([
      { datetime: Math.floor(Date.now() / 1000), headline: "x", related: "AAPL", summary: "" },
    ]);
    let getCalls = 0;
    const cacheGet = vi.fn(async () => {
      getCalls++;
      if (getCalls === 1) return null;
      return stale;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 429, ok: false })
      .mockResolvedValue({ status: 429, ok: false })
      .mockResolvedValue({ status: 429, ok: false })
      .mockResolvedValue({ status: 429, ok: false });

    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 100 } }) },
    });

    const ctx = baseCtx({
      env: {
        FINNHUB_API_KEY: "fh-key",
        CACHE: {
          get: cacheGet,
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
      config: {
        ...baseCtx().config,
        finnhub_max_symbols: 3,
      },
    });

    const { finnhubBundleGatherer } = await import("./finnhub-bundle");
    const signals = await finnhubBundleGatherer.gather(ctx);

    expect(signals.some((s) => s.symbol === "AAPL")).toBe(true);
  });

  it("uses relaxed matching when strict allowlist matches nothing in the news batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            datetime: Math.floor(Date.now() / 1000),
            headline: "Electric vehicle deliveries",
            related: "TSLA",
            summary: "",
          },
        ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 250 } }) },
    });

    const ctx = baseCtx({
      config: {
        ...baseCtx().config,
        finnhub_symbols: ["AAPL", "MSFT"],
      },
    });

    const { finnhubBundleGatherer } = await import("./finnhub-bundle");
    const signals = await finnhubBundleGatherer.gather(ctx);

    expect(signals.some((s) => s.symbol === "TSLA")).toBe(true);
  });

  it("enforces max symbol cap", async () => {
    const articles = Array.from({ length: 20 }, (_, i) => ({
      datetime: Math.floor(Date.now() / 1000) - i,
      headline: `Story ${i}`,
      related: `SYM${i}`,
      summary: "",
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(articles),
    });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 10 } }) },
    });

    const allow = new Set(Array.from({ length: 20 }, (_, i) => `SYM${i}`).concat(["SYM0"]));
    const ctx = baseCtx({
      config: {
        ...baseCtx().config,
        finnhub_max_symbols: 2,
        finnhub_symbols: [...allow],
      },
    });

    const { finnhubBundleGatherer } = await import("./finnhub-bundle");
    const signals = await finnhubBundleGatherer.gather(ctx);

    expect(signals.length).toBeLessThanOrEqual(2);
  });
});
