import { describe, expect, it, vi } from "vitest";
import { cachedJsonFetch } from "./source-guards";

describe("cachedJsonFetch", () => {
  it("stores JSON on successful fetch", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(null);

    const ctx = {
      env: { CACHE: { get, put } },
      log: vi.fn(),
      sleep: vi.fn().mockResolvedValue(undefined),
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ hello: "world" }),
      })
    );

    const { data, fromCache } = await cachedJsonFetch<{ hello: string }>(ctx, {
      namespace: "t",
      cacheKeySuffix: "k1",
      ttlSeconds: 120,
      url: "https://example.com/x",
      label: "Test",
    });

    expect(fromCache).toBe(false);
    expect(data).toEqual({ hello: "world" });
    expect(put).toHaveBeenCalled();
  });
});
