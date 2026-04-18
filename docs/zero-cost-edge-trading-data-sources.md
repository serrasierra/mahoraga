# Strategic Integration of Zero-Cost External Data Streams for High-Frequency Serverless Trading Agents

**Subtitle:** A quantitative framework for Cloudflare Worker orchestration (Alpaca; US equities & crypto)

---

## Abstract

Algorithmic trading infrastructure has moved from centralized, high-latency monoliths to distributed, serverless edge environments. For practitioners using **Cloudflare Workers** with **Alpaca** (US equities and crypto), the architectural problem is **strict edge execution**: Workers run in a **V8 isolate** with **limited memory** and a **tight cap on outbound subrequests** (often cited as **~50 per invocation** on free tier—verify against current Cloudflare docs for your plan). Within that environment, alpha favors **high information density per HTTP call** and **zero subscription cost**. This report analyzes a **zero-cost** external data ecosystem for **TypeScript** agents balancing **data fidelity** and **rate-limited** access.

---

## 1. Cloudflare Workers: execution environment and subrequest optimization

Serverless at the edge prioritizes **horizontal scale** and **low latency** over long-running persistence. For a quantitative agent, the **fetch → analyze → execute** loop should complete quickly so Alpaca execution reflects **current** market state.

**Implication of subrequest limits:** you cannot afford exhaustive multi-step gathering per symbol. Prefer **“Worker-fit”** sources: **one consolidated GET** returns enough signal for a decision.

**Information density:** a source that returns **pre-computed indicators** (e.g. RSI, Bollinger Bands) beats raw OHLCV that forces heavy in-Worker math (CPU time + memory).

**KV + Cache API:** persist responses across invocations to **absorb rate limits** and **amortize** subrequests—one successful upstream fetch can fuel many logic cycles.

---

## 2. Core evaluation framework for external data providers

Selection criteria (hierarchy):

1. **Genuine free tier** — non-trial where possible; **no credit card** to start (when that is a project constraint).
2. **REST JSON** — natural fit for `Response.json()` in TypeScript; minimal parsing friction.
3. **Avoid redundancy** with **SEC EDGAR** or standard **Polygon**-style news unless the source adds **material value** (e.g. enriched metadata, differentiated sentiment).
4. **Exclude** browser scraping and **ToS-violating** automation for personal trading—optimize for **longevity and legality**.

---

## 3. Primary data source matrix (top 8)

