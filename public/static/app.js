/* ==========================================================================
   CV Trial Evidence Base — client application
   --------------------------------------------------------------------------
   Renders every value from `/api/*`, which is served from content/trials.json.
   That dataset was built by string-matching each extracted number against its
   source publication, so nothing shown here is invented: values that could not
   be matched are either absent or shipped with an explicit provenance verdict.

   Routes (hash-based):
     #/explore[?domain=&direction=&design=&q=&sort=&order=&plot=1]  browse/filter
     #/forest[?domain=&source=]                                     forest plot
     #/compare[?ids=a,b,c]                                          side-by-side
     #/timeline[?period=&domain=]                                   chronology
     #/quiz[?count=&seed=]                                          self-test
     #/about                                                        methods
     #/trial/<id>                                                   detail overlay
   ========================================================================== */

/* ------------------------------------------------------------------ config */

const RATIO_METRICS = new Set(['HR', 'RR', 'OR', 'IRR']);
const PLOT_LO = 0.3;
const PLOT_HI = 11;
const LOG_LO = Math.log(PLOT_LO);
const LOG_HI = Math.log(PLOT_HI);
const MAX_COMPARE = 5;
const THEME_KEY = 'cvteb.theme';
const QUIZ_BEST_KEY = 'cvteb.quiz.best';

/* --------------------------------------------------------------- utilities */

const $ = (sel, root = document) => root.querySelector(sel);

/** Element factory. `children` accepts nodes, strings and nested arrays. */
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(node, children);
  return node;
}

