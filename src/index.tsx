/**
 * Cardiovascular Outcomes Trial Evidence Base — Hono application.
 *
 * The Worker serves three things:
 *   1. `/api/*`  — read-only JSON derived from the verified extraction dataset
 *   2. static assets from `public/` (app.js, styles.css)
 *   3. an HTML shell for every other route (single-page app, client-side routing)
 *
 * There is no runtime storage binding: the dataset is compiled into the Worker
 * bundle at build time. Nothing is user-writable, so no D1 / KV / R2 is needed.
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import {
  trials,
  meta,
  trialIndex,
  trialById,
  buildQuiz,
  isPlottable,
  briefMeta,
  briefIndex,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  type Domain,
} from './data'
import { DIRECTION_LABELS, DESIGN_LABELS, BLINDING_LABELS, MULTICENTER_LABELS } from './labels'
import { GLOSSARY, GLOSSARY_CATEGORY_LABELS, CONCEPTS, READING_GUIDE } from './learn'

const app = new Hono()

app.use('/api/*', cors())

// ------------------------------------------------------------------ API

app.get('/api/health', (c) =>
  c.json({ ok: true, trials: trials.length, built: meta.built })
)

/**
 * Dataset metadata: counts, distributions, verification statistics and every
 * enum label map the client needs to render a coded value as prose.
 */
app.get('/api/meta', (c) =>
  c.json({
    ...meta,
    domain_labels: DOMAIN_LABELS,
    domain_order: DOMAIN_ORDER,
    direction_labels: DIRECTION_LABELS,
    design_labels: DESIGN_LABELS,
    blinding_labels: BLINDING_LABELS,
    multicenter_labels: MULTICENTER_LABELS,
    source_documents_ingested: 91,
    duplicates_removed: 5,
    plottable_effect_sizes: trials.filter(isPlottable).length,
    briefs: briefMeta,
  })
)

/**
 * Evidence brief for one trial, proxied from the static asset so an API
 * consumer has a single origin to talk to.
 *
 * The brief files themselves live under `/static/briefs/` and are served by
 * the CDN without waking the Worker (see dist/_routes.json). This endpoint
 * exists for programmatic access; the browser client fetches the static asset
 * directly to stay off the Worker's request path.
 */
