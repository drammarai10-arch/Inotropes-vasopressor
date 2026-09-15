/**
 * Display labels for the controlled vocabularies used in the extraction schema.
 *
 * The pipeline coerces free-text values onto these fixed enums (see
 * pipeline/build-data.mjs). Keeping the label maps server-side means the client
 * never has to guess at a human-readable name for a coded value, and a new enum
 * member added by the pipeline cannot silently render as a raw token.
 */
export { DIRECTION_LABELS } from './data'

export const DESIGN_LABELS: Record<string, string> = {
  rct: 'Randomised controlled trial',
  pooled_analysis: 'Pooled / combined analysis',
  substudy: 'Pre-specified substudy',
  meta_analysis: 'Meta-analysis',
}

export const BLINDING_LABELS: Record<string, string> = {
  double_blind: 'Double-blind',
  open_label: 'Open-label',
  not_stated: 'Not stated',
}

export const MULTICENTER_LABELS: Record<string, string> = {
  yes: 'Multicentre',
  no: 'Single centre',
  not_stated: 'Not stated',
}
