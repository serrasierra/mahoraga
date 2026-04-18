import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("cryptoFearGreedGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        CACHE: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
        },
      },
      config: {
        crypto_fng_enabled: true,
        crypto_fng_cache_ttl_seconds: 1200,
        crypto_symbols: ["BTC/USD"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("returns empty when disabled", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { cryptoFearGreedGatherer } = await import("./crypto-fear-greed");
    expect(
      await cryptoFearGreedGatherer.gather(baseCtx({ config: { ...baseCtx().config, crypto_fng_enabled: false } }))
    ).toEqual([]);
  });

  it("parses string and numeric value variants", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ value: "72", value_classification: "Greed" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    createAlpacaProvidersMock.mockReturnValue({
      marketData: {
        getCryptoSnapshot: vi.fn().mockResolvedValue({
          latest_trade: { price: 50_000 },
          daily_bar: { v: 100 },
        }),
      },
    });

    const { cryptoFearGreedGatherer } = await import("./crypto-fear-greed");
    const signals = await cryptoFearGreedGatherer.gather(baseCtx());
    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe("crypto_fear_greed");
    expect(signals[0]?.isCrypto).toBe(true);
  });

  it("handles missing data array gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { cryptoFearGreedGatherer } = await import("./crypto-fear-greed");
    const signals = await cryptoFearGreedGatherer.gather(baseCtx());
    expect(signals).toEqual([]);
  });
});
