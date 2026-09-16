# CV Trial Evidence Base

An interactive, source-verified evidence base of **89 landmark cardiovascular
randomised trials and analyses (1986–2026, 811,690 participants)**, built from 91
uploaded PDF publications spanning lipids and atherosclerosis, heart failure, acute
coronary syndromes (antiplatelet and anticoagulant strategies), atrial fibrillation
and RAAS blockade.

Every number shown in the interface was **string-matched back to its source document**
before publication. Nothing in the UI is inferred: fields that could not be
established from the source are rendered as absent rather than guessed.

## Public URL

**Live:** https://b8bf327f-7569-435b-8ac6-9d86e947dab7.vip.gensparksite.com

Deployed to Cloudflare Workers for Platform (Genspark-managed account) via `gsk hosted deploy`.
Worker `b8bf327f-7569-435b-8ac6-9d86e947dab7`, 409 KiB upload / 91 KiB gzip, 7 ms startup.
No bindings beyond static assets — no D1, no R2, no KV, no secrets.

## Features

| View | Route | What it does |
|---|---|---|
| **Explore** | `#/explore` | Filterable card grid: 89 trials, chip filters for domain / direction / design, full-text search, four sort orders, CSV export, and a per-card confidence-interval strip on a shared log axis. |
| **Forest plot** | `#/forest` | All 73 plottable effect estimates on one logarithmic axis. Marker area ∝ log₁₀(participants), colour = direction, grouped by domain. Non-ratio endpoints are listed and explicitly annotated as not plottable. |
| **Compare** | `#/compare` | Up to five trials side by side across 20 fields (population, intervention, endpoint, effect, safety, limitations, source file), with preset selections. Highlights the smallest value where a minimum is meaningful. |
| **Timeline** | `#/timeline` | Four decades of evidence. Clickable domain and five-year-period bar charts scope a chronological listing; every item links to its record. |
| **Quiz** | `#/quiz` | Deterministic self-test (`?seed=&count=`) generated **only from verified figures**. Multiple-choice with per-question explanations that cite the source file. Seeded, so a seed always reproduces the same quiz. |
| **Learn** | `#/learn` | The educational layer: a 6-step reading guide, 5 concept articles (hazard ratios, relative vs absolute effects, composite endpoints, non-inferiority, disagreeing trials) and a 37-term glossary in 6 themed groups, 16 of which carry a "common misreading" note. Inline glossary tooltips appear in the forest and compare explainers, and `?term=` deep-links to a highlighted definition. |
| **Methods** | `#/about` | The extraction/verification pipeline, the verification ledger, coverage by domain and design, licensing, limitations, and the full API reference. |
| **Trial detail** | `#/trial/<id>` | Modal with the primary result, secondary/subgroup results, safety signals, limitations, verbatim short extracts, full metadata and per-field provenance. |

Also: light/dark theme (persisted), keyboard-navigable, ARIA-labelled, print stylesheet,
and `prefers-reduced-motion` support.

## Data architecture

- **Data model** — one `Trial` record per study: identifiers, design, population,
  intervention, comparators, primary endpoint, `primary_effect` (metric, value, 95% CI,
  P value, direction, event rates), `secondary_results[]`, safety signals, limitations,
  short verbatim `evidence_quotes[]`, and a `provenance` map recording how each numeric
  field was verified.
- **Storage** — **none at runtime.** The verified dataset (`content/trials.json`, 402 KB)
  is compiled into the Worker bundle at build time and served read-only over the JSON API.
  No D1 / KV / R2 binding is used, because nothing is user-writable. This is deliberately
  the simplest possible deploy target.
- **Data flow** — PDFs → text extraction (+ OCR for five image-only documents) →
  deduplication by normalised text hash → schema-constrained LLM extraction →
  normalisation to controlled vocabularies → numeric verification against source text →
  `content/trials.json` → Worker bundle → `/api/*` → client SPA.

### Verification ledger

| Measure | Result |
|---|---|
| Source documents ingested | 91 (5 duplicate uploads removed → 86 unique) |
| Unique trials and analyses | 89 |
| Effect sizes matched to source | 81 / 81 |
| Sample sizes matched directly | 84 |
| Sample sizes derived by summation | 4 (each component individually verified) |
| **Numeric fields left unverified** | **0** |

## API

All endpoints are read-only and CORS-enabled.

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness probe: trial count and dataset build date. |
| `GET /api/meta` | Counts, distributions, verification totals and every enum label map. |
| `GET /api/trials` | Trial list. Filters: `domain`, `direction`, `design`, `drug`, `year_from`, `year_to`, `plottable=true`, `search`, `sort` (`year\|n\|effect\|acronym`), `order`, `limit` (≤500). |
| `GET /api/trials/:id` | One full record, or `404 { "error": "not_found" }`. |
| `GET /api/quiz` | Deterministic quiz: `count` (≤30), `seed`. |
| `GET /api/domains` | Per-domain trials, participants, plottable count, median effect and year span. |

Example:

```bash
curl "https://<host>/api/trials?domain=lipids&plottable=true&sort=effect"
```

## Run and deploy

```bash
# install (already done in a fresh sandbox)
npm install

# build: compiles the Worker with the dataset inlined, copies public/ to dist/
npm run build

# local preview on :3000
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

`wrangler pages dev dist` serves the built output — it is **not** a watch server, so
re-run `npm run build` after changing `src/` or `content/`.

**Environment variables / secrets:** none. There is no API key, no database
connection string and no runtime configuration. The dataset is public evidence data.

### Tests

```bash
node test/smoke.mjs     # 39 assertions across all six views (needs the server running)
```

The harness loads the real server shell in jsdom, executes the production
`public/static/app.js` against the live API, and drives filtering, the forest plot,
comparison, timeline, quiz answering, the trial modal, theme persistence, route
fallback and the interactive-element contract.

## Tech stack

Hono 4 · TypeScript · Vite 8 · Cloudflare Workers/Pages · vanilla-JS SPA
(no framework) · hand-written CSS design system with light/dark tokens.

## Known limitations

- Coverage reflects the supplied document set; it is **not** a systematic sample, and
  absent trials are not evidence of absent evidence.
- Only primary effect estimates are plotted. Secondary and subgroup results are shown in
  each record but are **not** pooled and are not adjusted for multiplicity.
- Eight trials report a non-ratio primary outcome (composite scores, AUCs, absolute
  mortality percentages). They are listed with their result but cannot be plotted.
- No indirect comparison or network meta-analysis is performed. A hazard ratio of 0.79 in
  one trial and 0.86 in another is not a like-for-like comparison.
- Text extraction and language-model reading can miss or misplace figures. A verified
  match confirms the digits appear in the source document, not that the surrounding
  interpretation is complete.
- Records are frozen at extraction time; later follow-up publications, corrections and
  retractions are not incorporated.

## Attribution and licensing

The source articles are **copyrighted works**. This application does not host, reproduce
or redistribute them. It stores extracted numeric facts plus its own summaries, and
reproduces only short verbatim extracts (typically one sentence) in the trial detail view
for scholarly citation. Copyright in those extracts remains with the respective publishers
and authors.

Journals represented: The New England Journal of Medicine; The Lancet; JAMA; Circulation;
European Heart Journal; Clinical Therapeutics; NEJM Evidence; Nature Medicine.

**This is a research and teaching tool. It is not medical advice.**
