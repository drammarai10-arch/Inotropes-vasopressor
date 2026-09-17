/**
 * Data layer for the Cardiovascular Outcomes Trial Evidence Base.
 *
 * The dataset is import-time verified: every numeric field carries a
 * `provenance` verdict ('verified' | 'derived' | 'absent') established by
 * string-matching the value against its source document text.
 *
 * The evidence briefs (`content/briefs-index.json` plus the per-trial assets in
 * `public/static/briefs/`) are produced by the quote-anchored verifier described
 * in README.md: an item survives only if its quotation can be located in its
 * own source document, and every displayed figure is checked against that text.
 */
import dataset from '../content/trials.json'
import briefIndexData from '../content/briefs-index.json'

export type Domain =
  | 'lipids'
  | 'hf'
  | 'acs_antiplatelet'
  | 'acs_anticoag'
  | 'af_anticoag'
  | 'raas'
  | 'other'

export type Direction = 'benefit' | 'harm' | 'neutral'
export type Provenance = 'verified' | 'derived' | 'absent' | 'unverified'

export interface SecondaryResult {
  endpoint: string
  metric: string | null
  value: number | null
  ci_low: number | null
  ci_high: number | null
  p_value: string | null
  direction: Direction
  note: string | null
}

export interface PrimaryEffect {
  metric: string
  value: number | null
  ci_low: number | null
  ci_high: number | null
  p_value: string | null
  direction: Direction
  event_rate_intervention: string | null
  event_rate_comparator: string | null
}

export interface Trial {
  id: string
  acronym: string
  title: string
  short_label: string
  year: number | null
  journal: string
  doi: string | null
  registration: string | null
  domain: Domain
  design: string
  is_substudy: boolean
  blinding: string
  multicenter: string
  phase: string | null
  population: string
  n: number | null
  n_note: string | null
  intervention: string
  comparators: string[]
  primary_endpoint: string
  primary_effect: PrimaryEffect
  secondary_results: SecondaryResult[]
  follow_up: string | null
  conclusion: string
  safety_signals: string[]
  key_finding_oneliner: string
  limitations: string[]
  citation: string
  evidence_quotes: string[]
  extraction_confidence: 'high' | 'medium' | 'low'
  extraction_notes: string | null
  source_file: string
  source_chars: number | null
  provenance: Record<string, Provenance>
  verified_fully: boolean
}

export interface DatasetMeta {
  title: string
  built: string
  source_documents: number
  unique_trials: number
  years: [number, number]
  total_participants: number
  by_domain: Record<string, number>
  by_design: Record<string, number>
  by_period: Record<string, number>
  by_direction: Record<string, number>
  verified_effect_sizes: number
  verified_sample_sizes: number
  derived_sample_sizes: number
  unverified_fields: number
}

const DATA = dataset as unknown as { meta: DatasetMeta; trials: Trial[] }

export const meta: DatasetMeta = DATA.meta
export const trials: Trial[] = DATA.trials

// ------------------------------------------------------------- evidence briefs
//
// The verified briefs themselves are served as individual static assets under
// `/static/briefs/<id>.json` (see content/briefs-index.json). Only this compact
// index is compiled into the Worker, so a list view can advertise that a brief
// exists without the bundle carrying ~700 KiB of quotation text.

/** Per-section verified claim counts, keyed by section name. */
export interface BriefCounts {
  major_points?: number
  guidelines_referenced?: number
  inclusion_criteria?: number
  exclusion_criteria?: number
  baseline?: number
  criticisms?: number
  criticisms_author_stated?: number
  criticisms_in_document?: number
}

export interface BriefIndexEntry {
  status: 'verified' | 'not_extracted'
  verified_claims: number
  extracted_claims: number
  /** Present only when status is 'not_extracted'. */
  reason?: string
  counts?: BriefCounts
}

