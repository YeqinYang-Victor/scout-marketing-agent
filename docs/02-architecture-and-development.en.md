**English** | [简体中文](./02-架构与二次开发.md)

# Architecture & Extension Guide

## 1. Overall Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Front end (React 18 + Vite + TDesign + Tailwind)                │
│  ┌────────────┬────────────┬──────────┬───────────┬───────────┐  │
│  │ Workbench  │ Data srcs  │ Rules    │ Templates │ Agent chat│  │
│  └────────────┴────────────┴──────────┴───────────┴───────────┘  │
└───────────────────────────────┬──────────────────────────────────┘
                                │  /api/scout/*  (Vite proxy → :3000)
┌───────────────────────────────▼──────────────────────────────────┐
│  Back end (Express + TypeScript)                                 │
│  ┌──────────────────────────┐  ┌───────────────────────────────┐ │
│  │ api.ts   REST routes     │  │ index.ts  SSE + sessions      │ │
│  └────────────┬─────────────┘  └───────────────────────────────┘ │
│               │                                                  │
│  ┌────────────▼──────────────────────────────────────────────┐   │
│  │ pipeline/   the automation pipeline                       │   │
│  │  run.ts         orchestration + progress callbacks        │   │
│  │  fetchers.ts    data-source adapters (mock/http-login/rss)│   │
│  │  normalize.ts   normalization                             │   │
│  │  scorer.ts      dedupe → hard filters → scoring → ranking │   │
│  │  writer.ts      template engine + rule-based fields       │   │
│  │  llm.ts         Agent SDK polish (optional)               │   │
│  │  banner.ts      banner SVG / PNG rendering                │   │
│  │  knowledge.ts   industry-chain & stock knowledge base     │   │
│  └────────────┬──────────────────────────────────────────────┘   │
│               │                                                  │
│  ┌────────────▼──────────┐   ┌────────────────────────────────┐  │
│  │ store.ts  config hub  │   │ db.ts  session persistence     │  │
│  │ config/*.json         │   │ SQLite, falls back to JSON     │  │
│  └───────────────────────┘   └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Key design principles

| Principle | How it shows up |
|-----------|-----------------|
| **Config separated from code** | Data sources, ranking rules, templates and brand visuals all live in `config/*.json`. Changing them needs no code edits |
| **Business logic decoupled from AI** | The pipeline runs end-to-end on the rule engine; the LLM is an optional enhancement layer that falls back on failure |
| **Runs with zero native dependencies** | The Agent SDK is loaded lazily; when SQLite is unavailable the store falls back to JSON |
| **Every step observable** | `runPipeline` fires an `onStep` callback per step; the front end streams progress over SSE |

---

## 2. Data Flow in Detail

```
Data source (JSON/HTML/RSS)
   │  fetchers.ts        field-mapped extraction → RawEvent[]
   ▼
normalize.ts              strip HTML, unify timestamps, compute ageHours → NormalizedEvent[]
   ▼
scorer.dedupe()           merge when title similarity ≥ 0.82
   ▼
trading-calendar.ts       A-share trading calendar (is-trading-day / last N days / staleness)
   ▼
scorer.applyHardFilters() exclude words / heat / last-N-trading-days window / sector blacklist
   ▼
scorer.scoreAndRank()     five-dimension weighting + keyword adjustments → ScoredEvent[]
   ▼
scorer.selectTop()        take TopN (default 1)
   ▼
writer.generateFieldsByRules()  or  llm.generateFieldsWithLLM()
   │                      produces ReportFields (impact analysis / chain / beneficiaries / risks…)
   ▼
writer.renderTemplate()   template engine → ReportDraft
   ▼
banner.generateBanner()   brand config + event data → SVG / PNG
```

---

## 3. Extension Scenarios

### Scenario 1: Connect a real subscription portal (URL + credentials)

Edit `config/data-sources.json`, or fill it in on the **Data sources** page. Minimal form:

```jsonc
{
  "id": "my-subscription",
  "name": "XX Financial News",
  "type": "http-login",
  "enabled": true,
  "config": {
    "authMode": "cookie",
    "loginUrl": "https://site.com/api/login",
    "loginMethod": "POST",
    "loginContentType": "application/json",
    "loginBody": { "username": "{{username}}", "password": "{{password}}" },
    "credentials": { "username": "your-account", "password": "your-password" },
    "listUrl": "https://site.com/api/hot?date={{date}}&limit=50",
    "listMethod": "GET",
    "headers": { "User-Agent": "Mozilla/5.0" },
    "parser": {
      "kind": "json",
      "itemsPath": "data.list",
      "fieldMap": {
        "title": "title", "summary": "digest", "url": "link",
        "publishedAt": "publish_time", "heat": "hot_value",
        "sectors": "sectors", "stocks": "related_stocks"
      }
    }
  }
}
```

Then set `activeSourceId` to `my-subscription` (or click **Set as default** in the UI).

**Debugging tip**: start by filling in only `loginUrl` + `listUrl`, run `npm run pipeline` once, and
check the log for `login succeeded (cookie acquired)` and `source returned N events`. Add field
mappings incrementally after that.

#### Handling awkward real-world sites

Real portals are rarely a clean "JSON login + flat list". The cases below were all encountered and
are now supported — treat this as a troubleshooting checklist.

**① The site is an SPA and its API lives on another domain**

The page body is just an empty `<div id="app">`. Fetch the JS bundle the page references and search
it for `baseURL`, `"/login"`, or API path strings — that reveals the real API domain and endpoints.

**② Login is a multipart form**

```jsonc
"loginContentType": "multipart/form-data",
"loginBody": { "name": "{{username}}", "pwd": "{{password}}" }
```

Note the field names are not necessarily `username` / `password`. The adapter sends via `FormData`
and **automatically drops any hand-set Content-Type** (otherwise the boundary is missing and the
server fails to parse the request).

**③ Login failures also return HTTP 200**

The business error code hides in the response body and must be checked explicitly:

```jsonc
"successCodePath": "retCode",   // path into the response
"successCode": "000",           // expected value
"messagePath": "retMsg"         // used to build the error message on failure
```

**④ The token goes straight into Authorization, with no Bearer prefix**

```jsonc
"authMode": "header",           // cookie | bearer | header
"tokenPath": "data.token"
```

**⑤ The list is nested (event → sectors → stocks/ETFs)**

```jsonc
"parser": {
  "kind": "json",
  "itemsPath": "",                        // empty string = the response *is* the array
  "fieldMap": { "title": "eventName", "publishedAt": "eventDate" },
  "sectorListPath": "sectorList",
  "sectorFieldMap": { "name": "sectorName", "change": "increase", "remark": "sectorRemark" },
  "securityListPath": "securityList",
  "securityFieldMap": { "name": "name", "code": "code", "change": "increase" },
  "etfListPath": "etfList",
  "etfFieldMap": { "name": "name", "code": "code", "change": "increase" }
}
```

Mapping populates `sectorDetails` / `securityDetails` / `etfs` automatically and projects
`sectors` / `stocks` into flat arrays, so downstream scoring and copy logic need no changes.
`sectorRemark` (the sector-level transmission note) is preferred as the copy's "impact analysis".

**⑥ The source has no heat field, or a different change convention**

Derive it from existing fields:

```jsonc
"derive": {
  "marketChange": "maxSectorChange",   // maxSectorChange | maxAbsSectorChange | avgSectorChange
  "heatPerPercent": 200000,            // 1% move ≈ 200k heat (a proxy, not real heat)
  "summaryFrom": "sectorReaction",     // sectorReaction | sectorRemark
  "contentFrom": "allSectorRemarks"
}
```

**⑦ Stop hammering the real site**

```jsonc
"cache": { "ttlMinutes": 720 }
```

The first response is snapshotted to `server/data/cache/`; within the TTL **even the login request is
skipped**. To force a refresh, delete the cache file or temporarily lower `ttlMinutes`.

**⑧ Keep credentials out of the config file**

```jsonc
"credentials": { "username": "${MY_USER}", "password": "${MY_PASS}" }
```

Real values go in `.env` at the project root (already gitignored). The adapter resolves `${VAR}` from
the environment, leaving only placeholders in the config file.

> Tip: if a site redesign breaks scraping, reproduce one request in the browser devtools Network
> panel, verify the endpoint, request-body field names and auth headers, then write them back into
> the config.

### Scenario 2: Add a new data-source type

In `server/pipeline/fetchers.ts`:

```ts
async function fetchMyApi(source: DataSource, ctx: FetchContext): Promise<FetchResult> {
  const resp = await fetch(source.config.endpoint);
  const json = await resp.json();
  return { events: json.data.map(toRawEvent) };
}

export async function fetchFromSource(source, ctx) {
  switch (source.type) {
    case 'mock':       return fetchMock(source, ctx);
    case 'http-login': return fetchHttpLogin(source, ctx);
    case 'rss':        return fetchRss(source, ctx);
    case 'my-api':     return fetchMyApi(source, ctx);   // ← new
  }
}
```

Also update the `DataSource['type']` union in `types.ts` and the front-end dropdown options.

### Scenario 3: Adjust the scoring dimensions

**Changing weights/thresholds**: drag the sliders on the **Rules** page, or edit
`config/filter-rules.json`.

> **Recalibrate after switching data sources.** Weighting only makes sense relative to how much each
> dimension actually varies on *your* source. For example, after connecting the sample source we
> found every event carries exactly 3 sectors, so "industry coverage" was nearly constant and had
> little discriminative power, while "freshness" varied a lot inside the trading-day window.
> We therefore settled on 38 / 12 / 26 / 14 / 10, with a 12 h half-life and a +15 same-day bonus.
>
> How to calibrate: run `npm run pipeline` once and inspect the per-dimension value distribution in
> `candidates[].breakdown` inside `server/data/runs/*.json`. If a dimension takes the same value for
> almost every event, it has no discriminative power on that source — downweight it, or adjust the
> ceiling in its `params` (`heatCeiling`, `changeCeiling`, `sectorCeiling`) so it uses the full
> 0–100 range.

**On score saturation**: `ScoredEvent` keeps both `totalScore` (clamped to 0–100, for display) and
`rawScore` (unclamped, used for sorting). Ranking uses `rawScore`, so when several events saturate at
100 the order stays stable instead of collapsing into ties.

**Adding a dimension** (say "capital flow"):

1. Add an entry to `dimensions` in `filter-rules.json`:
   ```json
   { "key": "capitalFlow", "label": "Capital flow", "weight": 0.1, "enabled": true,
     "params": { "northboundCeiling": 100 } }
   ```
2. Add a `case 'capitalFlow'` to `scoreDimension()` in `scorer.ts`:
   ```ts
   case 'capitalFlow': {
     const ceiling = params.northboundCeiling ?? 100;
     const flow = Number((e as any).northbound ?? 0);      // the fetcher must supply this field
     const score = clamp((Math.abs(flow) / ceiling) * 100);
     return { score, detail: `Northbound net inflow ¥${flow}00M` };
   }
   ```
3. Remember to rebalance the weights back to 100%.

### Scenario 4: Add or modify copy templates

Create a template on the **Templates** page. `body` supports:

| Syntax | Meaning |
|--------|---------|
| `{{variable}}` | Interpolation. Built-in variables are listed at the bottom of the page |
| `{{#each array}} ... {{/each}}` | Loop; use `{{this}}` or `{{this.name}}` inside |
| `{{#if variable}} ... {{/if}}` | Conditional rendering |

A template's `fields` declare which content fields must be produced. When LLM polish is enabled,
`fields[].prompt` is passed to the model as the writing instruction.

### Scenario 5: Adjust the banner layout

The layout lives in `buildBannerSvg()` in `server/pipeline/banner.ts`, which concatenates SVG strings.
Colors, size, slogan and disclaimer come from `config/brand.json`, so code changes are rarely needed.

Coordinate system (default 1080×608):

| Region | y range | Content |
|--------|---------|---------|
| Brand bar | 0–96 | Broker · product name / date |
| Event label | ~148 | `TODAY'S EVENT` + heat badge |
| Headline | 190–330 | Up to 3 lines, 40 px bold |
| Sector chips | 340–384 | Up to 4, with overflow protection |
| Industry chain (3 columns) | 410–534 | Upstream / midstream / downstream |
| Compliance bar | 548–608 | Call to action + disclaimer |

### Scenario 6: Wire in a compliance word list

Add a validation pass before `composeDraft()` returns in `writer.ts`:

```ts
const BANNED = ['guaranteed gain', 'risk-free', 'always profitable'];
const hit = BANNED.find((w) => text.includes(w));
if (hit) throw new Error(`Copy contains a prohibited term: ${hit}`);
```

A more complete approach is to call the firm's compliance API and write the result into the `run`
record.

### Scenario 7: Adjust the time window / maintain the trading calendar

The filter window is measured in **A-share trading days**, not hours:

```jsonc
"hardFilters": {
  "minHeat": 0,
  "requireSectors": false,
  "maxTradingDays": 2,        // keep the last 2 trading days
  "maxStaleTradingDays": 1    // tolerate a 1-day lag; beyond that, fail loudly
}
```

**Why not hours**: the primary source's date field is UTC midnight (= 08:00 Beijing time). Cutting at
"48 hours" means a Friday 08:00 item expires by Sunday 08:00 — so output would be empty from Saturday
afternoon through the whole of Sunday and Monday morning. Monday morning is precisely when the copy
is most needed.

**The calendar** lives in `config/trading-calendar.json` and is generated by
`tools/build-trading-calendar.ts`:

```bash
npm run build:calendar     # regenerate (after next year's holiday schedule is published)
npm test                   # regression tests
```

Maintenance notes:

- The rule is "**Monday–Friday AND not a statutory holiday**". ⚠️ The exchange stays **closed on
  make-up workdays** (weekends that 调休 turns into working days), so "is it a working day" is the
  wrong test.
- Years outside the calendar degrade to "Monday–Friday are trading days". The UI and
  `GET /api/scout/calendar` both report which years are covered.
- To swap in an internal trading calendar, keep the shape
  `{ coveredYears, holidays: { 'YYYY-MM-DD': 'name' } }` and replace the loader in
  `trading-calendar.ts`.

**The window's anchor date** is "the trading day of the newest item in the source", not "today" —
on a trading morning (especially Monday 07:30) the current day's data does not exist yet, and
anchoring on today would collapse the window to a single day.

---

## 4. API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check; reports the active persistence backend |
| GET | `/api/scout/meta` | Returns brand / sources / rules / templates in one call |
| GET | `/api/scout/config/:name` | Read one config (`brand`/`sources`/`rules`/`templates`) |
| PUT | `/api/scout/config/:name` | Overwrite a config |
| POST | `/api/scout/run` | Run the pipeline synchronously, returning the full `PipelineRun` |
| GET | `/api/scout/run/stream` | **SSE** pipeline run; emits `{type:'step'}` events, then `{type:'result'}` |
| GET | `/api/scout/calendar` | A-share calendar state (is today a trading day, last trading day, next 5) |
| GET | `/api/scout/runs` | Run history (summaries) |
| GET | `/api/scout/runs/:id` | Full detail for one run |
| POST | `/api/scout/recompose` | Re-render the same top event with a different template |
| GET | `/api/scout/banners/:file` | Banner static assets (svg/png) |

`run/stream` accepts the query parameters `sourceId`, `templateId`, `useLlm`, `model`, `topN`.

---

## 5. CLI and Scheduling

```bash
npm run pipeline                 # run once, print the briefing and banner path
npm run pipeline -- --llm        # enable LLM polish
npm run report                   # also export a self-contained HTML briefing to output/
npm run typecheck                # type-check front end and back end
npm run build                    # type-check + production front-end build
```

Example crontab for a 07:30 daily run:

```cron
30 7 * * 1-5 cd /path/to/project && /usr/local/bin/npm run report >> logs/daily.log 2>&1
```

---

## 6. Directory Cheat Sheet

| Path | Responsibility | Changing it affects |
|------|----------------|---------------------|
| `config/brand.json` | Brand identity | Banner appearance, copy signature |
| `config/data-sources.json` | Data sources | Fetching behaviour |
| `config/filter-rules.json` | Ranking rules | Which event wins |
| `config/templates.json` | Copy templates | Copy layout |
| `server/pipeline/fetchers.ts` | Adapter implementations | Adding a new source type |
| `server/pipeline/scorer.ts` | Scoring algorithm | Adding a scoring dimension |
| `server/pipeline/writer.ts` | Template engine / field generation | Copy content logic |
| `server/pipeline/knowledge.ts` | Industry-chain & stock knowledge base | Chain descriptions and beneficiary accuracy |
| `server/pipeline/banner.ts` | Banner layout | Rendered output |
| `server/pipeline/llm.ts` | LLM polish | AI copy quality |
| `server/api.ts` | REST routes | Front-end/back-end contract |
| `src/pages/*` | Front-end pages | The UI |
