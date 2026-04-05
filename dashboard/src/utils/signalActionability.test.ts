import { describe, expect, it } from "vitest";
import { getActionabilityView } from "./signalActionability";

describe("getActionabilityView", () => {
  it("returns actionable=true when symbol is in actionable set", () => {
    const view = getActionabilityView("AAPL", new Set(["AAPL"]), {});
    expect(view.isActionable).toBe(true);
    expect(view.reasonLabel).toBe("unknown");
  });

  it("formats reason labels for non-actionable symbols", () => {
    const view = getActionabilityView("BONK.X", new Set(), {
      "BONK.X": {
        is_actionable: false,
        reason: "no_price",
        price: null,
        checked_at: 1,
      },
    });

    expect(view.isActionable).toBe(false);
    expect(view.reasonLabel).toBe("no price");
  });
});