app.get('/api/briefs/:id', async (c) => {
  const id = c.req.param('id')
  if (!trialById(id)) return c.json({ error: 'not_found', id }, 404)
  const entry = briefIndex.trials[id]
  if (!entry) return c.json({ error: 'no_brief', id }, 404)
  const res = await c.env?.ASSETS?.fetch(new URL(`/static/briefs/${id}.json`, c.req.url))
  if (!res || !res.ok) {
    // The index knows a brief exists but the asset is unreachable: report the
    // gap explicitly rather than silently returning an empty brief.
    return c.json({ error: 'brief_unavailable', id, status: entry.status }, 503)
  }
  return new Response(res.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
})

/** Which trials have a verified brief, for list views and API consumers. */
app.get('/api/briefs', (c) =>
  c.json({
    meta: briefMeta,
    trials: Object.entries(briefIndex.trials).map(([id, e]) => ({
      id,
      acronym: trialById(id)?.acronym ?? id,
      status: e.status,
      verified_claims: e.verified_claims,
      extracted_claims: e.extracted_claims,
      reason: e.reason ?? null,
    })),
  })
)

/**
 * Trial list with optional server-side filtering.
 * The client normally fetches the full index once and filters locally for
 * responsiveness; these parameters exist for API consumers and deep links.
 */
app.get('/api/trials', (c) => {
  const q = c.req.query()
  let rows = trialIndex

  if (q.domain) {
    const wanted = new Set(q.domain.split(',').filter(Boolean))
    rows = rows.filter((t) => wanted.has(t.domain))
  }
  if (q.direction) {
    const wanted = new Set(q.direction.split(',').filter(Boolean))
    rows = rows.filter((t) => wanted.has(t.direction))
  }
  if (q.design) {
    const wanted = new Set(q.design.split(',').filter(Boolean))
    rows = rows.filter((t) => wanted.has(t.design))
  }
  if (q.drug) {
    const drug = q.drug.toLowerCase()
    rows = rows.filter(
      (t) =>
        t.intervention.toLowerCase().includes(drug) ||
        t.comparators.some((x) => x.toLowerCase().includes(drug))
    )
  }
  if (q.year_from) rows = rows.filter((t) => (t.year ?? 0) >= Number(q.year_from))
  if (q.year_to) rows = rows.filter((t) => (t.year ?? 9999) <= Number(q.year_to))
  if (q.plottable === 'true') rows = rows.filter((t) => t.plottable)
  if (q.search) {
    const s = q.search.toLowerCase()
    rows = rows.filter((t) =>
      [t.acronym, t.short_label, t.intervention, t.comparators.join(' '), t.key_finding]
        .join(' ')
        .toLowerCase()
        .includes(s)
    )
  }
  const sort = q.sort ?? 'year'
  const dir = q.order === 'desc' ? -1 : 1
  rows = rows.slice().sort((a, b) => {
    if (sort === 'n') return ((a.n ?? 0) - (b.n ?? 0)) * dir
    if (sort === 'effect') return ((a.value ?? 9) - (b.value ?? 9)) * dir
    if (sort === 'acronym') return a.acronym.localeCompare(b.acronym) * dir
    return ((a.year ?? 0) - (b.year ?? 0)) * dir
  })

  const limit = Math.min(Number(q.limit ?? 500) || 500, 500)
  return c.json({ total: rows.length, count: Math.min(rows.length, limit), trials: rows.slice(0, limit) })
})

/** Full record for one trial, by id. */
app.get('/api/trials/:id', (c) => {
  const t = trialById(c.req.param('id'))
  if (!t) return c.json({ error: 'not_found', id: c.req.param('id') }, 404)
  return c.json(t)
})

/** Quiz questions built only from source-verified facts. */
app.get('/api/quiz', (c) => {
  const count = Math.min(Number(c.req.query('count') ?? 10) || 10, 30)
  const seed = Number(c.req.query('seed') ?? 42) || 42
  const questions = buildQuiz(count, seed)
  return c.json({ seed, count: questions.length, questions })
})

/**
 * Educational layer: glossary, concept articles and the reading walkthrough.
 *
 * Served from the same Worker as the dataset so a worked example and the trial
 * it points at can never diverge. `examples[]` carry only trial ids — the
 * client resolves the figures live from /api/trials/:id.
 */
app.get('/api/learn', (c) =>
  c.json({
    glossary: GLOSSARY,
    glossary_categories: GLOSSARY_CATEGORY_LABELS,
    concepts: CONCEPTS,
    reading_guide: READING_GUIDE,
  })
)

/**
 * Single glossary term, by URL-encoded name (case-insensitive).
 * Used for deep links such as #/learn?term=Hazard%20ratio.
 */
app.get('/api/learn/term/:term', (c) => {
  const wanted = c.req.param('term').trim().toLowerCase()
  const entry = GLOSSARY.find((g) => g.term.toLowerCase() === wanted)
  if (!entry) return c.json({ error: 'not_found', term: c.req.param('term') }, 404)
  return c.json(entry)
})

/** Per-domain summary used by the timeline and the overview charts. */
app.get('/api/domains', (c) =>
  c.json({
    domains: DOMAIN_ORDER.map((d: Domain) => {
      const rows = trials.filter((t) => t.domain === d)
      const plottable = rows.filter(isPlottable)
      return {
        domain: d,
        label: DOMAIN_LABELS[d],
        trials: rows.length,
        participants: rows.reduce((s, t) => s + (t.n || 0), 0),
        plottable: plottable.length,
        median_effect: plottable.length
          ? [...plottable].map((t) => t.primary_effect.value as number).sort((a, b) => a - b)[
              Math.floor(plottable.length / 2)
            ]
          : null,
        span: rows.length
          ? [Math.min(...rows.map((t) => t.year ?? 9999)), Math.max(...rows.map((t) => t.year ?? 0))]
          : null,
      }
    }),
  })
)

// --------------------------------------------------------- static + shell

app.use('/static/*', serveStatic({ root: './' }))

app.get('/favicon.ico', (c) => c.body(null, 204))

/**
 * Single-page shell. All navigation happens client-side so that the app works
 * from a static asset bundle with no per-route server render.
 */
const SHELL = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CV Trial Evidence Base — a source-verified guide to ${trials.length} landmark trials</title>
<meta name="description" content="An interactive, source-verified evidence base of ${trials.length} landmark cardiovascular randomised trials (1986–2026), with a plain-language guide to reading hazard ratios, composite endpoints and non-inferiority results. Every figure traced to its source publication." />
<meta name="color-scheme" content="light dark" />
<meta property="og:title" content="CV Trial Evidence Base" />
<meta property="og:description" content="${trials.length} source-verified cardiovascular trials, 1986–2026 — with an educational guide to reading the evidence." />
<meta property="og:type" content="website" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b5cab'/%3E%3Cpath d='M3 17h5l2.5-7 3.5 13 3.5-18 3 14 2.5-5h6' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
<link href="/static/styles.css" rel="stylesheet" />
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="#/explore" aria-label="Home — CV Trial Evidence Base">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="32" height="32" role="presentation">
          <path d="M2 21h6l3-8 4 15 4-21 4 17 3-6h12" fill="none" stroke="currentColor" stroke-width="2.8"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="brand-text">
        <strong>CV Trial Evidence Base</strong>
        <small>${trials.length} verified trials · 1986–2026</small>
      </span>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a href="#/explore" data-nav="explore">Explore</a>
      <a href="#/forest" data-nav="forest">Forest plot</a>
      <a href="#/compare" data-nav="compare">Compare</a>
      <a href="#/timeline" data-nav="timeline">Timeline</a>
      <a href="#/quiz" data-nav="quiz">Quiz</a>
      <a href="#/learn" data-nav="learn">Learn</a>
      <a href="#/about" data-nav="about">Methods</a>
    </nav>
    <button id="theme-toggle" class="icon-btn" type="button" aria-label="Switch colour theme" title="Switch colour theme">
      <span aria-hidden="true">◐</span>
    </button>
  </div>
</header>
<main id="main" class="wrap" tabindex="-1">
  <div id="view" class="view" aria-live="polite" aria-busy="true">
    <p class="loading">Loading evidence base…</p>
  </div>
</main>
<footer class="site-footer">
  <div class="wrap">
    <p><strong>Attribution.</strong> Structured facts were extracted from ${trials.length} trial publications supplied by the user
    (NEJM, The Lancet, JAMA, Circulation, European Heart Journal, Clinical Therapeutics, NEJM Evidence and Nature Medicine).
    Copyright remains with the respective publishers and authors. This tool reproduces short quotations for scholarly
    citation only and does not redistribute the source articles. Not medical advice.</p>
    <p class="footer-meta" id="footer-meta"></p>
  </div>
</footer>
<script src="/static/app.js" type="module"></script>
</body>
</html>`

app.get('*', (c) => c.html(SHELL()))

export default app
