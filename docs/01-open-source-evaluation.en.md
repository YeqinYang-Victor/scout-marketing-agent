**English** | [简体中文](./01-开源选型评估.md)

# Open-Source Evaluation Report

> Goal: pick a reusable base project for the *Chain Scout* brokerage marketing-copy pipeline.
> Surveyed: 2026-10-06 | Source: GitHub API (`api.github.com`), read live

---

## 1. Requirements Breakdown

The business need breaks down into five technical capabilities, used as evaluation axes:

| # | Capability | Notes | Weight |
|---|------------|-------|--------|
| C1 | **Multi-source ingestion** | URL + username/password login, Cookie/Token auth, JSON/HTML/RSS parsing | High |
| C2 | **Event ranking** | Configurable multi-dimension scoring (market impact, sector coverage, freshness…) | High |
| C3 | **LLM rewriting** | Turn a structured event into forward-ready marketing copy | Medium |
| C4 | **Template management** | Copy templates must be configurable, addable, versioned | High |
| C5 | **Banner generation** | Auto-produce the app-homepage image | Medium |
| C6 | **Interactive app shell** | An interface relationship managers / ops can actually use | High |

Key constraints:

- The data source is currently reachable only via **URL + username/password**; an API comes later
  ⇒ the ingestion layer must be **pluggable**.
- This is a **regulated brokerage** context, so **text accuracy** in copy and images is non-negotiable
  (no AI-generated images that mangle Chinese characters).
- We must ship a **working application**, not a pile of scripts.

---

## 2. Candidate Survey

### 2.1 Financial news aggregation / daily-brief generators