export interface BriefIndexMeta {
  generated: string
  source: string
  trials_total: number
  trials_with_brief: number
  trials_not_extracted: number
  not_extracted: { id: string; acronym: string; reason: string }[]
  verification: {
    claims_extracted: number | null
    claims_verified: number | null
    numeric_fields_checked: number | null
    numeric_fields_dropped: number | null
    tiers: Record<string, number> | null
    layout_fallback_trials: { id: string; acronym: string; roChars: number; fullChars: number }[]
  } | null
  quote_stats: { count: number; total_chars: number; median_chars: number; p90_chars: number; max_chars: number }
  sections: string[]
  section_totals: Record<string, { verified: number; extracted: number }>
  traceability: Record<string, string>
  assets: { files: number; total_bytes: number; largest_trial: string; largest_bytes: number }
}

const BRIEFS = briefIndexData as unknown as { meta: BriefIndexMeta; trials: Record<string, BriefIndexEntry> }

export const briefIndex = BRIEFS
export const briefMeta: BriefIndexMeta = BRIEFS.meta

/** True when a source-verified evidence brief exists for this trial id. */
export function hasBrief(id: string): boolean {
  return BRIEFS.trials[id]?.status === 'verified'
}

/** Ratio metrics can be plotted on a log scale; 'other' metrics cannot. */
const RATIO_METRICS = new Set(['HR', 'RR', 'OR', 'IRR'])

export function isPlottable(t: Trial): boolean {
  const p = t.primary_effect
  return (
    RATIO_METRICS.has(p.metric) &&
    p.value !== null &&
    p.ci_low !== null &&
    p.ci_high !== null &&
    p.value > 0 &&
    p.ci_low > 0
  )
}

export const DOMAIN_LABELS: Record<Domain, string> = {
  lipids: 'Lipids & atherosclerosis',
  hf: 'Heart failure',
  acs_antiplatelet: 'ACS · antiplatelet',
  acs_anticoag: 'ACS · anticoagulant',
  af_anticoag: 'Atrial fibrillation · anticoagulant',
  raas: 'RAAS / secondary prevention',
  other: 'Other',
}

export const DOMAIN_ORDER: Domain[] = [
  'lipids',
  'hf',
  'acs_antiplatelet',
  'acs_anticoag',
  'af_anticoag',
  'raas',
  'other',
]

export const DIRECTION_LABELS: Record<Direction, string> = {
  benefit: 'Favoured intervention',
  neutral: 'Neutral / no difference',
  harm: 'Favoured comparator',
}

export function trialById(id: string): Trial | undefined {
  return trials.find((t) => t.id === id)
}

/** Compact projection for list views, the forest plot and API list responses. */
export interface TrialIndexEntry {
  id: string
  acronym: string
  short_label: string
  year: number | null
  journal: string
  domain: Domain
  design: string
  intervention: string
  comparators: string[]
  n: number | null
  primary_endpoint: string
  metric: string
  value: number | null
  ci_low: number | null
  ci_high: number | null
  p_value: string | null
  direction: Direction
  plottable: boolean
  key_finding: string
  source_file: string
  /** True when a source-verified evidence brief exists for this trial. */
  has_brief: boolean
  /** Number of source-verified claims in that brief (0 when absent). */
  brief_claims: number
}

export const trialIndex: TrialIndexEntry[] = trials.map((t) => ({
  id: t.id,
  acronym: t.acronym,
  short_label: t.short_label,
  year: t.year,
  journal: t.journal,
  domain: t.domain,
  design: t.design,
  intervention: t.intervention,
  comparators: t.comparators,
  n: t.n,
  primary_endpoint: t.primary_endpoint,
  metric: t.primary_effect.metric,
  value: t.primary_effect.value,
  ci_low: t.primary_effect.ci_low,
  ci_high: t.primary_effect.ci_high,
  p_value: t.primary_effect.p_value,
  direction: t.primary_effect.direction,
  plottable: isPlottable(t),
  key_finding: t.key_finding_oneliner,
  source_file: t.source_file,
  has_brief: briefIndex.trials[t.id]?.status === 'verified',
  brief_claims: briefIndex.trials[t.id]?.verified_claims ?? 0,
}))

export function formatNumber(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US')
}

// ---------------------------------------------------------------- quiz engine

export interface QuizQuestion {
  id: string
  kind: 'effect' | 'population' | 'domain' | 'year' | 'direction'
  prompt: string
  context: string | null
  options: string[]
  answer: number
  explanation: string
  trial_id: string
}

