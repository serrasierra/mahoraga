/**
 * Lightweight gatherer hook for local experimentation (walkthrough / CI).
 * Emits a log line each cycle without adding signals.
 */

import type { Gatherer } from "../../types";

export const planMarkerGatherer: Gatherer = {
	name: "plan-marker",
	gather: async (ctx) => {
		ctx.log("Strategy", "plan_marker_tick", {
			note: "Custom gatherer slot — replace with your own data source.",
		});
		return [];
	},
};
