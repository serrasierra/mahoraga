import { beforeEach, describe, expect, it, vi } from "vitest";

const createAlpacaProvidersMock = vi.fn();
vi.mock("../../../providers/alpaca", () => ({
  createAlpacaProviders: createAlpacaProvidersMock,
}));

describe("contractAwardsGatherer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function baseCtx(overrides: Record<string, unknown> = {}) {
    return {
      env: {
        GOVCON_API_KEY: "govcon-key",
      },
      config: {
        contract_awards_enabled: true,
        contract_awards_max_candidates: 5,
        contract_awards_lookback_days: 30,
        crypto_symbols: [],
        allowed_exchanges: ["NASDAQ", "NYSE"],
      },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as any;
  }

  it("maps contract award payloads into actionable signals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              award_id: "A-1",
              symbol: "PLTR",
              amount: 25000000,
              agency: "DoD",
              description: "Defense analytics platform",
              award_date: new Date().toISOString(),
            },
          ],
        }),
      })
    );

    createAlpacaProvidersMock.mockReturnValue({
      trading: { getAsset: vi.fn().mockResolvedValue({ tradable: true, exchange: "NYSE" }) },
      marketData: { getSnapshot: vi.fn().mockResolvedValue({ latest_trade: { price: 31 } }) },
    });

    const { contractAwardsGatherer } = await import("./contract-awards");
    const signals = await contractAwardsGatherer.gather(baseCtx());

    expect(signals).toHaveLength(1);
    expect(signals[0]?.source).toBe("contract_awards");
    expect(signals[0]?.price).toBe(31);
  });

  it("returns empty when source toggle is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { contractAwardsGatherer } = await import("./contract-awards");
    const signals = await contractAwardsGatherer.gather(
      baseCtx({ config: { ...baseCtx().config, contract_awards_enabled: false } })
    );
    expect(signals).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