| Project | Stars | Lang | Last update | Notes |
|---------|-------|------|-------------|-------|
| [AI4Finance-Foundation/**FinRobot**](https://github.com/AI4Finance-Foundation/FinRobot) | 8.1k | Python | 2026-09-28 | Financial LLM multi-agent platform. Broadest capability, but aimed at *research/analysis* rather than *marketing copy production*; large and expensive to adapt |
| [DemonDamon/**FinnewsHunter**](https://github.com/DemonDamon/FinnewsHunter) | 1.5k | Python | 2026-10-01 | Multi-agent financial intelligence: live news analysis + sentiment fusion + factor mining. **Its event-scoring approach is directly worth borrowing** |
| [liuyueyi/**ai-aggregator-report**](https://github.com/liuyueyi/ai-aggregator-report) | 1 | Python | 2026-10-05 | LLM multi-source aggregation + daily report. **Closest architecture**: clean layering across `fetchers/` (one adapter per source), `dedup.py`, `classifier.py`, `rank.py`, `render.py`, `workflow.py` |
| [mizid0402-ops/**finance-daily**](https://github.com/mizid0402-ops/finance-daily) | 0 | Python | 2026-10-05 | Scrape 24h financial news → dedupe → cluster → generate a Chinese daily. Complete flow, but a personal script-level project |
| [qinshan214/**finance-daily-report**](https://github.com/qinshan214/finance-daily-report) | 0 | Python | 2026-08-28 | Multi-source ingestion + Lark doc generation. Its source list is a useful reference |
| [ZhuLinsen/**daily_stock_analysis**](https://github.com/ZhuLinsen/daily_stock_analysis) | 65.9k | Python | 2026-10-05 | Quotes + news + LLM analysis + push. Star count looks anomalous (forks ≈ stars) — **authenticity doubtful, not used as a base** |

### 2.2 Banner / image generation

| Project | Stars | Lang | Last update | Notes |
|---------|-------|------|-------------|-------|
| [vercel/**satori**](https://github.com/vercel/satori) | 14.0k | TypeScript | Active | **HTML/CSS → SVG**, the industry standard for OG images; but needs extra font files loaded to render Chinese |
| [liyasthomas/**banner**](https://github.com/liyasthomas/banner) | 220 | JavaScript | 2022-01-23 | Pure front-end Canvas banner generator. Simple, but unmaintained with weak customization |

### 2.3 Agent app shell

| Project | Notes |
|---------|-------|
| Bundled **`codebuddy-chat-web`** scaffold | React 18 + Vite + TypeScript + TDesign + Tailwind front end; Express + SSE + SQLite back end; **native CodeBuddy Agent SDK integration** (session management, streaming, tool-call visualization, permission control) |
| Bundled **`agent-sdk-dev`** | Agent SDK development and verification plugin, providing official best practices and a verifier |

---

## 3. Conclusion

### 3.1 Why not build on one of the Python projects

1. **Wrong shape** — they are all "script + cron + push", with no interactive app shell (C6).
   This project needs an interface for relationship managers and ops.
2. **Data source is not pluggable** — `ai-aggregator-report`'s `fetchers/` design is good, but its
   adapters are hard-coded (HackerNews, arXiv, GitHub Trending…). There is **no
   "username/password login to a subscription portal"** category (C1).
3. **Split tech stack** — a Python back end plus a separately built front end means a long delivery
   path, and the Agent SDK's session / permission / streaming capabilities can't be reused directly.
4. **Compliance risk** — marketing copy and app creatives demand high text accuracy;
   text-to-image generation is not reliable here.

### 3.2 Chosen approach: **build on the official Agent scaffold, borrow architecture from OSS**

| Module | Source | How it was reused |
|--------|--------|-------------------|
| **App shell / backend service / Agent integration** | `codebuddy-chat-web` scaffold (bundled) | ✅ **Used as the base project directly**, customized on top |
| **Layered ingestion** (one adapter per source behind a single entry point) | `liuyueyi/ai-aggregator-report` | 📐 **Architecture borrowed**, rewritten in TypeScript as `server/pipeline/fetchers.ts`, plus a new `http-login` adapter |
| **Dedupe + event scoring + ranking** | `DemonDamon/FinnewsHunter`, `mizid0402-ops/finance-daily` | 📐 **Approach borrowed**, implemented as the configurable five-dimension model in `server/pipeline/scorer.ts` |
| **Banner rendering** | Alternative to `vercel/satori` | 🔧 **Hand-rolled templated SVG rendering** (see below) |

### 3.3 The Banner technical decision

`satori` was evaluated and **deliberately not adopted**:

1. Rendering Chinese with satori requires bundling CJK font files (10 MB+), and missing glyphs
   render as tofu boxes.
2. This project's banner layout is **highly fixed** (brand bar + headline + sector chips +
   three-column industry chain + compliance footer). A **plain SVG string template** covers it with
   zero extra dependencies and zero font risk.
3. SVG is vector: crisp at any resolution, with brand colors and fonts 100% under our control.
4. When a raster image is needed, `sharp` converts to PNG server-side (falling back to SVG-only on
   failure).

> Reference implementation: `server/pipeline/banner.ts`.

---

## 4. Resulting Architecture

```
scout-marketing-agent/
├── config/                       ← ★ Business config (user-editable, no code changes)
│   ├── data-sources.json             ① Data sources (URL + credentials / RSS / demo)
│   ├── filter-rules.json             ② Ranking rules (five weights, thresholds, keywords)
│   ├── templates.json                ③ Copy template library
│   └── brand.json                    ④ Brand visual identity (for banners)
│
├── server/
│   ├── index.ts                   ← Scaffold: Express + SSE + Agent SDK
│   ├── db.ts                      ← Scaffold: SQLite session persistence
│   ├── api.ts                     ← Added: business REST API (/api/scout/*)
│   ├── cli.ts                     ← Added: CLI pipeline runner (cron-friendly)
│   └── pipeline/                  ← Added: the core pipeline
│       ├── fetchers.ts                Data-source adapters (mock / http-login / rss)
│       ├── normalize.ts               Normalization
│       ├── scorer.ts                  Dedupe + hard filters + five-dimension scoring + ranking
│       ├── writer.ts                  Template engine + rule-based field generation
│       ├── llm.ts                     Agent SDK polish (optional, auto-fallback on failure)
│       ├── banner.ts                  Banner SVG/PNG generation
│       ├── knowledge.ts               Industry-chain & stock knowledge base
│       └── run.ts                     Pipeline orchestration (with progress callbacks)
│
└── src/                          ← Front end (React + TDesign + Tailwind)
    ├── App.tsx                        App shell + sidebar navigation
    ├── api/scout.ts                   Business API client
    └── pages/
        ├── ScoutDashboard.tsx         ① Workbench: one-click run + scoreboard + copy + banner
        ├── SourcesPage.tsx            ② Data sources + brand identity
        ├── RulesPage.tsx              ③ Ranking rules
        ├── TemplatesPage.tsx          ④ Template management + preview
        └── AgentPage.tsx              Agent chat (natural-language driven)
```

### How the four core modules landed

| Requirement | Implementation |
|-------------|----------------|
| **Data-source configuration** | `config/data-sources.json` + visual editing in `SourcesPage`. Adding a source is one JSON entry, no code change |
| **Custom ranking rules** | `config/filter-rules.json` + `RulesPage` sliders for weights, thresholds and keyword tables |
| **Copy template management** | `config/templates.json` + `TemplatesPage` for adding/removing templates and fields, with a built-in template engine and preview |
| **Automatic banner generation** | `config/brand.json` drives brand visuals; `banner.ts` lays out and renders, downloadable as SVG/PNG |

---

## 5. Future Evolution

1. **Data source** — once the portal exposes an API, add a `type: "api"` adapter in
   `data-sources.json` and switch; zero changes to business code.
2. **Scoring model** — the five weights could be tuned by the business side via monthly back-testing
   (current values are heuristics).
3. **Copy quality** — setting `CODEBUDDY_API_KEY` enables LLM polish, markedly improving naturalness.
4. **Compliance** — wire in the firm's compliance word list and validate at the `writer.ts` exit.
5. **Scheduling** — run `npm run pipeline` under cron / CI for automatic 07:30 daily output.