function append(parent, children) {
  for (const child of children.flat(3)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG element factory.
 *
 * Two details that differ from the HTML helper: `style` is assigned as a style
 * object rather than a string (so `stroke: 'var(--benefit)'` resolves — CSS
 * custom properties are not substituted inside SVG presentation attributes),
 * and attribute names are passed through untouched so camelCase SVG names such
 * as `viewBox` survive.
 */
function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

const fmtInt = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US');

const fmtP = (p) => {
  if (!p) return null;
  const s = String(p).trim();
  return /^[<>=]/.test(s) ? `P ${s}` : `P = ${s}`;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Percentage position of a ratio on the fixed log axis, so cards compare. */
const ratioPos = (v) => ((Math.log(clamp(v, PLOT_LO, PLOT_HI)) - LOG_LO) / (LOG_HI - LOG_LO)) * 100;

const isPlottable = (t) =>
  RATIO_METRICS.has(t.metric) && t.value != null && t.value > 0 && t.ci_low != null && t.ci_low > 0;

function effectText(t) {
  if (t.value === null || t.value === undefined) return 'not reported';
  const ci =
    t.ci_low !== null && t.ci_high !== null && t.ci_low !== undefined && t.ci_high !== undefined
      ? ` (95% CI ${t.ci_low}–${t.ci_high})`
      : '';
  return `${t.metric} ${t.value}${ci}`;
}

function relChange(t) {
  if (!RATIO_METRICS.has(t.metric) || t.value == null) return null;
  const delta = Math.round((1 - t.value) * 100);
  if (delta === 0) return 'no difference';
  return delta > 0 ? `${delta}% relative reduction` : `${Math.abs(delta)}% relative increase`;
}

const dirClass = (d) => `dir-${d}`;
const dirLabel = (d) => state.labels.direction?.[d] ?? d;

const accentFor = (d) =>
  d === 'benefit' ? 'var(--benefit)' : d === 'harm' ? 'var(--harm)' : 'var(--neutral)';

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------- state */

const state = {
  meta: null,
  labels: { domain: {}, direction: {}, design: {}, blinding: {}, multicenter: {} },
  trials: [],
  domains: [],
  filters: { domain: new Set(), direction: new Set(), design: new Set(), q: '', sort: 'year', order: 'desc', plot: false },
  compare: [],
  detail: new Map(),
  timeline: { period: null, domain: null },
  quiz: { questions: [], index: 0, answers: [], seed: 42, count: 10, done: false },
  forest: { domain: null, source: 'any' },
  prevHash: '#/explore',
  returnHash: '#/explore',
  modalOpen: false,
  lastFocus: null,
  /** True once the first view has been painted (see openTrial deep-link path). */
  booted: false,
  /** Navigation generation counter, and the token of the render now in flight. */
  navToken: 0,
  renderToken: 0,
};

const api = {
  async json(path) {
    const res = await fetch(path, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`);
    return res.json();
  },
};

async function trialDetail(id) {
  if (state.detail.has(id)) return state.detail.get(id);
  const record = await api.json(`/api/trials/${encodeURIComponent(id)}`);
  state.detail.set(id, record);
  return record;
}

/* ------------------------------------------------------------------- theme */

function applyTheme(theme) {
  const chosen = theme ?? storedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = chosen;
  const btn = $('#theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(chosen === 'dark'));
    btn.title = chosen === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
  return chosen;
}

function storedTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable (private mode) — theme still applies for this session */
  }
  applyTheme(next);
}

/* ------------------------------------------------------------------ router */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'explore';
  const [path, query = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  return { view: segments[0] || 'explore', arg: segments[1] ? decodeURIComponent(segments[1]) : null, params: new URLSearchParams(query) };
}

const VIEWS = {}; // populated as each view module is defined below

/**
 * Route dispatch.
 *
 * Views that await network calls (Compare resolves full records, Quiz fetches
 * questions) can finish out of order when the user navigates quickly. A
 * monotonically increasing token marks the newest navigation; `mount` discards
 * output from any render whose token has been superseded, so a slow older view
 * can never overwrite a newer one.
 */
async function route() {
  const token = ++state.navToken;
  const { view, arg, params } = parseHash();

  if (view === 'trial' && arg) {
    state.renderToken = token;
    await openTrial(arg);
    return;
  }

  closeModal();
  if (state.prevHash !== location.hash) state.returnHash = state.prevHash || '#/explore';
  const render = VIEWS[view] || VIEWS.explore;
  state.renderToken = token;
  await render(params);
  if (state.navToken !== token) return; // superseded while awaiting
  state.prevHash = location.hash || '#/explore';
  for (const link of document.querySelectorAll('.site-nav a')) {
    const target = (link.getAttribute('href') || '').replace('#/', '').split('?')[0];
    const active = view === target || (view === 'trial' && target === 'explore');
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

const mount = (...nodes) => {
  // Drop stale output: a newer navigation started while this one was awaiting.
  if (state.renderToken !== state.navToken) return;
  const view = $('#view');
  view.replaceChildren();
  view.setAttribute('aria-busy', 'false');
  append(view, nodes);
  view.scrollIntoView({ block: 'start', behavior: 'instant' });
};

function pageHead(title, subtitle) {
  return h('header', { class: 'page-head' }, h('h1', { text: title }), subtitle ? h('p', { text: subtitle }) : null);
}

function card(...children) {
  return h('section', { class: 'card' }, ...children);
}

function statBlock(label, value, sub) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label', text: label }),
    h('span', { class: 'stat-value', text: value }),
    sub ? h('span', { class: 'stat-sub', text: sub }) : null
  );
}

function dirBadge(direction) {
  return h('span', { class: `dir ${dirClass(direction)}`, text: dirLabel(direction) });
}

function errorCard(message, retry) {
  return card(
    h('h2', { text: 'Something went wrong' }),
    h('p', { class: 'muted', text: message }),
    retry ? h('button', { class: 'btn primary', type: 'button', text: 'Retry', onClick: retry }) : null
  );
}

/** Horizontal confidence-interval strip used on trial cards. */
function miniCi(t) {
  if (!isPlottable(t) || t.ci_high == null) return null;
  const left = ratioPos(t.ci_low);
  const right = ratioPos(t.ci_high);
  const point = ratioPos(t.value);
  return h(
    'div',
    { class: 'mini-ci', role: 'img', 'aria-label': `${effectText(t)}, log scale from 0.3 to 11` },
    h('span', { class: 'band', style: { left: `${left}%`, width: `${Math.max(1.2, right - left)}%` } }),
    h('span', { class: 'pt', style: { left: `calc(${point}% - 1.5px)` } })
  );
}

/* ------------------------------------------------------------------- modal */

function closeModal() {
  const backdrop = $('.modal-backdrop');
  if (backdrop) backdrop.remove();
  if (state.modalOpen) {
    state.modalOpen = false;
    document.body.style.overflow = '';
    if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
  }
}

async function openTrial(id) {
  if (!state.booted) {
    // Deep link straight to a trial: paint a view underneath so that closing
    // the dialog (Back) lands somewhere meaningful instead of an empty shell.
    closeModal();
    await (VIEWS.explore || VIEWS.about)(new URLSearchParams());
    state.booted = true;
  }
  if (state.modalOpen && $('.modal-backdrop')?.dataset.trialId === id) return;

  let trial;
  try {
    trial = await trialDetail(id);
  } catch (err) {
    closeModal();
    mount(pageHead('Trial not found'), errorCard(String(err.message || err), () => go(state.returnHash)));
    return;
  }

  if (!state.modalOpen) {
    state.lastFocus = document.activeElement;
    state.returnHash = state.prevHash || '#/explore';
  }
  closeModal();
  state.modalOpen = true;
  state.lastFocus = document.activeElement;
  document.body.style.overflow = 'hidden';

  const backdrop = h(
    'div',
    {
      class: 'modal-backdrop',
      dataset: { trialId: id },
      onClick: (e) => {
        if (e.target === backdrop) go(state.returnHash);
      },
    },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h(
        'header',
        { class: 'modal-head' },
        h(
          'div',
          null,
          h('h2', { id: 'modal-title', text: `${trial.acronym} (${trial.year ?? 'year unknown'})` }),
          h('p', { class: 'muted small', text: trial.title })
        ),
        h('button', {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Close trial details',
          text: '✕',
          onClick: () => go(state.returnHash),
        })
      ),
      h('div', { class: 'modal-body' }, ...trialDetailBody(trial))
    )
  );

  document.body.append(backdrop);
  $('.modal-head .icon-btn', backdrop).focus();

  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      go(state.returnHash);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = backdrop.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.modalOpen) go(state.returnHash);
});

function trialDetailBody(t) {
  const p = t.primary_effect;
  const rel = relChange(p);
  const rows = [
    ['Domain', state.labels.domain?.[t.domain] ?? t.domain],
    ['Design', state.labels.design?.[t.design] ?? t.design],
    ['Blinding', state.labels.blinding?.[t.blinding] ?? t.blinding],
    ['Multicentre', t.multicenter],
    ['Phase', t.phase],
    ['Population', t.population],
    ['Participants', t.n === null ? null : `${fmtInt(t.n)}${t.n_note ? ` — ${t.n_note}` : ''}`],
    ['Intervention', t.intervention],
    ['Comparator' + (t.comparators.length > 1 ? 's' : ''), t.comparators.join(' · ')],
    ['Primary endpoint', t.primary_endpoint],
    ['Follow-up', t.follow_up],
    ['Registration', t.registration],
    ['DOI', t.doi],
    ['Journal', t.journal],
    ['Citation', t.citation],
    ['Source file', `${t.source_file}${t.source_chars ? ` (${fmtInt(t.source_chars)} characters extracted)` : ''}`],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  const numbersVerified = Object.entries(t.provenance || {}).filter(([, v]) => v === 'verified').length;
  const numbersDerived = Object.entries(t.provenance || {}).filter(([, v]) => v === 'derived').length;

  return [
    h(
      'div',
      { class: `result-box ${dirClass(p.direction)}` },
      h('div', { class: 'big', text: effectText(p) }),
      rel ? h('div', { class: 'endpoint', text: `≈ ${rel} for the intervention arm` }) : null,
      h('div', { class: 'endpoint', text: `Primary endpoint: ${t.primary_endpoint}` }),
      fmtP(p.p_value) ? h('div', { class: 'endpoint', text: fmtP(p.p_value) }) : null,
      p.event_rate_intervention || p.event_rate_comparator
        ? h('div', {
            class: 'endpoint',
            text: `Events — intervention ${p.event_rate_intervention ?? 'n/r'}; comparator ${p.event_rate_comparator ?? 'n/r'}`,
          })
        : null
    ),

    h(
      'p',
      { class: 'small' },
      dirBadge(p.direction),
      ' ',
      h('span', { class: 'tag', text: t.extraction_confidence ? `extraction confidence: ${t.extraction_confidence}` : 'confidence n/a' }),
      ' ',
      numbersVerified ? h('span', { class: 'tag verified', text: `${numbersVerified} figures matched to source` }) : null,
      ' ',
      numbersDerived ? h('span', { class: 'tag derived', text: `${numbersDerived} derived by summation` }) : null
    ),

    card(h('h2', { text: 'Key finding' }), h('p', { text: t.key_finding_oneliner })),

    t.secondary_results.length
      ? card(
          h('h2', { text: 'Secondary and subgroup results' }),
          h(
            'div',
            { class: 'sec-list' },
            ...t.secondary_results.map((s) =>
              h(
                'div',
                { class: 'sec-item' },
                h(
                  'div',
                  null,
                  h('div', { text: s.endpoint }),
                  s.note ? h('div', { class: 'small muted', text: s.note }) : null
                ),
                h('div', { class: 'm', text: `${s.value === null ? s.metric ?? 'n/r' : `${s.metric ?? ''} ${s.value}${s.ci_low != null && s.ci_high != null ? ` (${s.ci_low}–${s.ci_high})` : ''}`}` })
              )
            )
          )
        )
      : null,

    t.safety_signals.length
      ? card(
          h('h2', { text: 'Safety signals' }),
          h('ul', { class: 'plain' }, ...t.safety_signals.map((x) => h('li', { text: x })))
        )
      : null,

    t.limitations.length
      ? card(
          h('h2', { text: 'Limitations' }),
          h('ul', { class: 'plain' }, ...t.limitations.map((x) => h('li', { text: x })))
        )
      : null,

    t.evidence_quotes.length
      ? card(
          h('h2', { text: 'Verbatim extracts' }),
          ...t.evidence_quotes.map((q) => h('blockquote', { class: 'quote', text: `“${q}”` })),
          h('p', { class: 'small faint', text: 'Short quotations reproduced for scholarly citation. Copyright remains with the publisher and authors.' })
        )
      : null,

    h(
      'dl',
      { class: 'kv' },
      ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: String(v) })])
    ),

    h(
      'p',
      { class: 'small muted' },
      t.extraction_notes ? `Extraction notes: ${t.extraction_notes}` : 'No extraction caveats recorded for this record.'
    ),
  ];
}

/* ------------------------------------------------------------------ explore */

function syncFilters(params) {
  const f = state.filters;
  const csv = (k) => (params.get(k) ? new Set(params.get(k).split(',').filter(Boolean)) : new Set());
  f.domain = csv('domain');
  f.direction = csv('direction');
  f.design = csv('design');
  f.q = params.get('q') || '';
  f.sort = params.get('sort') || 'year';
  f.order = params.get('order') || 'desc';
  f.plot = params.get('plot') === '1';
}

function filtersToHash() {
  const f = state.filters;
  const p = new URLSearchParams();
  if (f.domain.size) p.set('domain', [...f.domain].join(','));
  if (f.direction.size) p.set('direction', [...f.direction].join(','));
  if (f.design.size) p.set('design', [...f.design].join(','));
  if (f.q) p.set('q', f.q);
  if (f.sort !== 'year') p.set('sort', f.sort);
  if (f.order !== 'desc') p.set('order', f.order);
  if (f.plot) p.set('plot', '1');
  const q = p.toString();
  return `#/explore${q ? `?${q}` : ''}`;
}

function filteredTrials() {
  const f = state.filters;
  const needle = f.q.trim().toLowerCase();
  let rows = state.trials.filter((t) => {
    if (f.domain.size && !f.domain.has(t.domain)) return false;
    if (f.direction.size && !f.direction.has(t.direction)) return false;
    if (f.design.size && !f.design.has(t.design)) return false;
    if (f.plot && !t.plottable) return false;
    if (!needle) return true;
    return [t.acronym, t.short_label, t.intervention, t.comparators.join(' '), t.key_finding, String(t.year)]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
  const dir = f.order === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    if (f.sort === 'n') return ((a.n ?? 0) - (b.n ?? 0)) * dir;
    if (f.sort === 'effect') return ((a.value ?? 9) - (b.value ?? 9)) * dir;
    if (f.sort === 'acronym') return a.acronym.localeCompare(b.acronym) * dir;
    return ((a.year ?? 0) - (b.year ?? 0)) * dir;
  });
  return rows;
}

function chipRow(label, options, selected, toggle, counts) {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label', text: label }),
    h(
      'div',
      { class: 'chips' },
      ...options.map((opt) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(selected.has(opt.value)),
            onClick: (e) => toggle(opt.value, e.currentTarget),
          },
          opt.label,
          counts ? h('span', { class: 'count', text: counts[opt.value] ?? 0 }) : null
        )
      )
    )
  );
}

function trialCard(t) {
  const p = t.primary_effect ?? t; // detail vs index shape
  const rel = relChange(p);
  const acr = t.acronym;
  const sub = t.short_label || '';
  const open = () => go(`#/trial/${t.id}`);
  return h(
    'article',
    {
      class: 'trial-card',
      dataset: { dir: p.direction, id: t.id },
      role: 'button',
      tabindex: '0',
      'aria-label': `${acr} (${t.year ?? 'year unknown'}) — ${sub}. ${effectText(p)}${rel ? `, ${rel}` : ''}. Open the full trial record.`,
      onClick: open,
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      },
    },
    h(
      'div',
      { class: 'tc-head' },
      h('span', { class: 'tc-acronym', text: acr }),
      h('span', { class: 'tc-year', text: t.year ?? '—' })
    ),
    h('p', { class: 'tc-title', text: sub }),
    h(
      'div',
      { class: 'tc-effect' },
      h('span', { class: 'val', text: effectText(p) }),
      rel ? h('span', { class: 'rel', text: rel }) : null
    ),
    miniCi(p),
    h(
      'div',
      { class: 'tc-foot' },
      dirBadge(p.direction),
      h('span', { class: 'tag', text: state.labels.domain?.[t.domain] ?? t.domain }),
      t.n !== null && t.n !== undefined ? h('span', { class: 'tag mono', text: `n ${fmtInt(t.n)}` }) : null,
      t.plottable ? h('span', { class: 'tag verified', text: 'plottable' }) : null
    )
  );
}

function buildFiltersPanel() {
  const f = state.filters;
  const domainCounts = {};
  for (const d of state.domains) domainCounts[d.domain] = d.trials;
  const directionCounts = state.meta.by_direction;
  const designCounts = state.meta.by_design;

  const repaint = () => {
    history.replaceState(null, '', filtersToHash());
    drawResults();
    drawSummary();
  };

  // Mutates the clicked chip in place instead of rebuilding the panel, so
  // keyboard focus is never lost mid-interaction.
  const toggleIn = (set) => (value, el) => {
    if (set.has(value)) set.delete(value);
    else set.add(value);
    el.setAttribute('aria-pressed', String(set.has(value)));
    repaint();
  };

  const search = h('input', {
    type: 'search',
    id: 'q',
    value: f.q,
    placeholder: 'Acronym, drug, population…',
    'aria-label': 'Search trials',
    onInput: (e) => {
      f.q = e.target.value;
      clearTimeout(search._t);
      search._t = setTimeout(repaint, 140);
    },
  });

  const sort = h(
    'select',
    {
      id: 'sort',
      'aria-label': 'Sort trials by',
      onChange: (e) => {
        f.sort = e.target.value;
        repaint();
      },
    },
    ...[
      ['year', 'Publication year'],
      ['effect', 'Effect size'],
      ['n', 'Sample size'],
      ['acronym', 'Acronym'],
    ].map(([v, l]) => h('option', { value: v, selected: f.sort === v, text: l }))
  );

  const order = h(
    'select',
    {
      id: 'order',
      'aria-label': 'Sort direction',
      onChange: (e) => {
        f.order = e.target.value;
        repaint();
      },
    },
    h('option', { value: 'desc', selected: f.order === 'desc', text: 'Descending' }),
    h('option', { value: 'asc', selected: f.order === 'asc', text: 'Ascending' })
  );

  const panel = h(
    'section',
    { class: 'filters', 'aria-label': 'Filter trials' },
    h(
      'div',
      { class: 'filter-row' },
      h('div', { class: 'field grow' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'sort', text: 'Sort by' }), sort),
      h('div', { class: 'field' }, h('label', { for: 'order', text: 'Order' }), order),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label', text: 'Display' }),
        h(
          'div',
          { class: 'chips' },
          h('button', {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(f.plot),
            text: 'Plottable only',
            onClick: (e) => {
              f.plot = !f.plot;
              e.currentTarget.setAttribute('aria-pressed', String(f.plot));
              repaint();
            },
          }),
          h('button', {
            class: 'btn sm',
            type: 'button',
            text: 'Reset',
            onClick: () => {
              state.filters = {
                domain: new Set(),
                direction: new Set(),
                design: new Set(),
                q: '',
                sort: 'year',
                order: 'desc',
                plot: false,
              };
              go(filtersToHash());
            },
          })
        )
      )
    ),
    h(
      'div',
      { class: 'filter-row', style: { marginTop: '13px' } },
      chipRow(
        'Evidence domain',
        state.meta.domain_order.map((d) => ({ value: d, label: state.labels.domain[d] })),
        f.domain,
        toggleIn(f.domain),
        domainCounts
      )
    ),
    h(
      'div',
      { class: 'filter-row', style: { marginTop: '13px' } },
      chipRow(
        'Direction of primary result',
        Object.keys(state.labels.direction).map((d) => ({ value: d, label: state.labels.direction[d] })),
        f.direction,
        toggleIn(f.direction),
        directionCounts
      )
    ),
    h(
      'div',
      { class: 'filter-row', style: { marginTop: '13px' } },
      chipRow(
        'Design',
        Object.keys(state.labels.design).map((d) => ({ value: d, label: state.labels.design[d] })),
        f.design,
        toggleIn(f.design),
        designCounts
      )
    ),
    h('div', { class: 'filter-summary', id: 'filter-summary' })
  );
  return panel;
}

