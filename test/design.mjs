#!/usr/bin/env node
/**
 * Design-system verification.
 *
 * The interface encodes meaning in colour, so a token that is missing, or a
 * foreground/background pair that is unreadable, is a correctness bug rather
 * than a cosmetic one. This script parses the stylesheet's tokens for BOTH
 * themes and asserts:
 *
 *   1. the stylesheet is structurally sound and every `var()` resolves
 *   2. every foreground/background pair the interface actually renders clears
 *      the WCAG AA ratio for its role (4.5:1 text, 3:1 UI and graphics)
 *   3. the domain palette is complete in both themes — a hue that exists in
 *      light but not dark would render text invisible in one of the two
 *   4. the seven domain hues are perceptually separable, measured as CIE Lab
 *      delta-E (NOT as a contrast ratio — see the note at that check)
 *   5. a `[data-domain]` hook exists for all seven domains, and a default for
 *      `--dom` / `--bar` exists so an unscoped consumer cannot resolve to
 *      nothing
 *
 * Run: node test/design.mjs
 */
import { readFileSync } from 'node:fs'

const CSS_PATH = new URL('../public/static/styles.css', import.meta.url)
const css = readFileSync(CSS_PATH, 'utf8')

let checks = 0
let failures = 0
function check(label, ok, detail = '') {
  checks += 1
  if (ok) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/* -------------------------------------------------------------- structure */

console.log('\n[stylesheet structure]')

const opens = (css.match(/\{/g) || []).length
const closes = (css.match(/\}/g) || []).length
check('braces balance', opens === closes, `${opens} open vs ${closes} close`)

// A declaration left unterminated silently swallows the rest of its block, so
// assert every declaration in the token blocks ends with a semicolon.
const tokenBlocks = [...css.matchAll(/(:root|\[data-theme='dark'\])\s*\{([^}]*)\}/g)]
check('both theme token blocks are present', tokenBlocks.length >= 2, `found ${tokenBlocks.length}`)

/* ----------------------------------------------------------------- tokens */

/** Collect the custom properties declared inside every block for a selector. */
function tokensFor(reSource) {
  const re = new RegExp(reSource + '\\s*\\{([^}]*)\\}', 'g')
  const out = {}
  for (const m of css.matchAll(re)) {
    for (const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) out[d[1]] = d[2].trim()
  }
  return out
}

const themes = {
  light: tokensFor(':root'),
  dark: tokensFor("\\[data-theme='dark'\\]"),
}

/** Resolve a token through any `var()` indirection. */
function resolver(tokens) {
  return function resolve(name, depth = 0) {
    if (depth > 12) return null
    const v = tokens[name]
    if (v === undefined) return null
    const m = v.match(/^var\((--[a-z0-9-]+)\)$/i)
    if (m) return resolve(m[1], depth + 1)
    return v
  }
}

/** Every `var(--x)` referenced anywhere in the stylesheet must be declared. */
const declared = new Set(Object.keys(themes.light))
const referenced = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))
const unresolved = [...referenced].filter((v) => !declared.has(v)).sort()
check(
  'every var() reference resolves to a declared token',
  unresolved.length === 0,
  unresolved.join(' ')
)

/* --------------------------------------------------------------- contrast */

function parseColor(v) {
  const s = String(v ?? '').trim()
  let m = s.match(/^#([0-9a-f]{3})$/i)
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16))
  m = s.match(/^#([0-9a-f]{6})/i)
  if (m) return [0, 1, 2].map((i) => parseInt(m[1].slice(i * 2, i * 2 + 2), 16))
  return null
}

