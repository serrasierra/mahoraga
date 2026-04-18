import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("polygonNewsGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        POLYGON_API_KEY: "test-key",
        ALPACA_API_KEY: "alpaca-key",
        ALPACA_API_SECRET: "alpaca-secret",
        ALPACA_PAPER: "true",
      },
      config: {
        allowed_exchanges: ["NASDAQ", "NYSE"],
        crypto_symbols: ["BTC/USD", "ETH/USD"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("maps Polygon articles into actionable signals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "AAPL breakout looks bullish buy setup",
              description: "Strong momentum with catalyst",
              tickers: ["AAPL"],
              source: "Reuters",
              published_utc: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    createAlpacaProvidersMock.mockReturnValue({
      trading: {
        getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" }),
      },
      marketData: {
        getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 180 } }),
        getCryptoSnapshot: vi.fn().mockResolvedValue(null),
      },
    });

    const { polygonNewsGatherer } = await import("./polygon-news");
    const signals = await polygonNewsGatherer.gather(baseCtx());

    expect(signals).toHaveLength(1);
    const first = signals[0]!;
    expect(first).toMatchObject({
      symbol: "AAPL",
      source: "polygon_news",
    });
    expect(first.price).toBe(180);
  });

  it("filters out untradable or unpriced symbols", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "BAD ticker",
              description: "headline",
              tickers: ["BAD"],
              source: "Reuters",
              published_utc: new Date().toISOString(),
            },
            {
              title: "ZERO ticker",
              description: "headline",
              tickers: ["ZERO"],
              source: "Bloomberg",
              published_utc: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    createAlpacaProvidersMock.mockReturnValue({
      trading: {
        getAsset: vi.fn(async (symbol: string) => {
          if (symbol === "BAD") return { tradable: false, exchange: "NASDAQ" };
          return { tradable: true, exchange: "NASDAQ" };
        }),
      },
      marketData: {
        getSnapshot: vi.fn(async (symbol: string) => {
          if (symbol === "ZERO") return { latest_trade: { price: 0 } };
          return { latest_trade: { price: 120 } };
        }),
        getCryptoSnapshot: vi.fn().mockResolvedValue(null),
      },
    });

    const { polygonNewsGatherer } = await import("./polygon-news");
    const signals = await polygonNewsGatherer.gather(baseCtx());

    expect(signals).toHaveLength(0);
  });

  it("returns empty and logs when key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn() },
      marketData: { getSnapshot: vi.fn(), getCryptoSnapshot: vi.fn() },
    });

    const ctx = baseCtx({
      env: {
        ALPACA_API_KEY: "alpaca-key",
        ALPACA_API_SECRET: "alpaca-secret",
      },
    });

    const { polygonNewsGatherer } = await import("./polygon-news");
    const signals = await polygonNewsGatherer.gather(ctx);

    expect(signals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.log).toHaveBeenCalledWith("PolygonNews", "disabled_no_key", {});
  });

  it("caps expensive lookups and dedupes normalized crypto aliases", async () => {
    const tickers = ["BTCUSD", "BTC/USD", ...Array.from({ length: 40 }, (_, i) => `EQ${i}`)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Broad market momentum breakout buy",
              description: "Many tickers trending",
              tickers,
              source: "Reuters",
              published_utc: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    const getAsset = vi.fn().mockResolvedValue({ tradable: true, exchange: "NASDAQ" });
    const getSnapshot = vi.fn().mockResolvedValue({ latest_trade: { price: 101 } });
    const getCryptoSnapshot = vi.fn().mockResolvedValue({ latest_trade: { price: 50000 } });

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset },
      marketData: { getSnapshot, getCryptoSnapshot },
    });

    const { polygonNewsGatherer } = await import("./polygon-news");
    const signals = await polygonNewsGatherer.gather(baseCtx());

    expect(signals.length).toBeLessThanOrEqual(20);
    expect(getAsset.mock.calls.length).toBeLessThanOrEqual(24);
    expect(getCryptoSnapshot.mock.calls.length).toBe(1);
  });
});