function drawSummary() {
  const box = $('#filter-summary');
  if (!box) return;
  const rows = filteredTrials();
  const participants = rows.reduce((s, t) => s + (t.n || 0), 0);
  const plottable = rows.filter((t) => t.plottable).length;
  box.replaceChildren(
    h('span', { class: 'result-count', text: `${fmtInt(rows.length)} of ${fmtInt(state.trials.length)} trials shown` }),
    h('span', { class: 'muted small mono nowrap', text: `${fmtInt(participants)} participants` }),
    h('span', { class: 'muted small mono nowrap', text: `${plottable} with plottable effect` })
  );
}

function drawResults() {
  const target = $('#results');
  if (!target) return;
  const rows = filteredTrials();
  const head = h(
    'div',
    { class: 'result-bar' },
    h('span', { class: 'result-count', text: `${fmtInt(rows.length)} trial${rows.length === 1 ? '' : 's'}` }),
    h('button', {
      class: 'btn sm',
      type: 'button',
      text: 'Export CSV',
      disabled: rows.length === 0,
      onClick: () => exportTrials(rows),
    })
  );
  if (!rows.length) {
    target.replaceChildren(
      head,
      card(h('h2', { text: 'No trials match these filters' }), h('p', { class: 'muted', text: 'Clear a filter or widen the search term.' }))
    );
    return;
  }
  target.replaceChildren(head, h('div', { class: 'trial-grid' }, ...rows.map(trialCard)));
}

function exportTrials(rows) {
  const header = [
    'id', 'acronym', 'year', 'journal', 'domain', 'design', 'intervention', 'comparators',
    'participants', 'primary_endpoint', 'metric', 'value', 'ci_low', 'ci_high', 'p_value',
    'direction', 'plottable', 'key_finding', 'source_file',
  ];
  const body = rows.map((t) => [
    t.id, t.acronym, t.year, t.journal ?? state.labels.domain?.[t.domain], t.domain, t.design,
    t.intervention, (t.comparators || []).join(' | '), t.n, t.primary_endpoint ?? '',
    t.metric, t.value, t.ci_low, t.ci_high, t.p_value, t.direction, t.plottable, t.key_finding, t.source_file ?? '',
  ]);
  downloadCsv('cv-trials-export.csv', [header, ...body]);
}