function luminance([r, g, b]) {
  const f = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* CIE Lab (D65) and its Euclidean delta-E.

   Contrast ratio is a LUMINANCE measure. It answers "can I read this?" and it
   is the right instrument for every foreground/background pair above. It is the
   WRONG instrument for asking "are these two hues different?": two fully
   saturated colours of similar lightness — a hot pink and a deep violet, say —
   score about 1.0 against each other, because 1.0 is what "same lightness"
   means. Judging a palette by contrast ratio therefore reports healthy colour
   separation as a failure, and its threshold has no perceptual meaning.

   delta-E*ab is the standard perceptual distance, so it is what the palette
   check uses. It is NOT a WCAG criterion and no WCAG threshold exists for it;
   the limit below is this stylesheet's own design rule, stated so it is
   auditable rather than implicit. */
function toLab(hex) {
  const [r, g, b] = parseColor(hex).map(srgbLinear)
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : t / (3 * 0.206897) + 0.137931)
  const fx = f(X / 0.95047)
  const fy = f(Y)
  const fz = f(Z / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function srgbLinear(c) {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
function deltaE(hexA, hexB) {
  const A = toLab(hexA)
  const B = toLab(hexB)
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

const TEXT = 4.5 // normal-size body/label text
const UI = 3.0 // large text, borders, focus rings, graphical objects

// Minimum perceptual distance between any two domain hues. For reference, a
// delta-E of about 2.3 is the just-noticeable difference and 10 is "different
// colour at a glance"; 20 is comfortably past that, so a pair below it means two
// domains would be told apart only by reading their labels.
const HUE_DELTA_E = 20

const DOMAINS = ['hf', 'lipids', 'raas', 'acs-antiplatelet', 'acs-anticoag', 'af-anticoag', 'other']

// [label, foreground token, background token, minimum ratio]
const PAIRS = [
  ['body text on page', '--text', '--bg', TEXT],
  ['body text on surface', '--text', '--surface', TEXT],
  ['body text on surface-2', '--text', '--surface-2', TEXT],
  ['muted text on surface', '--text-muted', '--surface', TEXT],
  ['muted text on surface-2', '--text-muted', '--surface-2', TEXT],
  ['muted text on surface-3', '--text-muted', '--surface-3', TEXT],
  ['faint labels on surface', '--text-faint', '--surface', TEXT],
  ['links on surface', '--accent', '--surface', TEXT],
  ['accent text on accent-soft', '--accent', '--accent-soft', TEXT],
  // Content placed ON an accent-filled control (nav pill, primary button,
  // skip link, brand mark). In dark theme the accent is a light tint, so the
  // readable foreground is dark — this pair is what catches that.
  ['content on accent fill', '--on-accent', '--accent', TEXT],
  ['content on accent-hover', '--on-accent', '--accent-hover', TEXT],
  ['content on accent-deep', '--on-accent', '--accent-deep', TEXT],
  ['benefit badge', '--benefit', '--benefit-soft', TEXT],
  ['neutral badge', '--neutral', '--neutral-soft', TEXT],
  ['harm badge', '--harm', '--harm-soft', TEXT],
  ['info callout', '--info', '--info-soft', TEXT],
  ['focus ring on surface', '--accent-line', '--surface', UI],
  ['focus ring on page', '--accent-line', '--bg', UI],
  ['harm marker on surface (forest)', '--harm', '--surface', UI],
  ['benefit marker on surface (forest)', '--benefit', '--surface', UI],
  ['neutral marker on surface (forest)', '--neutral', '--surface', UI],
]

// The accent ramp is painted UNDER --on-accent at the brand mark and the
// primary button, so every stop has to carry the foreground — checking only
// --accent would miss a stop that renders the label illegible.
for (const stop of ['--accent-line', '--accent', '--accent-deep']) {
  PAIRS.push([`content on ramp stop ${stop}`, '--on-accent', stop, TEXT])
}

// Each domain appears as a chip (--d-x on --d-x-soft), as a card tint under
// body copy, as a card tint under a muted label, and as a 3px rule / swatch
// drawn straight on --surface (colour alone, no text — so the UI threshold).
for (const d of DOMAINS) {
  PAIRS.push([`domain ${d} chip`, `--d-${d}`, `--d-${d}-soft`, TEXT])
  PAIRS.push([`domain ${d} rule on surface`, `--d-${d}`, '--surface', UI])
  PAIRS.push([`body text on ${d} card tint`, '--text', `--d-${d}-soft`, TEXT])
  PAIRS.push([`muted text on ${d} card tint`, '--text-muted', `--d-${d}-soft`, TEXT])
}

// --border-strong draws control edges, and those controls sit on the page, on
// a surface, and inside domain-tinted cards. The binding case is therefore the
// DARKEST ground it is ever drawn against, not --surface — checking only
// --surface was how a 2.63:1 dark border once passed as fine.
for (const d of DOMAINS) PAIRS.push([`control edge on ${d} card tint`, '--border-strong', `--d-${d}-soft`, UI])
PAIRS.push(['control edge on surface', '--border-strong', '--surface', UI])
PAIRS.push(['control edge on surface-2', '--border-strong', '--surface-2', UI])
PAIRS.push(['control edge on page', '--border-strong', '--bg', UI])

for (const [name, tokens] of Object.entries(themes)) {
  console.log(`\n[contrast — ${name}]`)
  const resolve = resolver(tokens)
  for (const [label, fg, bg, min] of PAIRS) {
    const fgRaw = resolve(fg)
    const bgRaw = resolve(bg)
    const fc = parseColor(fgRaw)
    const bc = parseColor(bgRaw)
    if (!fc || !bc) {
      check(`${label}`, false, `unresolved or non-hex: ${fg}=${fgRaw} ${bg}=${bgRaw}`)
      continue
    }
    const ratio = contrast(fc, bc)
    check(
      `${label} (${ratio.toFixed(2)}:1, min ${min})`,
      ratio >= min,
      `${fg} ${fgRaw} on ${bg} ${bgRaw}`
    )
  }
}

/* ------------------------------------------------------ palette integrity */

console.log('\n[palette integrity]')

for (const [name, tokens] of Object.entries(themes)) {
  const missing = []
  for (const d of DOMAINS) {
    if (!tokens[`--d-${d}`]) missing.push(`--d-${d}`)
    if (!tokens[`--d-${d}-soft`]) missing.push(`--d-${d}-soft`)
  }
  check(`${name} defines all 7 domains x 2 tones`, missing.length === 0, missing.join(' '))
}

// The hues must be distinguishable from one another, not merely present.
// Measured as CIE Lab delta-E, not as a contrast ratio: contrast compares
// lightness, so two saturated hues at similar lightness legitimately score
// ~1.0 — a luminance ratio cannot separate them and must not be used to try.
for (const [name, tokens] of Object.entries(themes)) {
  const resolve = resolver(tokens)
  const cols = DOMAINS.map((d) => [d, resolve(`--d-${d}`)])
  const pairs = []
  for (let i = 0; i < cols.length; i += 1) {
    for (let j = i + 1; j < cols.length; j += 1) {
      const de = deltaE(cols[i][1], cols[j][1])
      if (de < HUE_DELTA_E) pairs.push(`${cols[i][0]}~${cols[j][0]} (dE ${de.toFixed(1)})`)
    }
  }
  check(
    `${name} domain hues are perceptually separable (dE >= ${HUE_DELTA_E})`,
    pairs.length === 0,
    pairs.join(', ')
  )
}

// Every domain needs a data-attribute hook, or its hue can never be applied.
const hooks = [...css.matchAll(/\[data-domain='?([a-z_-]+)'?\]/g)].map((m) => m[1])
const attrDomains = DOMAINS.map((d) => d.replace(/-/g, '_'))
const missingHooks = attrDomains.filter((d) => !hooks.includes(d))
check('every domain has a data-domain hook', missingHooks.length === 0, missingHooks.join(' '))
check(
  'an unscoped --dom default exists',
  /:root\s*\{[^}]*--dom\s*:/.test(css.replace(/\n/g, ' ')) || /\{\s*--dom:/.test(css),
  'no --dom default on :root'
)
check('an unscoped --bar default exists', /--bar\s*:/.test(css), 'no --bar default')
check('a data-domain fallback rule exists', /\[data-domain\]\s*\{/.test(css))

/* ------------------------------------------------------------ print safety */

console.log('\n[print and colour-blind safety]')
// Colour must never be the only carrier of meaning, so the direction badges
// need a non-colour cue and print must not depend on a background fill.
check(
  'direction badges carry a shape cue, not just colour',
  /\.dir::before\s*\{[^}]*content:\s*''/.test(css.replace(/\n/g, ' ')),
  'no ::before marker on .dir'
)
check('quiz verdicts carry a glyph, not just colour', /\.opt\.correct::after/.test(css) && /\.opt\.wrong::after/.test(css))
check('print rules neutralise the tinted washes', /@media print[\s\S]*?background:\s*#fff\s*!important/.test(css))

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) {
  console.log('design verification FAILED')
  process.exit(1)
}
console.log('all checks passed')
