/**
 * Default Strategy — "sentiment-momentum"
 *
 * This is the built-in strategy that ships with Mahoraga.
 * It replicates the original harness behavior:
 *   - Gatherers: StockTwits, Reddit, SEC, Crypto
 *   - Research: LLM-powered signal and position analysis
 *   - Entry: Confidence threshold + Twitter confirmation
 *   - Exit: Take profit, stop loss, staleness scoring
 *
 * Phase 8 will rewire the harness to delegate to this strategy.
 * Until then, the harness still uses inline logic for orchestration,
 * but imports helpers from the extracted modules.
 */

import type { Strategy } from "../types";
import { DEFAULT_CONFIG } from "./config";
import { cryptoGatherer } from "./gatherers/crypto";
import { optionsFlowGatherer } from "./gatherers/options-flow";
import { congressionalTradesGatherer } from "./gatherers/congressional-trades";
import { contractAwardsGatherer } from "./gatherers/contract-awards";
import { cryptoFearGreedGatherer } from "./gatherers/crypto-fear-greed";
import { finnhubBundleGatherer } from "./gatherers/finnhub-bundle";
import { fredMacroGatherer } from "./gatherers/fred-macro";
import { planMarkerGatherer } from "./gatherers/plan-marker";
import { polygonNewsGatherer } from "./gatherers/polygon-news";
import { redditGatherer } from "./gatherers/reddit";
import { secGatherer } from "./gatherers/sec";
import { stocktwitsGatherer } from "./gatherers/stocktwits";
import { analyzeSignalsPrompt } from "./prompts/analyst";
import { premarketPrompt } from "./prompts/premarket";
import { researchPositionPrompt, researchSignalPrompt } from "./prompts/research";
import { selectEntries } from "./rules/entries";
import { selectExits } from "./rules/exits";

export const defaultStrategy: Strategy = {
  name: "sentiment-momentum",
  configSchema: null,
  defaultConfig: DEFAULT_CONFIG,

  gatherers: [
    planMarkerGatherer,
    stocktwitsGatherer,
    redditGatherer,
    polygonNewsGatherer,
    optionsFlowGatherer,
    congressionalTradesGatherer,
    contractAwardsGatherer,
    finnhubBundleGatherer,
    fredMacroGatherer,
    cryptoFearGreedGatherer,
    cryptoGatherer,
    secGatherer,
  ],

  prompts: {
    researchSignal: researchSignalPrompt,
    researchPosition: researchPositionPrompt,
    analyzeSignals: analyzeSignalsPrompt,
    premarketAnalysis: premarketPrompt,
  },

  selectEntries,
  selectExits,
};