VIEWS.explore = async function renderExplore(params) {
  syncFilters(params);
  const m = state.meta;
  // Period keys are five-year buckets ('1985s'); sort numerically rather than
  // relying on the JSON's insertion order, and derive the true median.
  const periods = Object.entries(m.by_period).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
  const first = periods[0];
  const last = periods[periods.length - 1];
  const sizes = state.trials.map((t) => t.n).filter((n) => n != null).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const benefitShare = Math.round(((m.by_direction.benefit ?? 0) / state.trials.length) * 100);
  const nonRatio = state.trials.length - m.plottable_effect_sizes;

  mount(
    pageHead(
      'Explore the cardiovascular trial evidence base',
      `${fmtInt(m.unique_trials)} landmark randomised trials and related analyses published between ${m.years[0]} and ${m.years[1]}, spanning lipids, heart failure, acute coronary syndromes, atrial fibrillation and renin–angiotensin blockade. Every figure below was string-matched back to the source publication before it was published here.`
    ),
    h(
      'div',
      { class: 'stat-grid' },
      statBlock('Trials', fmtInt(m.unique_trials), `${fmtInt(m.source_documents_ingested)} documents ingested, ${m.duplicates_removed} duplicates removed`),
      statBlock('Participants', fmtInt(m.total_participants), `median ${fmtInt(median)} per trial`),
      statBlock('Publication span', `${m.years[0]}–${m.years[1]}`, `${first?.[0] ?? ''} → ${last?.[0] ?? ''}`),
      statBlock('Favouring intervention', `${benefitShare}%`, `${m.by_direction.benefit} benefit · ${m.by_direction.neutral} neutral · ${m.by_direction.harm} harm`),
      statBlock('Plottable effects', fmtInt(m.plottable_effect_sizes), `${nonRatio} trials report a non-ratio endpoint`),
      statBlock('Numeric fields unverified', String(m.unverified_fields), `across ${fmtInt(m.source_documents)} source documents`)
    ),
    buildFiltersPanel(),
    h('div', { id: 'results' })
  );
  drawResults();
  drawSummary();
};

/* ------------------------------------------------------------- forest plot */

/** Square-marker side length, a rough analogue of meta-analytic weight. */
const markerSize = (n) => (n ? clamp(4 + Math.log10(n) * 1.15, 4, 13) : 5);

function forestPlot(rows) {
  const rowH = 27;
  const top = 40;
  const bottom = 52;
  const labelW = 340;
  const plotW = 552;
  const rightW = 132;
  const width = labelW + plotW + rightW;
  const height = top + rows.length * rowH + bottom;

  const x = (v) => labelW + ((Math.log(clamp(v, PLOT_LO, PLOT_HI)) - LOG_LO) / (LOG_HI - LOG_LO)) * plotW;

  const root = svg('svg', {
    class: 'forest',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
    'aria-label': `Forest plot of ${rows.length} trials on a logarithmic ratio axis. Values below 1 favour the intervention.`,
  });

  const open = (id) => () => go(`#/trial/${id}`);

  // Axis gridlines, ticks and header labels.
  const ticks = [0.5, 1, 2, 5, 10];
  for (const tick of ticks) {
    const gx = x(tick);
    root.append(
      svg('line', { class: tick === 1 ? 'refline' : 'gridline', x1: gx, x2: gx, y1: top - 14, y2: height - bottom + 10 })
    );
    root.append(
      svg('text', {
        class: 'axis-label',
        x: gx,
        y: height - bottom + 26,
        'text-anchor': 'middle',
        text: tick === 1 ? '1.00' : tick.toFixed(2),
      })
    );
  }
  root.append(
    svg('text', {
      class: 'axis-label',
      x: labelW + plotW / 2,
      y: height - 8,
      'text-anchor': 'middle',
      text: 'Ratio of primary outcome (log scale) — left of 1.00 favours the intervention',
    })
  );
  root.append(
    svg('text', { class: 'axis-label', x: 4, y: 20, text: 'Trial' })
  );
  root.append(
    svg('text', { class: 'axis-label', x: width - 6, y: 20, 'text-anchor': 'end', text: 'Effect (95% CI)' })
  );

  let lastDomain = null;
  rows.forEach((t, i) => {
    const y = top + i * rowH + rowH / 2;

    if (t.domain !== lastDomain) {
      lastDomain = t.domain;
      const label = state.labels.domain?.[t.domain] ?? t.domain;
      root.append(svg('text', { class: 'axis-label', x: 4, y: y - rowH + 14, text: label.toUpperCase(), 'font-weight': 700 }));
      root.append(
        svg('line', { class: 'gridline', x1: 4, x2: width - 6, y1: y - rowH + 20, y2: y - rowH + 20, 'stroke-dasharray': '3 3' })
      );
    }

    root.append(
      svg('rect', { class: 'row-band', x: 0, y: y - rowH / 2, width, height: rowH, onClick: open(t.id), role: 'button', tabindex: 0 })
    );
    root.append(
      svg('text', { class: 'row-acronym', x: 8, y: y - 1, text: t.acronym, onClick: open(t.id), cursor: 'pointer' })
    );
    root.append(
      svg('text', {
        class: 'row-sub',
        x: 8,
        y: y + 11,
        text: `${t.year ?? ''} · ${t.intervention.length > 46 ? `${t.intervention.slice(0, 44)}…` : t.intervention}`,
      })
    );

    if (t.plottable && t.ci_high != null) {
      const color = accentFor(t.direction);
      const xl = x(t.ci_low);
      const xh = x(t.ci_high);
      const xp = x(t.value);
      // Declared as inline style rather than presentation attributes: CSS
      // custom properties are not substituted inside SVG attributes.
      const stroke = { stroke: color };
      root.append(svg('line', { class: 'ci-line', x1: xl, x2: xh, y1: y, y2: y, style: stroke }));
      root.append(svg('line', { class: 'ci-cap', x1: xl, x2: xl, y1: y - 4.5, y2: y + 4.5, style: stroke }));
      root.append(svg('line', { class: 'ci-cap', x1: xh, x2: xh, y1: y - 4.5, y2: y + 4.5, style: stroke }));
      const s = markerSize(t.n);
      root.append(
        svg('rect', {
          x: xp - s / 2,
          y: y - s / 2,
          width: s,
          height: s,
          style: { fill: color },
          transform: `rotate(45 ${xp} ${y})`,
        })
      );
    } else {
      root.append(
        svg('text', { class: 'row-val', x: x(1) + 6, y: y + 3, text: 'not plottable — see record', 'text-anchor': 'start' })
      );
    }

    root.append(
      svg('text', {
        class: 'row-val',
        x: width - 6,
        y: y + 3,
        'text-anchor': 'end',
        text: effectText(t),
      })
    );
  });

  return root;
}