| Source | Official URL / API docs | Auth | Rate limits (free tier) | Symbol mapping | Worker fit |
|--------|-------------------------|------|---------------------------|----------------|------------|
| **Finnhub** | [finnhub.io/docs/api](https://finnhub.io/docs/api) | Free API key | 60 req/min (per provider docs) | Excellent | High density |
| **Alpha Vantage** | [alphavantage.co/documentation](https://www.alphavantage.co/documentation/) | Free API key | 25/day; 5/min (verify current tier) | Standard tickers | High latency; good for infrequent tech snapshots |
| **FMP** | [financialmodelingprep.com/developer/docs](https://site.financialmodelingprep.com/developer/docs/) | Free API key | 250/day (per provider) | US-focused | Consolidated endpoints |
| **FRED** | [fred.stlouisfed.org/docs/api/fred/](https://fred.stlouisfed.org/docs/api/fred/) | Free API key | 30 req/min (per provider) | Macro series IDs | Static / slow-moving |
| **Leeway.tech** | [leeway.tech/api-doc](https://leeway.tech/api-doc) | Free API key | 100/day (per provider) | ISIN/ticker | Global master / mapping |
| **Alternative.me** | Crypto Fear & Greed ([alternative.me/crypto/fng/](https://alternative.me/crypto/fng/)) | None | Unspecified; treat as “poll conservatively” | Crypto-only | Minimal JSON |
| **Free Crypto News** | [github.com/nirholas/free-crypto-news](https://github.com/nirholas/free-crypto-news) | None | Claimed unlimited* (verify ToS/uptime) | Aggregated | High volume headlines |
| **Politician Trade Tracker** | e.g. [politiciantradetracker.us](https://politiciantradetracker.us) / RapidAPI | Free key (marketplace) | Limited free tier | US equities | Niche signal |

\*Verify licensing, uptime, and whether “unlimited” is still accurate.

---

## 4. Deep dives by tier

### Tier 1 — Multi-asset intelligence and sentiment

#### Finnhub — broad alternative-style coverage

- Strong free-tier breadth: calendars, estimates, sentiment-oriented endpoints (verify exact free-tier scope in current docs).
- **Earnings surprise** (example formulation):

\[
S = \frac{\left|\mathrm{EPS}_{\mathrm{actual}} - \mathrm{EPS}_{\mathrm{estimate}}\right|}{\left|\mathrm{EPS}_{\mathrm{estimate}}\right|}
\]

(Interpretation as a “surprise magnitude”; thresholding like \(S > 0.05\) is illustrative—calibrate empirically.)

- **Caching:** fetch daily per watchlist → **KV** to avoid repeat subrequests.
- **Rate limit:** ~60/min often supports **news/sentiment polling** if batched and cached.

#### Alpha Vantage — offload indicator computation

- Large library of **pre-computed** technical series—valuable when CPU time is scarce.
- Typical **EMA** recurrence (conceptual):

\[
\mathrm{EMA}_t = \alpha \cdot V_t + (1-\alpha)\cdot \mathrm{EMA}_{t-1}, \qquad \alpha = \frac{2}{d+1}
\]

where \(V_t\) is the input value at \(t\) and \(d\) is the smoothing period (definition may vary slightly by vendor).

- Responses are often **hierarchical** (e.g. `"Meta Data"` + `"Technical Analysis: RSI"` keyed by timestamp). Use **compact** output modes when available to shrink `JSON.parse` memory.

---

### Tier 2 — Fundamentals and macro regimes

#### FMP — consolidated company context

- “Company outlook” / ratios-style endpoints can bundle **profile + statements + valuation metrics** in **one** response—good for **multi-factor filters** (e.g. valuation vs growth guardrails).

#### FRED — macro “circuit breaker”

- Use key series (rates, inflation, labor, etc.) to detect **regime shifts** and adjust risk.
- Updates are typically **slow** vs tick data—fits **KV** with long TTLs.
- Check **FRED legal/terms** for your use case (personal/educational automation vs redistribution).

---

### Tier 3 — Global master data and niche sentiment

#### Leeway.tech — identifier mapping

- Helps align **tickers ↔ ISINs** across vendors—reduces **wrong-instrument** bugs when merging datasets.

#### Alternative.me — crypto Fear & Greed

Example response shape:

```json
{
  "name": "Fear and Greed Index",
  "data": [
    {
      "value": "40",
      "value_classification": "Fear",
      "timestamp": "1551157200",
      "time_until_update": "68499"
    }
  ]
}
```

**Note:** The sample uses `json.data.value`; some payloads nest under `data[0]`—defensive parsing recommended.

#### Free Crypto News — headline volume

- Aggregated crypto news; useful for **keyword/regex** event filters. If an **OpenAPI** spec exists, use it to generate **TypeScript types**.

---

### Tier 4 — Alternative signals

#### Politician / congressional trade trackers

- Often **lagged** disclosures—better as **bias** or **watchlist prioritization** than HFT scalps.
- Validate **RapidAPI** free-tier quotas and terms.

---

## 5. Technical and legal constraints

### Rate limits and 429 handling

- Treat **429** as normal at the edge: **exponential backoff + jitter**, fall back to **cached** KV values, and **degrade** strategy gracefully.

### Information density comparison (qualitative)

| Signal category | Primary provider (example) | Density | Worker overhead |
|-----------------|----------------------------|---------|-----------------|
| Technicals | Alpha Vantage | Very high (pre-computed) | Low (single parse) |
| Sentiment | Alternative.me | High (scalar) | Very low |
| Fundamentals | FMP | High (bundled) | Moderate (large JSON) |
| Macro | FRED | Low per series point | Low |
| News | Free Crypto News | Moderate (headlines) | Moderate (text) |

### Compliance notes (non-legal advice)

- Prefer **official APIs** over scraping; respect **robots/ToS** and **CFAA**-relevant norms.
- “Personal use” allowances differ by vendor—**do not redistribute** vendor data to third parties without license.

---

## 6. Avoidance matrix (zero-cost constraint)

| Provider | Why avoid (for this report’s goals) | Friction |
|----------|-------------------------------------|----------|
| Whale Alert | Subscription-first / limited free | Paid tiers for active API |
| Stocktwits | Developer API access may be closed/restricted | New keys may be unavailable |
| Quiver Quantitative | Congressional/insider API behind paid tier | Free tier may be dashboard-only |
| Moralis | CU/credit model can be hard to reason about at Worker scale | Sudden exhaustion risk |
| Twelve Data | Free tier limits/complexity vs alternatives | Credit/limit tracking overhead |

---

## 7. Architectural synthesis: multi-source signal loop

Suggested **temporal layering**:

1. **Slow state (15–30 min):** FRED + FMP → write to **KV**.
2. **Tactical (1–5 min):** Finnhub news/sentiment + crypto sentiment (Alternative.me).
3. **Execution:** Alpaca for **prices/orders**; confirm signals against live feed constraints.

**Example Worker-style fetch (Fear & Greed):**

```ts
async function getSentiment(): Promise<number> {
  const response = await fetch("https://api.alternative.me/fng/");
  const json = (await response.json()) as {
    data?: Array<{ value?: string }>;
  };
  const raw = json.data?.[0]?.value;
  if (raw === undefined) throw new Error("Unexpected F&G payload");
  return parseInt(raw, 10);
}
```

(Adjust parsing to match the live schema.)

---

## 8. Final recommendations: free-tier sustainability

1. **Backoff + jitter** on 429.
2. **KV-first:** check cache before Alpha Vantage / low-quota sources.
3. **Cross-source validation:** high-rate sources for **tactical** flow; low-rate sources for **confirmation** and **quality** checks.

---

## 9. Reference links (bibliography / further reading)

Use these as **starting points**; verify current pricing, limits, and terms.

- [Alpaca](https://alpaca.markets/)
- [Cloudflare Workers — what counts toward request limits (community)](https://community.cloudflare.com/t/what-counts-towards-the-100-000-requests-day-workers-limit/255136)
- [Alpha Vantage](https://www.alphavantage.co/) · [Documentation](https://www.alphavantage.co/documentation/) · [Support](https://www.alphavantage.co/support/)
- [Alpha Vantage limits discussion (third party)](https://www.macroption.com/alpha-vantage-api-limits/) · [APIPark article on limits](https://apipark.com/technews/ekqZjDgp.html)
- [FMP developer docs](https://site.financialmodelingprep.com/developer/docs/) · [Pricing](https://site.financialmodelingprep.com/pricing-plans) · [FAQs](https://site.financialmodelingprep.com/faqs) · [When FMP is/isn’t the right tool (FMP)](https://site.financialmodelingprep.com/education/data/when-financial-modelingprep-is-the-right-tool--and-when-it-isnt)
- [FRED API](https://fred.stlouisfed.org/docs/api/fred/) · [Legal](https://fred.stlouisfed.org/legal/)
- [Leeway API doc](https://leeway.tech/api-doc/general) · [Data API](https://leeway.tech/en/data-api/live)
- [Finnhub](https://finnhub.io/) · [API docs](https://finnhub.io/docs/api) · [Pricing](https://finnhub.io/pricing)
- [Alternative.me Fear & Greed](https://alternative.me/crypto/fear-and-greed-index/#api) · [FNG endpoint](https://alternative.me/crypto/fng/)
- [Free Crypto News (GitHub)](https://github.com/nirholas/free-crypto-news)
- [Politician trades — example Medium article](https://python.plainenglish.io/a-free-and-simple-way-to-track-politician-stock-trades-in-python-eb7208eda9aa)
- [FMP insider/congressional datasets (verify access tier)](https://site.financialmodelingprep.com/datasets/ownership-senate-insider)
- [CoinGecko — common errors & rate limit](https://docs.coingecko.com/docs/common-errors-rate-limit) · [Pricing](https://www.coingecko.com/en/api/pricing)
- [Whale Alert FAQ](https://whale-alert.io/faq.html) · [Developer docs](https://docs.whale-alert.io/)
- [Stocktwits developers](https://api.stocktwits.com/developers)
- [Quiver API](https://api.quiverquant.com/) · [Third-party review](https://www.quantvps.com/blog/quiver-quant-review)
- [Moralis FAQ — API limits](https://moralis.com/faq/what-are-the-limits-for-api-requests/)
- [Twelve Data](https://twelvedata.com/)
- [Glassnode Fear & Greed chart](https://studio.glassnode.com/charts/indicators.FearGreed?a=BTC) · [CoinMarketCap F&G](https://coinmarketcap.com/charts/fear-and-greed-index/) (context only)

---

## Agent handoff checklist (optional)

- [ ] Re-verify **Cloudflare** subrequest limits and **Workers** plan quotas.
- [ ] Re-verify **Finnhub / FMP / Alpha Vantage** free-tier **endpoint allowlists** and **rate limits**.
- [ ] Confirm **Alpaca** market data tier (delayed vs real-time) for your asset class.
- [ ] Parse **F&G** JSON defensively (`data[0].value` vs `data.value`).
- [ ] Add **429** backoff, **KV TTLs**, and **structured logging** for upstream failures.
