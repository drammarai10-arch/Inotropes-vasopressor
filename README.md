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
Worker `b8bf327f-7569-435b-8ac6-9d86e947dab7`, version `d44a2238-8eae-4af0-b850-f14960b67ba5`,
447 KiB upload / 103 KiB gzip, 6 ms startup.
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
| **Evidence brief** | `#/trial/<id>` | Fourteen source-verified sections inside the trial dialog, grouped under five reading headings: bottom line, major points, absolute effects, subgroups, harms, implications, guidelines cited, inclusion criteria, exclusion criteria, baseline characteristics, analysis methods, trial conduct, funding and declarations, and criticisms. 4,129 verified claims across all 89 trials, each anchored to a quotation matched back to the source document, with a per-claim traceability tag. |

Also: light/dark theme (persisted), keyboard-navigable, ARIA-labelled, print stylesheet,
and `prefers-reduced-motion` support.

## Evidence brief

Each trial carries a fourteen-section **evidence brief** — the structured reading of a
trial that a clinician actually wants, grouped into the five questions a reader asks of a
trial report:

| Group | Sections |
|---|---|
| **What the trial found** | Bottom line, major points, absolute effects, subgroups, harms reported |
| **Reading the result** | Implications, guidelines cited |
| **Who was studied** | Inclusion criteria, exclusion criteria, baseline characteristics |
| **How it was run** | Analysis methods, trial conduct, funding and declarations |
| **Critique** | Criticisms |

Coverage: **all 89 trials**, **4,129 verified claims** (91% of the 4,514 extracted).

| Section | Items |
|---|---|
| Baseline characteristics | 685 |
| Major points | 468 |
| Trial conduct | 438 |
| Analysis methods | 398 |
| Exclusion criteria | 330 |
| Absolute effects | 328 |
| Harms reported | 319 |
| Inclusion criteria | 289 |
| Funding and declarations | 279 |
| Criticisms | 231 |
| Subgroups | 208 |
| Guidelines cited | 156 |
| Bottom line / Implications | 89 / 89 |

The `kind` discriminator on the conduct, methods, harms, funding and criticism items is
rendered as a human-readable label (e.g. `Analysis population`, `Endpoint adjudication`,
`Declared interests`), so a reader can see what *sort* of fact each claim is without the
interface printing a raw machine token.

### How a claim earns its place

Every brief item carries a `quote`. The verifier keeps an item **only if that quotation
can be located in the trial's own source document**; anything untraceable is dropped, never
softened. A second, independent guard then checks every **displayed figure** against the
source text.

The matching is tiered, and the reason is specific to these documents. Most of the source
PDFs are two-column journal articles, and the text layer serialises them **line by line**,
which interleaves the columns:

```
"arrhyth-   was a randomized, placebo-controlled, double-   mias within..."
 ^left tail              ^right column head                  ^left column again
```

A correct quotation is therefore frequently *not* a contiguous substring of the extracted
text. Matching only on contiguous substrings recovered **43%** of claims and discarded
genuine ones — false negatives, not fabrication. The tiers, tried in order:

1. **exact** — contiguous in the reading-order text
2. **dehyph** — as above, after rejoining line-break hyphenation (`double- blind`)
3. **wordrun** — in-order word match requiring ≥90% coverage, an intact anchor run of ≥5
   words and a bounded span. Survives column interleaving (which inserts words but never
   reorders them) while a paraphrase fails the coverage test
4. **squash** — punctuation-insensitive, digit-gated so it cannot accept a figure the
   source does not contain
5. **exact_full** — fallback for the 5 documents whose text layer defeats column extraction

Three artifacts in the first verifier were discarding real content, and all three are
fixed: Latin ligatures (`ﬁ`/`ﬂ`, present in 19 of 88 sources), thin-space thousands
separators (`10 305`), and table columns jammed with no separator
(`118.9/76.1119.2/75.7119.6/75.0`). Numeric drops fell from **800 to 3**.

### Traceability tags

Because the reconstruction above is invisible to a reader, every claim is labelled:

| Tag | Meaning |
|---|---|
| `verbatim` | A contiguous extract of the source text. |
| `verbatim · rejoined` | Contiguous after a hyphenated line break was rejoined. |
| `reconstructed` | Every word appears in order in the source, but the extract had to be reassembled across a column break. Wording is the source's; byte-exact typography is not guaranteed. |

### Previously missing briefs, now recovered

The first extraction pass lost six trials when the underlying language-model credits ran
out mid-run. They were re-extracted with the extended schema and are now verified like
every other trial:

`ADVOR`, `DELIVER`, `DAPA-MI`, `EMPACT-MI`, `DIGIT-HF`, `DECISION`.

The interface still renders an explicit gap notice for a trial whose brief is genuinely
absent, because an empty brief panel would read as a finding of "nothing to report",
which is a different and unsupported claim. That path is no longer reached by any trial
in this dataset; a smoke test guards the recovered six against regressing into it.

### What the extended sections do and do not establish

Four of the new sections carry a caveat shown in the interface, because the distinction
matters:

- **Absolute effects** depend on this trial's baseline risk and follow-up duration; they
  do not transfer unchanged to a different population.
- **Subgroups** are hypothesis-generating. The trial is powered for its overall
  comparison, not for each subgroup.
- **Harms reported** is what the article chose to report, not a systematic safety review.
- **Funding and declarations** records that a declaration exists. It is not a judgement
  about the result; it is the fact a reader needs in order to weigh it.

### One thing the brief deliberately does not claim

The section is titled **"Guidelines cited"**, not "guidelines affected". The extraction can
show that an article *references* a guideline; it cannot show that this trial *changed* a
recommendation. 14 of the 156 guideline items contain words like "update" purely because
that word appears in a guideline's own title. No causal impact is claimed.

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
node test/smoke.mjs     # 97 assertions across all six views (needs the server running)
node test/design.mjs    # 138 assertions on the stylesheet (no server needed)
```

`smoke.mjs` loads the real server shell in jsdom, executes the production
`public/static/app.js` against the live API, and drives filtering, the forest plot,
comparison, timeline, quiz answering, the trial modal, theme persistence, route
fallback and the interactive-element contract.

`design.mjs` is the stylesheet's own gate. Because colour here *encodes meaning* — a
hue names a clinical domain, a direction hue names a result — a missing token or an
unreadable pair is a correctness bug, not a cosmetic one. It parses both theme token
blocks and separately asserts:

- every `var()` reference resolves to a declared token
- every foreground/background pair the interface actually renders clears the WCAG AA
  ratio for its role — 4.5:1 for text, 3:1 for borders, focus rings and graphics
- **the ramp stops too.** The brand mark and primary button paint `--on-accent` over a
  three-stop gradient, so all three stops are checked, not just `--accent`
- borders are checked against the **darkest ground they are drawn on** (a domain card
  tint), not just `--surface`
- the seven domain hues are perceptually separable, measured as **CIE Lab ΔE ≥ 20**

That last point is a deliberate correction. An earlier version of this test compared
domain hues with a *contrast ratio* and demanded 1.25:1. Contrast measures luminance, so
two saturated hues of similar lightness — a hot pink and a deep violet — legitimately
score ≈1.0 against each other, and a healthy, clearly-distinct palette was reported as
18 failures. Contrast answers "can I read this?"; ΔE answers "are these two colours
different?". Using the wrong one produced false failures, which is worse than no test.

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