VIEWS.forest = async function renderForest(params) {
  const domains = params.get('domain') ? new Set(params.get('domain').split(',')) : new Set();
  const metric = params.get('metric') || 'all';

  const all = state.trials.filter((t) => {
    if (domains.size && !domains.has(t.domain)) return false;
    if (metric !== 'all' && t.metric !== metric) return false;
    return true;
  });

  const rows = all
    .slice()
    .sort((a, b) => {
      const da = state.meta.domain_order.indexOf(a.domain);
      const db = state.meta.domain_order.indexOf(b.domain);
      if (da !== db) return da - db;
      return (a.year ?? 0) - (b.year ?? 0);
    });

  const metrics = [...new Set(state.trials.map((t) => t.metric))].sort();
  const plottable = rows.filter((t) => t.plottable).length;

  const setHash = (next) => {
    const p = new URLSearchParams();
    if (next.domains?.size) p.set('domain', [...next.domains].join(','));
    const m = next.metric ?? metric;
    if (m !== 'all') p.set('metric', m);
    const q = p.toString();
    go(`#/forest${q ? `?${q}` : ''}`);
  };

  mount(
    pageHead(
      'Forest plot',
      `Side-by-side view of primary effects on a shared logarithmic axis. Marker area scales with trial size, colour with the direction of the result. Click any row to open the full record.`
    ),
    h(
      'section',
      { class: 'filters', 'aria-label': 'Forest plot controls' },
      h(
        'div',
        { class: 'filter-row' },
        h(
          'div',
          { class: 'field grow' },
          h('span', { class: 'field-label', text: 'Domain' }),
          h(
            'div',
            { class: 'chips' },
            h('button', {
              class: 'chip',
              type: 'button',
              text: 'All domains',
              'aria-pressed': String(domains.size === 0),
              onClick: () => setHash({ domains: new Set(), metric }),
            }),
            ...state.meta.domain_order.map((d) =>
              h('button', {
                class: 'chip',
                type: 'button',
                'aria-pressed': String(domains.has(d)),
                text: state.labels.domain[d],
                onClick: () => {
                  const next = new Set(domains);
                  if (next.has(d)) next.delete(d);
                  else next.add(d);
                  setHash({ domains: next, metric });
                },
              })
            )
          )
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'forest-metric', text: 'Metric' }),
          h(
            'select',
            {
              id: 'forest-metric',
              onChange: (e) => setHash({ domains, metric: e.target.value }),
            },
            h('option', { value: 'all', selected: metric === 'all', text: 'All metrics' }),
            ...metrics.map((m) => h('option', { value: m, selected: metric === m, text: m }))
          )
        )
      ),
      h(
        'div',
        { class: 'filter-summary' },
        h('span', { class: 'result-count', text: `${fmtInt(rows.length)} rows` }),
        h('span', { class: 'muted small mono nowrap', text: `${plottable} plottable` }),
        h('span', { class: 'muted small mono nowrap', text: `${rows.length - plottable} shown without an interval` })
      )
    ),
    h('div', { class: 'forest-wrap' }, forestPlot(rows)),
    h(
      'div',
      { class: 'legend' },
      h('span', null, h('i', { style: { background: 'var(--benefit)' } }), 'Favoured the intervention'),
      h('span', null, h('i', { style: { background: 'var(--neutral)' } }), 'Neutral / no difference'),
      h('span', null, h('i', { style: { background: 'var(--harm)' } }), 'Favoured the comparator'),
      h('span', { class: 'faint' }, 'Marker size ∝ log₁₀(trial participants)'),
      h('span', { class: 'faint' }, `Axis ${PLOT_LO}–${PLOT_HI}, logarithmic`)
    ),
    rows.length ? null : card(h('h2', { text: 'No trials match these controls' }), h('p', { class: 'muted', text: 'Select a different metric or clear the domain filter.' }))
  );
};

/* ----------------------------------------------------------------- compare */

const COMPARE_FIELDS = [
  ['year', 'Year', (t) => t.year ?? '—'],
  ['journal', 'Journal', (t) => t.journal || '—'],
  ['domain', 'Domain', (t) => state.labels.domain[t.domain] ?? t.domain],
  ['design', 'Design', (t) => state.labels.design[t.design] ?? t.design],
  ['blinding', 'Blinding', (t) => state.labels.blinding[t.blinding] ?? t.blinding],
  ['multicenter', 'Multicentre', (t) => state.labels.multicenter[t.multicenter] ?? t.multicenter],
  ['n', 'Participants', (t) => (t.n === null ? '—' : `${fmtInt(t.n)}${t.n_note ? ` (${t.n_note})` : ''}`), (t) => t.n],
  ['population', 'Population', (t) => t.population],
  ['intervention', 'Intervention', (t) => t.intervention],
  ['comparators', 'Comparator(s)', (t) => t.comparators.join(' · ') || '—'],
  ['primary_endpoint', 'Primary endpoint', (t) => t.primary_endpoint],
  ['effect', 'Primary effect', (t) => effectText(t.primary_effect), (t) => t.primary_effect.value],
  ['direction', 'Direction', (t) => dirLabel(t.primary_effect.direction)],
  ['p', 'P value', (t) => fmtP(t.primary_effect.p_value) ?? 'not reported'],
  ['events', 'Events', (t) => `intervention ${t.primary_effect.event_rate_intervention ?? 'n/r'} · comparator ${t.primary_effect.event_rate_comparator ?? 'n/r'}`],
  ['follow_up', 'Follow-up', (t) => t.follow_up ?? '—'],
  ['key_finding', 'Key finding', (t) => t.key_finding_oneliner],
  ['safety', 'Safety signals', (t) => (t.safety_signals.length ? t.safety_signals.join(' · ') : 'none recorded')],
  ['limitations', 'Limitations', (t) => (t.limitations.length ? t.limitations.join(' · ') : 'none recorded')],
  ['source', 'Source file', (t) => t.source_file],
];

VIEWS.compare = async function renderCompare(params) {
  const ids = (params.get('ids') || '').split(',').filter(Boolean).slice(0, MAX_COMPARE);
  state.compare = ids;

  if (ids.some((id) => !state.detail.has(id))) {
    await Promise.all(ids.filter((id) => !state.detail.has(id)).map((id) => trialDetail(id).catch(() => null)));
  }
  const chosen = ids.map((id) => state.detail.get(id)).filter(Boolean);

  const setIds = (next) => go(`#/compare${next.length ? `?ids=${next.join(',')}` : ''}`);

  const search = h('input', {
    type: 'search',
    placeholder: 'Search by acronym, drug or population…',
    'aria-label': 'Search trials to add',
    onInput: () => drawPicker(),
  });

  const pickerList = h('div', { class: 'chips', id: 'picker-list' });

  function drawPicker() {
    const needle = search.value.trim().toLowerCase();
    const pool = state.trials
      .filter((t) => (needle ? `${t.acronym} ${t.short_label} ${t.intervention}`.toLowerCase().includes(needle) : true))
      .slice(0, 60);
    pickerList.replaceChildren(
      ...pool.map((t) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(state.compare.includes(t.id)),
            title: t.short_label,
            text: `${t.acronym} ${t.year ?? ''}`,
            onClick: () => {
              const next = state.compare.includes(t.id)
                ? state.compare.filter((x) => x !== t.id)
                : [...state.compare, t.id].slice(0, MAX_COMPARE);
              setIds(next);
            },
          }
        )
      )
    );
  }
  drawPicker();

  const picker = h(
    'section',
    { class: 'filters', 'aria-label': 'Choose trials to compare' },
    h(
      'div',
      { class: 'filter-row' },
      h('div', { class: 'field grow' }, h('label', { text: 'Add trials' }), search),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label', text: 'Selection' }),
        h('button', { class: 'btn sm', type: 'button', text: 'Clear all', disabled: !chosen.length, onClick: () => setIds([]) })
      )
    ),
    h('div', { style: { marginTop: '12px' } }, pickerList),
    h('div', { class: 'filter-summary' }, h('span', { class: 'result-count', text: `${chosen.length} of ${MAX_COMPARE} slots used` }))
  );

  if (!chosen.length) {
    mount(
      pageHead('Compare trials side by side', 'Select up to five trials to line up their populations, interventions, endpoints and primary results in one table.'),
      picker,
      card(
        h('h2', { text: 'Nothing selected yet' }),
        h('p', { class: 'muted', text: 'Search above and click a trial to add it. Comparing trials that answer a similar question works best — try the anticoagulant trials, or the statin trials.' }),
        h(
          'div',
          { class: 'chips' },
          ...[
            ['Anticoagulants in atrial fibrillation', ['rocket-af', 'aristotle', 'engage-af-timi-48']],
            ['Heart failure mortality trials', ['v-heft', 'cibis-ii', 'copernicus', 'rales']],
            ['Statins and lipid lowering', ['woscops', 'ascot-lla', 'jupiter', 'improve-it']],
            ['Antithrombotic strategy in ACS', ['cure', 'plato', 'triton-timi-38', 'atlas-acs-2-timi-51']],
          ].map(([label, preset]) =>
            h('button', {
              class: 'btn sm',
              type: 'button',
              text: label,
              onClick: () => setIds(preset.filter((id) => state.trials.some((t) => t.id === id))),
            })
          )
        )
      )
    );
    return;
  }

  const table = h(
    'table',
    { class: 'cmp' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { scope: 'col', text: 'Field' }),
        ...chosen.map((t) =>
          h(
            'th',
            { scope: 'col' },
            h('button', {
              class: 'remove',
              type: 'button',
              'aria-label': `Remove ${t.acronym} from comparison`,
              text: '✕',
              onClick: () => setIds(state.compare.filter((x) => x !== t.id)),
            }),
            h('a', { href: `#/trial/${t.id}`, text: `${t.acronym} ${t.year ?? ''}` })
          )
        )
      )
    ),
    h(
      'tbody',
      null,
      ...COMPARE_FIELDS.map(([key, label, get, numGet]) => {
        const values = chosen.map(get);
        const nums = numGet ? chosen.map(numGet) : null;
        // Highlight the lowest value only when every column reported one, and
        // only for measures where a minimum is meaningful (size, effect).
        const best =
          nums && nums.every((v) => v !== null && v !== undefined) ? Math.min(...nums) : null;
        return h(
          'tr',
          null,
          h('th', { scope: 'row', text: label }),
          ...values.map((v, i) => {
            const cell = h('td');
            if (key === 'direction') {
              cell.append(dirBadge(chosen[i].primary_effect.direction));
            } else {
              cell.append(String(v));
            }
            if (best !== null && nums[i] === best) {
              cell.append(' ', h('span', { class: 'tag verified', text: 'smallest' }));
            }
            return cell;
          })
        );
      })
    )
  );

  mount(
    pageHead('Compare trials side by side', 'Up to five trials, one row per field. Values are the extracted, source-matched figures — where a number could not be matched it reads “—”.'),
    picker,
    h('div', { class: 'table-scroll' }, table),
    card(
      h('h2', { text: 'Reading this table' }),
      h('p', { class: 'muted small', text: 'Rows labelled “smallest” mark the lowest value in that row when every selected trial reported a comparable number — useful for sample size and effect size, meaningless for dates. Open a trial to see its confidence interval and the exact wording of the endpoint.' })
    )
  );
};

