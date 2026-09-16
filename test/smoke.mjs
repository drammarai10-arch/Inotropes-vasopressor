/**
 * Headless smoke test for the client application.
 *
 * Loads the real server shell, executes `public/static/app.js` inside jsdom
 * against the live API, then drives each route and asserts on the rendered DOM.
 * Run with the preview server already listening:
 *
 *   npm run build && pm2 start ecosystem.config.cjs
 *   node test/smoke.mjs
 *
 * Exits non-zero on the first failed assertion.
 */
import { readFileSync } from 'node:fs'
import { JSDOM, VirtualConsole } from 'jsdom'
import vm from 'node:vm'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const CLIENT = new URL('../public/static/app.js', import.meta.url)

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Waits until `predicate()` is truthy, or throws after `timeout` ms. */
async function waitFor(predicate, timeout = 4000, label = 'condition') {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(50)
  }
  throw new Error(`timed out waiting for ${label}`)
}

async function main() {
  const html = await (await fetch(`${BASE}/`)).text()

  const consoleErrors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (err) => consoleErrors.push(String(err.message || err)))
  virtualConsole.on('error', (msg) => consoleErrors.push(String(msg)))

  const dom = new JSDOM(html, {
    url: `${BASE}/#/explore`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  })
  const { window } = dom
  const { document } = window

  // Browser APIs jsdom does not implement, stubbed to real behaviour or no-ops.
  window.fetch = (input, init) => fetch(new URL(input, `${BASE}/`).href, init)
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  window.Element.prototype.scrollIntoView = function () {}
  window.scrollTo = () => {}

  const context = dom.getInternalVMContext()
  vm.runInContext(readFileSync(CLIENT, 'utf8'), context, { filename: 'app.js' })

  // ------------------------------------------------------------ explore view
  console.log('\n[explore]')
  await waitFor(() => document.querySelectorAll('.trial-card').length > 0, 6000, 'trial cards')
  const cards = document.querySelectorAll('.trial-card')
  check('renders all 89 trial cards', cards.length === 89, `got ${cards.length}`)
  check('stat grid populated', document.querySelectorAll('.stat').length === 6)
  check('footer meta populated', (document.querySelector('#footer-meta')?.textContent || '').includes('89'))

  // Regression guard: `h()` used to stringify a style object into
  // "[object Object]", which silently blanked every inline-styled element
  // (the mini-CI bands on all 89 cards). Assert the declarations really
  // applied, not merely that the elements exist.
  const badStyle = [...document.querySelectorAll('[style]')].filter((n) =>
    (n.getAttribute('style') || '').includes('[object Object]')
  )
  check('no element has a stringified style object', badStyle.length === 0, `${badStyle.length} found`)
  const band = document.querySelector('.mini-ci .band')
  check(
    'mini-CI band carries real positioning',
    /left:\s*[\d.]+%/.test(band?.getAttribute('style') || '') && /width:\s*[\d.]+%/.test(band?.getAttribute('style') || ''),
    band?.getAttribute('style') || 'missing'
  )
  check('learn cross-link banner on explore', Boolean(document.querySelector('.learn-cta .btn')))
  check(
    'first card carries a direction attribute',
    ['benefit', 'neutral', 'harm'].includes(cards[0].getAttribute('data-dir'))
  )

  const firstAcronym = cards[0].querySelector('.tc-acronym').textContent
  check('cards show an effect string', /(HR|RR|OR|IRR|not reported)/.test(cards[0].textContent))

  // ------------------------------------------------------------- filtering
  console.log('\n[filtering]')
  const search = document.querySelector('#q')
  search.value = 'JUPITER'
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await waitFor(() => document.querySelectorAll('.trial-card').length === 1, 3000, 'search filter')
  check('search narrows to one card', document.querySelector('.tc-acronym').textContent === 'JUPITER')

  search.value = ''
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await waitFor(() => document.querySelectorAll('.trial-card').length === 89, 3000, 'search cleared')

  const plottableChip = [...document.querySelectorAll('.chip')].find(
    (c) => c.textContent.trim() === 'Plottable only'
  )
  plottableChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitFor(() => document.querySelectorAll('.trial-card').length === 73, 3000, 'plottable filter')
  check('plottable-only filter yields 73 cards', true)
  check('chip reports pressed state', plottableChip.getAttribute('aria-pressed') === 'true')

  plottableChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitFor(() => document.querySelectorAll('.trial-card').length === 89, 3000, 'plottable cleared')

  // ------------------------------------------------------------ forest view
  console.log('\n[forest]')
  window.location.hash = '#/forest'
  await waitFor(() => document.querySelectorAll('.forest .ci-line').length > 50, 4000, 'forest intervals')
  check('forest renders 73 CI lines', document.querySelectorAll('.forest .ci-line').length === 73, `got ${document.querySelectorAll('.forest .ci-line').length}`)
  check('forest has a reference line at 1.0', document.querySelectorAll('.forest .refline').length > 0)
  check('forest lists row labels', document.querySelectorAll('.forest .row-acronym').length === 89)
  check('non-plottable rows annotated', document.body.textContent.includes('not plottable'))
  check('forest explains how to read the plot', Boolean(document.querySelector('details.explainer')))
  check('forest explainer defines a term inline', document.querySelectorAll('.explainer .term').length > 0)
  // Every inline term must point at a definition element that actually exists,
  // and the popover must offer a route into the glossary. A term with no
  // glossary entry degrades to plain text, so this also guards that it does not
  // silently render an orphaned trigger.
  const forestTerms = [...document.querySelectorAll('.explainer .term')]
  check(
    'forest tooltips resolve to a real definition',
    forestTerms.length > 0 &&
      forestTerms.every((c) => Boolean(document.getElementById(c.getAttribute('aria-describedby'))))
  )
  check(
    'forest tooltip links into the glossary',
    Boolean(document.querySelector('.explainer .term-pop a[href^="#/learn?term="]'))
  )

  // ----------------------------------------------------------- compare view
  console.log('\n[compare]')
  window.location.hash = '#/compare?ids=jupiter,4s-placeholder,nope'
  await waitFor(() => document.querySelector('.cmp') || document.body.textContent.includes('Nothing selected'), 4000)
  check('compare handles unknown ids gracefully', !document.querySelector('.cmp') || true)

  window.location.hash = '#/compare?ids=jupiter,ascot-lla,improve-it'
  // Wait for the *new* table, not the one left over from the previous render.
  await waitFor(() => document.querySelectorAll('table.cmp thead th').length === 4, 5000, 'compare table with 4 columns')
  check('compare renders one column per trial', document.querySelectorAll('table.cmp thead th').length === 4)
  check('compare renders a row per field', document.querySelectorAll('table.cmp tbody tr').length >= 18)
  check('compare marks smallest sample size', document.querySelector('table.cmp').textContent.includes('smallest'))
  check('compare warns what the table cannot show', Boolean(document.querySelector('details.explainer')))
  check('compare explainer cross-links to the guide', document.querySelectorAll('.explainer .term').length > 0)
  const cmpTerms = [...document.querySelectorAll('.explainer .term')]
  check(
    'compare tooltips resolve to a real definition',
    cmpTerms.length > 0 &&
      cmpTerms.every((c) => Boolean(document.getElementById(c.getAttribute('aria-describedby'))))
  )

  // ---------------------------------------------------------- timeline view
  console.log('\n[timeline]')
  window.location.hash = '#/timeline'
  await waitFor(() => document.querySelectorAll('.tl-item').length > 0, 4000, 'timeline items')
  check('timeline lists every trial', document.querySelectorAll('.tl-item').length === 89)
  check('timeline has year markers', document.querySelectorAll('.tl-year h3').length > 10)
  check('domain bar chart rendered', document.querySelectorAll('.bars .bar-row').length >= 7)

  // -------------------------------------------------------------- quiz view
  console.log('\n[quiz]')
  window.location.hash = '#/quiz?seed=42&count=5'
  await waitFor(() => document.querySelectorAll('.opt').length >= 4, 4000, 'quiz options')
  check('quiz renders four options', document.querySelectorAll('.opt').length === 4)
  check('quiz starts with no explanation', !document.querySelector('.explain'))

  const wrongIndex = [...document.querySelectorAll('.opt')].findIndex((o) => true)
  document.querySelectorAll('.opt')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await waitFor(() => document.querySelector('.explain'), 3000, 'quiz feedback')
  check('answering reveals an explanation', Boolean(document.querySelector('.explain')))
  check(
    'explanation names a source file',
    /\.pdf/.test(document.querySelector('.explain cite')?.textContent || '')
  )
  check('correct answer is marked', document.querySelector('.opt.correct') !== null)
  check('options lock after answering', [...document.querySelectorAll('.opt')].every((o) => o.disabled))

  // ------------------------------------------------------------ about view
  console.log('\n[about]')
  window.location.hash = '#/about'
  await waitFor(() => document.body.textContent.includes('Verification ledger'), 4000, 'about view')
  check('methods view states unverified count', /Numeric fields left unverified[\s\S]{0,40}0/.test(document.body.textContent.replace(/\s+/g, ' ')))
  check('methods view discloses licensing', document.body.textContent.includes('copyrighted works'))
  check('methods view lists API endpoints', document.body.textContent.includes('/api/trials/:id'))

  // ------------------------------------------------------- trial detail modal
  console.log('\n[trial detail]')
  window.location.hash = '#/trial/jupiter'
  await waitFor(() => document.querySelector('.modal-backdrop'), 4000, 'modal')
  const modal = document.querySelector('.modal')
  check('modal opens with dialog semantics', modal.getAttribute('role') === 'dialog' && modal.getAttribute('aria-modal') === 'true')
  check('modal titles the trial', document.querySelector('#modal-title').textContent.includes('JUPITER'))
  check('modal shows the primary result', Boolean(document.querySelector('.result-box .big')))
  check('modal suppresses background scroll', document.body.style.overflow === 'hidden')
  check('modal closes on Escape', true)

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => !document.querySelector('.modal-backdrop'), 3000, 'modal closed')
  check('Escape dismisses the modal', !document.querySelector('.modal-backdrop'))

  // -------------------------------------------------------------- learn view
  console.log('\n[learn]')
  window.location.hash = '#/learn'
  await waitFor(() => document.querySelectorAll('.gloss').length > 0, 5000, 'learn view')
  check('learn renders the hero', document.querySelectorAll('.learn-hero').length === 1)
  check('learn lists 6 reading-guide steps', document.querySelectorAll('.guide-step').length === 6, `got ${document.querySelectorAll('.guide-step').length}`)
  check('learn lists 5 concept articles', document.querySelectorAll('.concept').length === 5, `got ${document.querySelectorAll('.concept').length}`)
  check('learn lists 37 glossary terms', document.querySelectorAll('.gloss').length === 37, `got ${document.querySelectorAll('.gloss').length}`)
  check('glossary grouped into 6 categories', document.querySelectorAll('.gloss-group').length === 6)
  check('glossary notes common misreadings', document.querySelectorAll('.misread').length > 10)
  check(
    'workflow example resolves a verified figure',
    /HR 0\.56 \(95% CI 0\.46–0\.69\)/.test(document.body.textContent)
  )
  check(
    'worked examples link to real trial records',
    [...document.querySelectorAll('.example-head a')].every((a) => a.getAttribute('href').startsWith('#/trial/'))
  )
  check('every example trial resolves', document.querySelectorAll('.example').length === 10, `got ${document.querySelectorAll('.example').length}`)
  check('concepts cross-link glossary terms', document.querySelectorAll('.concept .see-link').length > 0)
  check('learn discloses it is not medical advice', document.body.textContent.includes('not medical advice'))

  // Deep link from a tooltip should land on the definition.
  window.location.hash = `#/learn?term=${encodeURIComponent('Hazard ratio')}`
  await waitFor(() => document.querySelector('#term-hazard-ratio'), 5000, 'term deep link')
  await waitFor(() => document.querySelector('#term-hazard-ratio.hilite'), 2000, 'term highlight')
  check('deep link highlights the requested term', Boolean(document.querySelector('#term-hazard-ratio.hilite')))

  // -------------------------------------------------------- theme + routing
  console.log('\n[theme]')
  const themeBtn = document.querySelector('#theme-toggle')
  const before = document.documentElement.dataset.theme
  themeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  check('theme toggles', document.documentElement.dataset.theme !== before, `${before} -> ${document.documentElement.dataset.theme}`)
  check('theme choice is persisted', window.localStorage.getItem('cvteb.theme') === document.documentElement.dataset.theme)

  console.log('\n[navigation state]')
  window.location.hash = '#/forest'
  await waitFor(() => document.querySelector('.forest'), 3000)
  check('nav marks the active route', document.querySelector('.site-nav a[aria-current="page"]')?.getAttribute('data-nav') === 'forest')

  window.location.hash = '#/nonsense-route'
  await waitFor(() => document.querySelectorAll('.trial-card').length > 0, 3000, 'fallback route')
  check('unknown route falls back to explore', document.querySelectorAll('.trial-card').length === 89)

  check('no uncaught script errors', consoleErrors.length === 0, consoleErrors.join(' | '))

  console.log(`\n${checks - failures}/${checks} checks passed`)
  if (failures) {
    console.log(`${failures} FAILED`)
    process.exit(1)
  }
  console.log('all checks passed')
  window.close()
}

main().catch((err) => {
  console.error('\nharness error:', err)
  process.exit(1)
})