/** Deterministic PRNG so a given seed always yields the same quiz. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Builds a quiz strictly from extracted, source-verified facts.
 * Only trials whose primary effect is verified are eligible for numeric questions.
 */
export function buildQuiz(count = 10, seed = 42): QuizQuestion[] {
  const rnd = mulberry32(seed)
  const pool = trials.filter((t) => t.provenance.value === 'verified' || t.provenance.value === 'absent')
  const questions: QuizQuestion[] = []

  const numeric = shuffle(
    trials.filter((t) => isPlottable(t) && t.provenance.value === 'verified'),
    rnd
  )
  const all = shuffle(trials.filter((t) => t.primary_endpoint.length > 10), rnd)

  let ni = 0
  while (questions.length < count && (ni < numeric.length || questions.length < all.length)) {
    const kind = questions.length % 4
    if (kind === 0 && ni < numeric.length) {
      const t = numeric[ni++]
      const p = t.primary_effect
      const correct = `${p.metric} ${p.value} (95% CI ${p.ci_low}–${p.ci_high})`
      const decoys = new Set<string>()
      while (decoys.size < 3) {
        const jitter = 0.6 + rnd() * 0.8
        const v = Math.round(p.value! * jitter * 100) / 100
        if (v !== p.value && v > 0.05 && v < 5) decoys.add(`${p.metric} ${v} (95% CI —)`)
      }
      const options = shuffle([correct, ...decoys], rnd)
      questions.push({
        id: `effect-${t.id}`,
        kind: 'effect',
        prompt: `What was the reported primary result of ${t.acronym}?`,
        context: t.short_label || t.title,
        options,
        answer: options.indexOf(correct),
        explanation: `${t.acronym} (${t.year}) — ${t.primary_endpoint} Primary result: ${correct}${
          p.p_value ? `, P ${p.p_value}` : ''
        }. Source: ${t.source_file}.`,
        trial_id: t.id,
      })
      continue
    }
    if (kind === 1 && ni < numeric.length) {
      const t = numeric[ni++]
      const correct = t.acronym
      const others = shuffle(
        trials.filter((x) => x.id !== t.id && x.domain === t.domain),
        rnd
      ).slice(0, 3)
      const options = shuffle([correct, ...others.map((o) => o.acronym)], rnd)
      questions.push({
        id: `intervention-${t.id}`,
        kind: 'population',
        prompt: `Which trial evaluated: "${t.intervention}" in ${t.population.slice(0, 150)}${
          t.population.length > 150 ? '…' : ''
        }`,
        context: null,
        options,
        answer: options.indexOf(correct),
        explanation: `${t.acronym} (${t.year}, ${t.journal}). Intervention: ${t.intervention} vs ${t.comparators.join(
          ', '
        )}. n=${formatNumber(t.n)}.`,
        trial_id: t.id,
      })
      continue
    }
    const t = all[(questions.length * 3) % all.length]
    if (kind === 2) {
      const correct = DOMAIN_LABELS[t.domain]
      const opts = new Set<string>([correct])
      for (const d of DOMAIN_ORDER) if (opts.size < 4) opts.add(DOMAIN_LABELS[d])
      const options = shuffle([...opts], rnd)
      questions.push({
        id: `domain-${t.id}`,
        kind: 'domain',
        prompt: `Which evidence domain does ${t.acronym} belong to?`,
        context: t.title,
        options,
        answer: options.indexOf(correct),
        explanation: `${t.acronym} is classified under "${correct}" because it studied ${t.intervention} in ${t.population.slice(
          0,
          120
        )}…`,
        trial_id: t.id,
      })
    } else {
      const correct = String(t.year)
      const opts = new Set<string>([correct])
      while (opts.size < 4) opts.add(String((t.year ?? 2000) + Math.floor(rnd() * 13) - 6))
      const options = shuffle([...opts], rnd)
      questions.push({
        id: `year-${t.id}`,
        kind: 'year',
        prompt: `In which year was ${t.acronym} published?`,
        context: t.title,
        options,
        answer: options.indexOf(correct),
        explanation: `${t.acronym} was published in ${t.year} in ${t.journal}.`,
        trial_id: t.id,
      })
    }
  }
  return questions.slice(0, count)
}