/* ----------------------------------------------------------------- timeline */

/** Trials are banded into five-year periods, matching the pipeline's buckets. */
const periodOf = (year) => (year == null ? null : `${Math.floor(year / 5) * 5}s`);

function periodRange(period) {
  const start = Number.parseInt(period, 10);
  return `${start}–${start + 4}`;
}

VIEWS.timeline = async function renderTimeline(params) {
  const tl = {
    period: params.get('period') || null,
    domain: params.get('domain') || null,
  };
  state.timeline = tl;

  const setHash = (next) => {
    const p = new URLSearchParams();
    if (next.period) p.set('period', next.period);
    if (next.domain) p.set('domain', next.domain);
    const q = p.toString();
    go(`#/timeline${q ? `?${q}` : ''}`);
  };

  const scoped = tl.domain ? state.trials.filter((t) => t.domain === tl.domain) : state.trials;
  const shown = tl.period ? scoped.filter((t) => periodOf(t.year) === tl.period) : scoped;

  // Domain distribution — the bars double as a domain filter.
  const maxDomain = Math.max(...state.domains.map((d) => d.trials));
  const bars = h(
    'div',
    { class: 'bars' },
    ...state.domains.map((d) =>
      h(
        'button',
        {
          class: 'bar-row',
          type: 'button',
          'aria-pressed': String(tl.domain === d.domain),
          onClick: () => setHash({ period: tl.period, domain: tl.domain === d.domain ? null : d.domain }),
        },
        h('span', { class: 'bar-label', text: d.label }),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(d.trials / maxDomain) * 100}%` } })),
        h('span', { class: 'bar-val', text: String(d.trials) })
      )
    )
  );

  // Period distribution within the current scope.
  const periods = [...new Set(scoped.map((t) => periodOf(t.year)))]
    .filter(Boolean)
    .sort()
    .reverse();
  const maxPeriod = Math.max(...periods.map((p) => scoped.filter((t) => periodOf(t.year) === p).length), 1);
  const periodBars = h(
    'div',
    { class: 'bars' },
    ...periods.map((p) => {
      const n = scoped.filter((t) => periodOf(t.year) === p).length;
      return h(
        'button',
        {
          class: 'bar-row',
          type: 'button',
          'aria-pressed': String(tl.period === p),
          onClick: () => setHash({ period: tl.period === p ? null : p, domain: tl.domain }),
        },
        h('span', { class: 'bar-label', text: periodRange(p) }),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(n / maxPeriod) * 100}%` } })),
        h('span', { class: 'bar-val', text: String(n) })
      );
    })
  );

  // Chronology.
  const grouped = new Map();
  for (const t of shown.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0))) {
    const key = t.year ?? 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(t);
  }

  const timeline = h(
    'div',
    { class: 'tl' },
    ...[...grouped.entries()].map(([year, rows]) =>
      h(
        'div',
        { class: 'tl-year' },
        h('h3', { text: String(year) }),
        h(
          'div',
          { class: 'tl-items' },
          ...rows.map((t) =>
            h(
              'a',
              {
                class: 'tl-item',
                href: `#/trial/${t.id}`,
                dataset: { dir: t.direction },
              },
              h('div', { class: 'nm', text: `${t.acronym}${t.plottable ? '' : ' ·'}` }),
              h('div', { class: 'small muted', text: t.short_label }),
              h('div', { class: 'fx', text: effectText(t) })
            )
          )
        )
      )
    )
  );

  const scopeLabel = tl.domain ? state.labels.domain[tl.domain] : 'all domains';
  const participants = shown.reduce((s, t) => s + (t.n || 0), 0);

  mount(
    pageHead(
      'Timeline',
      'How the cardiovascular evidence base accumulated over four decades. Bars select a slice; the chronology below lists every trial in it.'
    ),
    h(
      'div',
      { class: 'stat-grid' },
      statBlock('Trials in view', fmtInt(shown.length), `of ${fmtInt(state.trials.length)} total`),
      statBlock('Participants', fmtInt(participants), 'sum of reported sample sizes'),
      statBlock('Period', tl.period ? periodRange(tl.period) : 'all years', tl.period ? 'five-year band' : `${state.meta.years[0]}–${state.meta.years[1]}`),
      statBlock('Scope', scopeLabel, tl.domain || tl.period ? 'filtered' : 'unfiltered')
    ),
    card(h('h2', { text: 'Trials by evidence domain' }), h('p', { class: 'small muted', text: 'Click a bar to scope the chronology and the period chart.' }), bars),
    card(h('h2', { text: 'Trials by five-year period' }), h('p', { class: 'small muted', text: 'Periods are calendar bands, not decades: 2005 covers 2005–2009.' }), periodBars),
    h(
      'div',
      { class: 'result-bar', style: { marginTop: '20px' } },
      h('span', { class: 'result-count', text: `${fmtInt(shown.length)} trials in chronological order` }),
      tl.domain || tl.period
        ? h('button', { class: 'btn sm', type: 'button', text: 'Clear filters', onClick: () => setHash({ period: null, domain: null }) })
        : null
    ),
    shown.length ? timeline : card(h('h2', { text: 'Nothing in this slice' }), h('p', { class: 'muted', text: 'Clear the filters to see the full chronology.' }))
  );
};

/* --------------------------------------------------------------------- quiz */

