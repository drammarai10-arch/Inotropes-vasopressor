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
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  type Domain,
} from './data'
import { DIRECTION_LABELS, DESIGN_LABELS, BLINDING_LABELS, MULTICENTER_LABELS } from './labels'

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
const SHELL = (origin: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CV Trial Evidence Base — statin, heart failure &amp; antithrombotic trials</title>
<meta name="description" content="An interactive, source-verified evidence base of ${trials.length} landmark cardiovascular randomised trials (1986–2026), covering statins, heart failure and antithrombotic therapy. Every figure traced to its source publication." />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%AB%80%3C/text%3E%3C/svg%3E" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link href="/static/styles.css" rel="stylesheet" />
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="#/explore" aria-label="Home — CV Trial Evidence Base">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="34" height="34" role="presentation">
          <path d="M2 21h6l3-8 4 15 4-21 4 17 3-6h12" fill="none" stroke="currentColor" stroke-width="2.6"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="brand-text">
        <strong>CV Trial Evidence Base</strong>
        <small>${trials.length} source-verified cardiovascular trials · 1986–2026</small>
      </span>
    </a>
    <nav class="site-nav" aria-label="Primary">
      <a href="#/explore" data-nav="explore">Explore</a>
      <a href="#/forest" data-nav="forest">Forest plot</a>
      <a href="#/compare" data-nav="compare">Compare</a>
      <a href="#/timeline" data-nav="timeline">Timeline</a>
      <a href="#/quiz" data-nav="quiz">Quiz</a>
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

app.get('*', (c) => c.html(SHELL(new URL(c.req.url).origin)))

export default app