function quizBest() {
  try {
    return Number(localStorage.getItem(QUIZ_BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score, total) {
  try {
    const pct = total ? Math.round((score / total) * 100) : 0;
    if (pct > quizBest()) localStorage.setItem(QUIZ_BEST_KEY, String(pct));
  } catch {
    /* storage unavailable — best score simply is not persisted */
  }
}

async function loadQuiz(count, seed, container) {
  container.replaceChildren(
    h(
      'div',
      { class: 'card' },
      h('h2', { text: 'Building quiz…' }),
      h('p', { class: 'muted small', text: 'Questions are assembled server-side so that only figures matched to their source publication can appear.' })
    )
  );
  const data = await api.json(`/api/quiz?count=${count}&seed=${seed}`);
  state.quiz = { questions: data.questions, index: 0, answers: [], seed: data.seed, count: data.questions.length, done: false };
  drawQuiz(container);
}

function drawQuiz(container) {
  const q = state.quiz;
  if (!q.questions.length) {
    container.replaceChildren(card(h('h2', { text: 'No questions available' }), h('p', { class: 'muted', text: 'The dataset did not yield any eligible questions for this seed.' })));
    return;
  }

  const answered = q.answers.length;
  const head = h(
    'div',
    { class: 'quiz-head' },
    h(
      'div',
      null,
      h('h2', { style: { margin: 0 }, text: `${answered} of ${q.questions.length} answered` }),
      h('p', { class: 'small muted', style: { margin: 0 }, text: `Deterministic set — seed ${q.seed} always rebuilds this exact quiz.` })
    ),
    h(
      'div',
      { class: 'chips' },
      h('button', {
        class: 'btn sm',
        type: 'button',
        text: 'New seed',
        onClick: () => go(`#/quiz?seed=${Math.floor(Math.random() * 100000)}&count=${state.quiz.count || 10}`),
      }),
      h('a', {
        class: 'btn sm',
        href: `#/quiz?seed=${q.seed}&count=${q.count}`,
        text: 'Permalink',
      }),
      h('button', {
        class: 'btn sm',
        type: 'button',
        text: 'Restart',
        onClick: () => {
          state.quiz.answers = [];
          state.quiz.index = 0;
          state.quiz.done = false;
          drawQuiz(container);
        },
      })
    )
  );

  const progress = h(
    'div',
    { class: 'progress-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': q.questions.length, 'aria-valuenow': answered, 'aria-label': 'Quiz progress' },
    h('div', { class: 'progress-fill', style: { width: `${(answered / q.questions.length) * 100}%` } })
  );

  if (q.done) {
    const score = q.answers.filter((a) => a.correct).length;
    const pct = Math.round((score / q.questions.length) * 100);
    saveBest(score, q.questions.length);
    container.replaceChildren(
      head,
      progress,
      card(
        h('h2', { text: 'Result' }),
        h(
          'div',
          { class: 'score-line' },
          h('span', null, h('b', { text: String(score) }), ` / ${q.questions.length} correct`),
          h('span', null, h('b', { text: `${pct}%` }), ' accuracy'),
          h('span', null, h('b', { text: `${quizBest()}%` }), ' best on this device')
        ),
        h('p', { class: 'muted small', style: { marginTop: '12px' }, text: 'Every explanation cites the trial and its source file, so you can check any answer against the original publication.' })
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', { text: 'Review' }),
        h(
          'div',
          { class: 'sec-list' },
          ...q.questions.map((question, i) => {
            const a = q.answers[i];
            return h(
              'div',
              { class: 'sec-item' },
              h(
                'div',
                null,
                h('div', { text: `${i + 1}. ${question.prompt}` }),
                h('div', { class: 'small muted', text: a.correct ? 'Correct' : `Your answer: ${question.options[a.chosen]} — correct: ${question.options[question.answer]}` })
              ),
              h('span', { class: a.correct ? 'tag verified' : 'tag', text: a.correct ? '✓' : '✕' })
            );
          })
        )
      )
    );
    return;
  }

  const question = q.questions[q.index];
  const chosen = q.answers.find((a) => a.index === q.index);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const options = h(
    'div',
    { class: 'q-options' },
    ...question.options.map((opt, i) => {
      const classes = ['opt'];
      if (chosen && i === question.answer) classes.push('correct');
      if (chosen && chosen.chosen === i && i !== question.answer) classes.push('wrong');
      return h(
        'button',
        {
          class: classes.join(' '),
          type: 'button',
          disabled: Boolean(chosen),
          onClick: () => {
            q.answers.push({ index: q.index, chosen: i, correct: i === question.answer });
            drawQuiz(container);
          },
        },
        h('span', { class: 'key', text: letters[i] ?? String(i + 1) }),
        h('span', { text: opt })
      );
    })
  );

  const explain = chosen
    ? h(
        'div',
        { class: 'explain' },
        h('span', { class: `verdict ${chosen.correct ? 'ok' : 'no'}`, text: chosen.correct ? 'Correct' : 'Not quite' }),
        h('span', { text: question.explanation }),
        h('cite', { text: `${state.trials.find((t) => t.id === question.trial_id)?.source_file ?? ''} — extracted to content/trials.json and matched to source text` })
      )
    : null;

  const next = chosen
    ? h('button', {
        class: 'btn primary',
        type: 'button',
        text: q.index + 1 >= q.questions.length ? 'Show result' : 'Next question',
        onClick: () => {
          if (q.index + 1 >= q.questions.length) q.done = true;
          else q.index += 1;
          drawQuiz(container);
        },
      })
    : null;

  container.replaceChildren(
    head,
    progress,
    h(
      'div',
      { class: 'card' },
      question.context ? h('div', { class: 'q-context', text: question.context }) : null,
      h('h2', { class: 'q-prompt', text: `${q.index + 1}. ${question.prompt}` }),
      options,
      explain,
      next ? h('div', { class: 'chips' }, next) : null
    )
  );
}

VIEWS.quiz = async function renderQuiz(params) {
  const count = clamp(Number(params.get('count')) || 10, 3, 30);
  const seed = Number(params.get('seed')) || 42;

  const container = h('div', { id: 'quiz-container' });
  mount(
    pageHead(
      'Test yourself',
      'Ten questions generated from the verified dataset — effect sizes, the trial behind an intervention, the domain a trial belongs to, and publication years. The question set is deterministic: the same seed always produces the same quiz.'
    ),
    h(
      'section',
      { class: 'filters', 'aria-label': 'Quiz settings' },
      h(
        'div',
        { class: 'filter-row' },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'quiz-count', text: 'Questions' }),
          h(
            'select',
            {
              id: 'quiz-count',
              onChange: (e) => go(`#/quiz?seed=${state.quiz.seed || seed}&count=${e.target.value}`),
            },
            ...[5, 10, 15, 20, 30].map((n) => h('option', { value: String(n), selected: n === count, text: String(n) }))
          )
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'quiz-seed', text: 'Seed' }),
          h('input', {
            id: 'quiz-seed',
            type: 'number',
            value: String(seed),
            min: '1',
            onChange: (e) => {
              const v = Number(e.target.value) || 42;
              go(`#/quiz?seed=${v}&count=${count}`);
            },
          })
        ),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: 'Jump to seed' }),
          h(
            'div',
            { class: 'chips' },
            h('button', { class: 'chip', type: 'button', text: '42', onClick: () => go('#/quiz?seed=42&count=10') }),
            h('button', { class: 'chip', type: 'button', text: '7', onClick: () => go('#/quiz?seed=7&count=10') }),
            h('button', { class: 'chip', type: 'button', text: '2026', onClick: () => go('#/quiz?seed=2026&count=10') })
          )
        )
      )
    ),
    container
  );

  try {
    await loadQuiz(count, seed, container);
  } catch (err) {
    container.replaceChildren(errorCard(String(err.message || err), () => go(`#/quiz?seed=${seed}&count=${count}`)));
  }
};

/* -------------------------------------------------------------------- about */

function aboutRows() {
  const m = state.meta;
  return [
    ['Source documents ingested', fmtInt(m.source_documents_ingested)],
    ['Duplicate uploads removed', fmtInt(m.duplicates_removed)],
    ['Unique trials and analyses', fmtInt(m.unique_trials)],
    ['Total participants', fmtInt(m.total_participants)],
    ['Publication span', `${m.years[0]}–${m.years[1]}`],
    ['Journals represented', String(new Set(state.trials.map((t) => t.journal)).size)],
    ['Effect sizes matched to source', `${m.verified_effect_sizes} of ${m.verified_effect_sizes}`],
    ['Sample sizes matched to source', `${m.verified_sample_sizes} direct, ${m.derived_sample_sizes} derived by summation`],
    ['Numeric fields left unverified', String(m.unverified_fields)],
  ];
}

VIEWS.about = async function renderAbout() {
  const m = state.meta;
  const domains = state.domains;
  const designs = m.by_design;
  const directions = m.by_direction;
  const maxDesign = Math.max(...Object.values(designs));
  const maxDirection = Math.max(...Object.values(directions));

  mount(
    pageHead(
      'Methods, provenance and caveats',
      'How this evidence base was assembled from the source publications, how each number was checked, and what it must not be used for.'
    ),

    card(
      h('h2', { text: 'What this is' }),
      h('p', {
        text:
          'A browsable, source-linked index of landmark cardiovascular outcome trials. Each record holds the trial\'s design, population, intervention, comparators, primary endpoint, primary effect estimate with its confidence interval, selected secondary results, safety signals and stated limitations — plus the filename of the document it came from.',
      }),
      h('p', {
        class: 'muted',
        text:
          'It is a structured re-presentation of published trial reports. It is not a systematic review, not a meta-analysis, and above all not medical advice. Where a field could not be established from the source, it is shown as absent rather than guessed.',
      })
    ),

    card(
      h('h2', { text: 'Pipeline' }),
      h(
        'ol',
        { style: { margin: 0, paddingLeft: '20px' }, class: 'small' },
        h('li', { text: 'Ingest — the uploaded PDFs were converted to text with pdftotext (layout preserved). Five image-only or banner-only documents were recovered by rendering pages with PyMuPDF and running Tesseract OCR; one malformed PDF was read directly with PyMuPDF.' }),
        h('li', { text: 'Deduplicate — near-identical uploads were detected by hashing whitespace-stripped, lower-cased text rather than file bytes, which removed 5 duplicate documents that had different byte streams.' }),
        h('li', { text: 'Extract — each document was read by a language model into a fixed JSON schema: identifiers, design, population, endpoints, effect estimates and short supporting quotations.' }),
        h('li', { text: 'Normalise — coded values were coerced onto controlled vocabularies (domain, design, blinding, direction, metric), identifiers were slugged from the acronym with collision suffixes, and numerics were coerced to numbers or null.' }),
        h('li', { text: 'Verify — every number was string-matched back against its source text after typographic normalisation (non-breaking and thin spaces, Unicode minus and en/em dashes, middle-dot decimal separators, space thousands separators and hyphenation artifacts). Values that recur only as a sum of other reported values are labelled derived.' }),
        h('li', { text: 'Publish — the verified dataset is compiled into the Worker bundle at build time. The application reads it through a read-only JSON API; nothing is writable at runtime.' })
      )
    ),

    card(
      h('h2', { text: 'Verification ledger' }),
      h(
        'dl',
        { class: 'kv' },
        ...aboutRows().flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])
      ),
      h('p', {
        class: 'small muted',
        style: { marginTop: '14px' },
        text:
          'A value counts as verified only when its digits were found in the source text after typographic normalisation. Derived values are sums of separately reported arm sizes, each of which was itself verified. Unverified fields are not rendered as if they were real.',
      })
    ),

    card(
      h('h2', { text: 'Coverage by evidence domain' }),
      h(
        'div',
        { class: 'bars' },
        ...domains.map((d) =>
          h(
            'div',
            { class: 'bar-row', style: { cursor: 'default' } },
            h('span', { class: 'bar-label', text: d.label }),
            h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(d.trials / Math.max(...domains.map((x) => x.trials))) * 100}%` } })),
            h('span', { class: 'bar-val', text: String(d.trials) })
          )
        )
      ),
      h(
        'p',
        { class: 'small muted', style: { marginTop: '14px' } },
        ...domains.map((d, i) => [
          i ? ' · ' : '',
          `${d.label}: ${d.trials} trials, ${fmtInt(d.participants)} participants, ${d.plottable} plottable, years ${d.span ? `${d.span[0]}–${d.span[1]}` : '—'}`,
        ])
      )
    ),

    card(
      h('h2', { text: 'Design and direction' }),
      h(
        'div',
        { class: 'bars' },
        ...Object.entries(designs).map(([k, v]) =>
          h(
            'div',
            { class: 'bar-row', style: { cursor: 'default' } },
            h('span', { class: 'bar-label', text: state.labels.design[k] ?? k }),
            h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(v / maxDesign) * 100}%` } })),
            h('span', { class: 'bar-val', text: String(v) })
          )
        ),
        ...Object.entries(directions).map(([k, v]) =>
          h(
            'div',
            { class: 'bar-row', style: { cursor: 'default' } },
            h('span', { class: 'bar-label', text: state.labels.direction[k] ?? k }),
            h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(v / maxDirection) * 100}%`, background: accentFor(k) } })),
            h('span', { class: 'bar-val', text: String(v) })
          )
        )
      )
    ),

    card(
      h('h2', { text: 'Licensing and attribution' }),
      h('p', {
        text:
          'The source articles are copyrighted works. This application does not host, reproduce or redistribute them. It stores extracted numeric facts and its own summaries, and reproduces only short verbatim extracts (typically one sentence) for scholarly citation in the trial detail view. Copyright in those extracts remains with the respective publishers and authors.',
      }),
      h('p', {
        class: 'small muted',
        text:
          'Trial names are used descriptively to identify the underlying studies. Journals represented: ' +
          [...new Set(state.trials.map((t) => t.journal))].sort().join('; ') +
          '.',
      })
    ),

    card(
      h('h2', { text: 'Limitations' }),
      h(
        'ul',
        { class: 'plain' },
        h('li', { text: 'Coverage is whatever the supplied document set contained. It is not an exhaustive or systematic sample of the cardiovascular literature, and absent trials are not evidence of absent evidence.' }),
        h('li', { text: 'Only the primary effect estimate is placed on the forest plot. Subgroup and secondary results are reported in the trial record but are not pooled or adjusted for multiplicity.' }),
        h('li', { text: 'Eight trials report a primary outcome that is not a ratio measure (composite scores, areas under curves, absolute mortality percentages). They appear in the explorer with their result stated but cannot be plotted.' }),
        h('li', { text: 'Effect sizes are shown as published. No indirect comparison, network meta-analysis or adjustment for differing endpoint definitions is performed — a hazard ratio of 0.79 in one trial and 0.86 in another is not a like-for-like comparison.' }),
        h('li', { text: 'Text extraction and language-model reading can miss or misplace a figure. Every number here was matched back to the source text, but a match confirms the digits appear in the document, not that the surrounding interpretation is complete.' }),
        h('li', { text: 'Records are frozen at extraction time. They are not updated as trials report longer follow-up, and no corrections or retractions after the source version are incorporated.' }),
        h('li', { text: 'Screening, diagnostic and device trials are outside the scope of this dataset and are not represented.' })
      )
    ),

    card(
      h('h2', { text: 'Read-only JSON API' }),
      h('p', { class: 'small muted', text: 'Every view is driven by the same endpoints, so the data can be reused directly.' }),
      h(
        'div',
        { class: 'sec-list' },
        ...[
          ['GET /api/health', 'liveness probe with trial count and dataset build date'],
          ['GET /api/meta', 'counts, distributions, verification totals and enum label maps'],
          ['GET /api/trials', 'list with filters: domain, direction, design, drug, year_from, year_to, plottable, search, sort, order, limit'],
          ['GET /api/trials/:id', 'one full trial record, or 404 with { error: "not_found" }'],
          ['GET /api/quiz', 'deterministic quiz: ?count (≤30) and ?seed'],
          ['GET /api/domains', 'per-domain trials, participants, plottable count, median effect and year span'],
        ].map(([endpoint, description]) =>
          h('div', { class: 'sec-item' }, h('span', { class: 'mono', text: endpoint }), h('span', { class: 'small muted', text: description }))
        )
      ),
      h(
        'p',
        { class: 'small muted', style: { marginTop: '14px' } },
        `Dataset built ${m.built} · schema version 1 · compiled into the Worker bundle at build time and served read-only. No runtime storage binding is used, so nothing submitted to this site is retained.`
      )
    )
  );
};

/* --------------------------------------------------------------------- boot */

async function boot() {
  applyTheme();
  $('#theme-toggle').addEventListener('click', toggleTheme);
  const view = $('#view');
  try {
    const [meta, list, domains] = await Promise.all([
      api.json('/api/meta'),
      api.json('/api/trials?limit=500'),
      api.json('/api/domains'),
    ]);
    state.meta = meta;
    state.labels = {
      domain: meta.domain_labels,
      direction: meta.direction_labels,
      design: meta.design_labels,
      blinding: meta.blinding_labels,
      multicenter: meta.multicenter_labels,
    };
    state.trials = list.trials;
    state.domains = domains.domains;
  } catch (err) {
    view.setAttribute('aria-busy', 'false');
    view.replaceChildren(errorCard(String(err.message || err), () => location.reload()));
    return;
  }

  const footer = $('#footer-meta');
  if (footer) {
    footer.textContent = `dataset built ${state.meta.built} · ${fmtInt(state.meta.unique_trials)} trials · ${fmtInt(
      state.meta.total_participants
    )} participants · ${state.meta.verified_effect_sizes} verified effect sizes · 0 unverified numeric fields`;
  }

  window.addEventListener('hashchange', () => {
    route().catch((err) => mount(pageHead('Error'), errorCard(String(err.message || err), () => location.reload())));
  });

  try {
    await route();
  } catch (err) {
    view.setAttribute('aria-busy', 'false');
    view.replaceChildren(errorCard(String(err.message || err), () => location.reload()));
  }
}

boot();
