/**
 * Educational layer: glossary, concept articles and reading guides.
 *
 * This is the only authored prose in the application. Every *numeric*
 * illustration is a pointer to a real trial id in `content/trials.json` — the
 * client resolves the figures live, so a worked example can never drift from
 * the verified dataset and no number is duplicated by hand here.
 *
 * Definitions follow standard clinical-epidemiology usage (Cochrane Handbook;
 * CONSORT; FDA non-inferiority guidance). Where a term is frequently
 * misinterpreted, the entry says so explicitly rather than stating the
 * textbook definition alone.
 */

export type GlossaryCategory =
  | 'effect-measures'
  | 'uncertainty'
  | 'trial-design'
  | 'analysis-populations'
  | 'endpoints'
  | 'synthesis'

export interface GlossaryEntry {
  term: string
  /** One sentence, used verbatim in inline tooltips. */
  short: string
  /** Full explanation for the Learn view. */
  long: string
  category: GlossaryCategory
  /** Common misreading, stated plainly. Omitted when there is no trap. */
  misconception?: string
  see_also?: string[]
}

export const GLOSSARY_CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  'effect-measures': 'Effect measures',
  uncertainty: 'Uncertainty & inference',
  'trial-design': 'Trial design',
  'analysis-populations': 'Analysis populations',
  endpoints: 'Endpoints',
  synthesis: 'Evidence synthesis',
}

export const GLOSSARY: GlossaryEntry[] = [
  // --------------------------------------------------------- effect measures
  {
    term: 'Hazard ratio',
    short:
      'A ratio of instantaneous event rates over time; below 1 favours the intervention.',
    long:
      'A hazard ratio compares the instantaneous risk of the event at any given moment between two groups, averaged over the follow-up period. It is the natural effect measure for time-to-event outcomes because it accounts for the fact that people who have not yet had an event are the only ones still at risk when it is estimated. Values below 1 mean the intervention group had a lower hazard of the event; values above 1 mean a higher hazard.',
    category: 'effect-measures',
    misconception:
      'A hazard ratio is not a risk ratio. It is a ratio of hazards, averaged over follow-up, and it does not tell you how many people avoided an event. When the event is common, a hazard ratio of 0.75 can correspond to a much smaller or larger reduction in the proportion of people affected.',
    see_also: ['Risk ratio', 'Confidence interval', 'Kaplan–Meier estimate'],
  },
  {
    term: 'Risk ratio',
    short:
      'The proportion with the event in one group divided by the proportion in the other.',
    long:
      'Also called relative risk. It divides the proportion of people who experienced the event in the intervention group by the proportion in the comparator group. Unlike a hazard ratio it refers to the whole follow-up period and to cumulative incidence, so it is directly interpretable as a comparison of observed proportions.',
    category: 'effect-measures',
    misconception:
      'Only comparable across trials with the same follow-up duration and the same baseline risk. Two risk ratios of 0.8 drawn from a 5% and a 30% baseline risk imply very different numbers of people helped.',
    see_also: ['Hazard ratio', 'Absolute risk reduction'],
  },
  {
    term: 'Odds ratio',
    short:
      'The odds of the event in one group divided by the odds in the other; diverges from risk ratios when events are common.',
    long:
      'The odds of an event are the probability it happens divided by the probability it does not. An odds ratio is the ratio of those odds between groups. It is the native output of logistic regression, but it is a poor stand-in for a risk ratio when the outcome is common: if 40% of a comparator group has an event, an odds ratio of 0.5 corresponds to a risk ratio nearer 0.65.',
    category: 'effect-measures',
    misconception:
      'Odds ratios are frequently read as risk ratios. The difference is negligible when events are rare (roughly under 10%) and substantial when they are not.',
    see_also: ['Risk ratio'],
  },
  {
    term: 'Relative risk reduction',
    short:
      'The proportional fall in the event rate: 1 minus the ratio measure, expressed as a percentage.',
    long:
      'A relative risk reduction restates a ratio measure as a percentage change. A risk ratio of 0.69 is a relative risk reduction of 31%. It describes proportional change only, and always needs the underlying event rates to be interpretable: a large relative reduction on a rare event can still mean very few events prevented.',
    category: 'effect-measures',
    misconception:
      'The most reliably overstated number in clinical reporting. A “31% risk reduction” from a baseline of 2% saves about one person in 150, and the confidence interval can cross zero even when the trial is conventionally positive.',
    see_also: ['Absolute risk reduction', 'Number needed to treat'],
  },
  {
    term: 'Absolute risk reduction',
    short:
      'The arithmetic difference in event rates between groups, in percentage points.',
    long:
      'If 7.9% of the comparator group and 5.5% of the intervention group have an event, the absolute risk reduction is 2.4 percentage points. This is the figure that tells you how much difference the treatment made to how many people, and it is the basis of both the number needed to treat and any claim about magnitude.',
    category: 'effect-measures',
    see_also: ['Relative risk reduction', 'Number needed to treat'],
  },
  {
    term: 'Number needed to treat',
    short:
      'One divided by the absolute risk reduction: how many people must be treated to prevent one event.',
    long:
      'The reciprocal of the absolute risk reduction. An absolute risk reduction of 2.4 percentage points gives a number needed to treat of about 42 for the follow-up period studied. It is one of the most intuitive ways to express benefit, and it is always tied to a specific duration — extending follow-up usually lowers it.',
    category: 'effect-measures',
    misconception:
      'A number needed to treat is meaningless without its time frame and its outcome. “Number needed to treat of 42” invites the question: 42 people treated for how long, to prevent what?',
    see_also: ['Absolute risk reduction'],
  },
  {
    term: 'Event rate',
    short:
      'How often the outcome occurred, in the intervention and comparator arms separately.',
    long:
      'The observed frequency of the outcome in each arm. Trials report it as a proportion of participants, as events per 100 person-years, or as a rate per year. Baseline event rate is what converts relative effects into absolute ones, and it is why two trials reporting the same hazard ratio can mean very different things clinically.',
    category: 'effect-measures',
    see_also: ['Absolute risk reduction', 'Person-years'],
  },

  // ------------------------------------------------------------- uncertainty
  {
    term: 'Confidence interval',
    short:
      'A range that expresses how precisely an effect was estimated; narrower means more precise.',
    long:
      'A 95% confidence interval is the range of effect sizes compatible with the observed data under the study’s assumptions. Its width is the honest measure of how much the trial actually knows. For ratio measures, an interval that does not include 1.0 corresponds to conventional statistical significance at the 0.05 level; an interval that includes 1.0 means the data do not exclude no effect.',
    category: 'uncertainty',
    misconception:
      'It is not a range with a 95% probability of containing the true value given this specific result. The correct reading is about the method: intervals built this way cover the true value in 95% of hypothetical repetitions.',
    see_also: ['P value', 'Statistical power'],
  },
  {
    term: 'P value',
    short:
      'The probability of data at least this extreme if there were truly no effect.',
    long:
      'A p value answers one narrow question: assuming the intervention truly does nothing, how surprising are these results? It is not the probability that the intervention works, not the size of the effect, and not a measure of importance. The confidence interval carries the same information about compatibility plus a statement about magnitude and precision.',
    category: 'uncertainty',
    misconception:
      'P = 0.04 and P = 0.001 invite very different rhetoric but, for the same effect size, say nothing different about how large the benefit is. Nor does crossing a 0.05 threshold make a result real or unreal — thresholds are conventions, and a trial designed around one is designed to produce them.',
    see_also: ['Confidence interval', 'Statistical power', 'Statistical significance'],
  },
  {
    term: 'Statistical power',
    short:
      'The probability a trial would detect a real effect of a given size.',
    long:
      'Power is set in advance from an assumed effect size, the event rate and the sample size. Conventionally 80% or 90%. A trial that is underpowered for the effect it hoped to detect will tend to produce wide confidence intervals and a non-significant p value even when a real effect exists, which is why “no significant difference” is not “no difference”.',
    category: 'uncertainty',
    misconception:
      'A neutral result from a small trial is weak evidence of similarity. Absence of evidence is not evidence of absence; the interval is usually wide enough to contain a clinically important benefit.',
    see_also: ['Statistical significance', 'Confidence interval', 'Non-inferiority margin'],
  },
  {
    term: 'Statistical significance',
    short:
      'Conventionally, a confidence interval excluding the null value (ratio 1.0, or difference 0).',
    long:
      'A dichotomised summary that the data are unlikely under the null hypothesis at a pre-specified threshold, conventionally 0.05. It is a statement about compatibility with the null, not about clinical importance — a trivial effect becomes significant in a large enough trial, and an important one can miss significance in a small one.',
    category: 'uncertainty',
    see_also: ['P value', 'Statistical power'],
  },
  {
    term: 'Null value',
    short:
      'The value meaning “no effect”: 1.0 for ratio measures, 0 for differences.',
    long:
      'The reference point against which an effect and its interval are judged. On the forest plot in this application the null value for every ratio measure is drawn as a dashed vertical line at 1.00, and intervals crossing it are those that do not exclude no effect.',
    category: 'uncertainty',
    see_also: ['Confidence interval'],
  },
  {
    term: 'Person-years',
    short:
      'Total time participants were followed, used to express event rates per unit time.',
    long:
      'The sum of follow-up time contributed by all participants, typically reported per 100 person-years. It allows fair comparison between groups followed for different lengths of time and is the denominator behind incidence rates and rate ratios.',
    category: 'uncertainty',
    see_also: ['Event rate'],
  },

  // ------------------------------------------------------------ trial design
  {
    term: 'Randomised controlled trial',
    short:
      'Participants are allocated to groups by chance, which balances known and unknown confounders.',
    long:
      'The defining feature is that allocation is determined by an unpredictable mechanism. Randomisation is what allows the groups to be compared as though they differed only in the treatment received, because it balances both measured and unmeasured characteristics. It is the reason randomised evidence sits near the top of the evidence hierarchy.',
    category: 'trial-design',
    see_also: ['Allocation concealment', 'Blinding', 'Intention-to-treat'],
  },
  {
    term: 'Allocation concealment',
    short:
      'Hiding the upcoming allocation from the person enrolling a participant.',
    long:
      'Distinct from blinding. Concealment protects the randomisation sequence from being subverted at the moment of enrolment — if an investigator can predict what is next, they can steer particular patients into a preferred arm, and the benefit of randomisation is lost before the first dose.',
    category: 'trial-design',
    misconception:
      'Reported far less often than it should be, and frequently confused with blinding in trial write-ups. A trial can be well concealed and open-label, or blinded and poorly concealed.',
    see_also: ['Randomised controlled trial', 'Blinding'],
  },
  {
    term: 'Blinding',
    short:
      'Concealing treatment assignment from participants, clinicians, assessors, or all three.',
    long:
      'Blinding prevents knowledge of the assignment from influencing behaviour, co-interventions, or the reporting and adjudication of outcomes. Double-blind means participants and investigators are both unaware. An open-label trial can still be robust if the outcome is objective and adjudicated — mortality, for instance, is less susceptible to bias than a subjective symptom score.',
    category: 'trial-design',
    misconception:
      'Open-label is not automatically a fatal flaw, and “double-blind” is not automatically adequate. What matters is who was blinded and how susceptible the outcome is to judgement.',
    see_also: ['Allocation concealment', 'Composite endpoint'],
  },
  {
    term: 'Superiority trial',
    short:
      'A trial designed to test whether one treatment is better than another.',
    long:
      'The conventional design. The null hypothesis is no difference, and the trial aims to show a difference large enough that chance is an implausible explanation, reported as a p value and a confidence interval against the null value.',
    category: 'trial-design',
    see_also: ['Non-inferiority trial', 'Confidence interval'],
  },
  {
    term: 'Non-inferiority trial',
    short:
      'A trial testing whether a new treatment is not unacceptably worse than the established one.',
    long:
      'Appropriate when the existing treatment has a proven benefit that it would be unethical to withhold, and the new option offers some other advantage — fewer bleeds, once-daily dosing, lower cost. The trial specifies in advance a non-inferiority margin: the largest loss of benefit considered acceptable. The result is reported as non-inferiority if the confidence interval excludes that margin.',
    category: 'trial-design',
    misconception:
      'A non-inferiority trial cannot show superiority. “Non-inferior” is not a synonym for “equally good”, and the margin is a value judgement made before the data exist. If the trial also loses more patients to follow-up than the margin accounts for, the conclusion is fragile.',
    see_also: ['Non-inferiority margin', 'Per-protocol analysis', 'Superiority trial'],
  },
  {
    term: 'Non-inferiority margin',
    short:
      'The pre-specified amount of benefit a new treatment is allowed to lose and still be called acceptable.',
    long:
      'Usually derived from the historical evidence for the active control: a fraction of the benefit the control showed against placebo. It is a clinical and regulatory judgement, fixed before enrolment. A generous margin makes non-inferiority easier to declare, which is why the margin deserves as much scrutiny as the result.',
    category: 'trial-design',
    see_also: ['Non-inferiority trial'],
  },
  {
    term: 'Crossover and sequential designs',
    short:
      'Participants receive more than one treatment, or are judged against pre-set stopping rules.',
    long:
      'In a crossover trial each participant receives both interventions in sequence, so each acts as their own control — efficient for stable chronic conditions. Sequential designs evaluate accumulating data against pre-specified stopping boundaries, allowing early termination for clear benefit, clear harm or futility. Both change how results must be read: crossover designs need a washout and struggle when the condition evolves, and trials stopped early for benefit tend to overstate the effect.',
    category: 'trial-design',
    see_also: ['Statistical power', 'Intention-to-treat'],
  },

  // --------------------------------------------------- analysis populations
  {
    term: 'Intention-to-treat',
    short:
      'All randomised participants are analysed in the group they were assigned to, regardless of what they received.',
    long:
      'The conservative default. It preserves the benefit of randomisation, because anyone switched, non-adherent or lost is still counted where they were allocated. It tends to dilute the apparent effect of actually taking a treatment, so it answers the pragmatic question: does offering this strategy work?',
    category: 'analysis-populations',
    see_also: ['Per-protocol analysis', 'As-treated analysis'],
  },
  {
    term: 'Per-protocol analysis',
    short:
      'Only participants who adhered to the assigned regimen are analysed.',
    long:
      'Estimates the effect in people who actually took the treatment as intended. It answers a narrower question than intention-to-treat, and it breaks randomisation: adherent people differ from non-adherent people, so the groups may no longer be comparable. In non-inferiority trials both analyses are expected, because a treatment that performs poorly and is stopped early can look non-inferior in an intention-to-treat analysis.',
    category: 'analysis-populations',
    misconception:
      'Per-protocol is not automatically the more truthful analysis. It corrects for non-adherence and simultaneously introduces selection bias — the two effects do not cancel.',
    see_also: ['Intention-to-treat', 'Non-inferiority trial'],
  },
  {
    term: 'As-treated analysis',
    short:
      'Participants are grouped by the treatment they actually received rather than the one they were assigned.',
    long:
      'The weakest of the three common approaches for causal inference, because the grouping itself is influenced by prognosis — a patient whose condition worsens may be switched off a drug, which links the treatment group to outcome by design.',
    category: 'analysis-populations',
    see_also: ['Intention-to-treat', 'Per-protocol analysis'],
  },
  {
    term: 'Subgroup analysis',
    short:
      'Repeating the main analysis within a defined subset of participants.',
    long:
      'Useful for generating hypotheses about who benefits most, and routinely overinterpreted. A single trial is rarely powered to detect an interaction, so the correct comparison is between subgroups — asking whether the effect differs between them — not whether one subgroup reached significance and another did not. Pre-specified subgroups in large trials carry more weight than post-hoc ones.',
    category: 'analysis-populations',
    misconception:
      '“The benefit was significant in subgroup A but not subgroup B” is not evidence that the treatment works only in A. It is usually a difference in precision, not a difference in effect.',
    see_also: ['Statistical power', 'Multiplicity'],
  },
  {
    term: 'Multiplicity',
    short:
      'The inflation of false-positive risk when many comparisons are made.',
    long:
      'Testing many endpoints, subgroups or time points without adjustment means some will appear significant by chance alone. Roughly one in twenty independent comparisons will cross a 0.05 threshold under the null. Trials address this with a pre-specified hierarchy of endpoints, alpha spending across interim analyses, or explicit adjustment. It is why a secondary result with no adjustment should be treated as a signal, not a finding.',
    category: 'analysis-populations',
    see_also: ['Subgroup analysis', 'P value'],
  },
  {
    term: 'Loss to follow-up',
    short:
      'Participants whose outcome is unknown, which weakens even a well-designed analysis.',
    long:
      'Attrition that is related to outcome — people who leave because they feel worse, or better — biases the result no matter which analysis population is used. The convention is that the risk of bias becomes substantial when losses exceed the difference in event rates between arms, and non-inferiority conclusions are especially sensitive to it.',
    category: 'analysis-populations',
    see_also: ['Intention-to-treat', 'Non-inferiority trial'],
  },

  // ---------------------------------------------------------------- endpoints
  {
    term: 'Primary endpoint',
    short:
      'The single outcome the trial was designed and powered to answer.',
    long:
      'Pre-specified in the protocol, it determines the sample size and is the basis of the main conclusion. Everything else is secondary or exploratory. When a trial’s headline is not its pre-specified primary endpoint, that is worth noticing.',
    category: 'endpoints',
    see_also: ['Composite endpoint', 'Statistical power'],
  },
  {
    term: 'Composite endpoint',
    short:
      'A single outcome made of several events, counted as one when any occurs.',
    long:
      'Combines events such as cardiovascular death, myocardial infarction and stroke to raise the event count and so increase power without enlarging the trial. It answers the question “did the treatment reduce the first of these events?”. It does not establish that every component was reduced, and a composite can be driven by its least important member.',
    category: 'endpoints',
    misconception:
      'A benefit in the composite does not transfer to each component. Trials frequently show a clear composite effect with no significant effect on mortality, and the direction of components can differ. When components are combined with an ascending severity scale (death and hospitalisation together), a measured benefit may be driven entirely by hospitalisation.',
    see_also: ['Primary endpoint', 'Statistical power', 'Blinding'],
  },
  {
    term: 'Surrogate endpoint',
    short:
      'A laboratory or imaging measure substituted for a clinical outcome.',
    long:
      'Examples include LDL cholesterol, blood pressure or ejection fraction. They make trials smaller and faster, and they have repeatedly misled: a treatment can improve the surrogate while doing nothing for, or worsening, outcomes that matter to patients. Surrogate effects establish plausibility, not patient benefit.',
    category: 'endpoints',
    see_also: ['Primary endpoint'],
  },
  {
    term: 'Adjudicated outcome',
    short:
      'An event whose classification is confirmed by an independent committee blinded to treatment.',
    long:
      'Central adjudication reduces misclassification of endpoints and guards against awareness of treatment altering how events are recorded. It matters most where the outcome requires interpretation — the type of stroke, or whether a death was cardiovascular.',
    category: 'endpoints',
    see_also: ['Blinding'],
  },
  {
    term: 'Kaplan–Meier estimate',
    short:
      'The standard way to plot the proportion event-free over time, accounting for varying follow-up.',
    long:
      'A step function estimating survival or event-free probability at each observed event time, using only participants still under observation at that point. Because it handles people who leave the study early, it is the standard companion to a hazard ratio, and it makes the assumption of proportional hazards visible when curves separate late or cross.',
    category: 'endpoints',
    see_also: ['Hazard ratio', 'Proportional hazards'],
  },
  {
    term: 'Proportional hazards',
    short:
      'The assumption that the ratio of hazards stays constant over time, required by a hazard ratio.',
    long:
      'A hazard ratio is a single-number summary only if the two hazard curves are proportional throughout follow-up. If the curves cross, or the effect grows or fades over time, that number averages the changes and can describe no period accurately. Curve separation patterns are the quickest visual check, and a p value for the primary result does not test this assumption.',
    category: 'endpoints',
    misconception:
      'A significant hazard ratio does not validate proportional hazards. A trial can report a robust p value while its survival curves visibly cross.',
    see_also: ['Hazard ratio', 'Kaplan–Meier estimate'],
  },

  // ---------------------------------------------------------------- synthesis
  {
    term: 'Meta-analysis',
    short:
      'A statistical combination of results from several studies into one estimate.',
    long:
      'Pools the effect estimates of compatible studies to increase precision and explore consistency. Its credibility depends on how studies were found and whether they were truly comparable. Combining studies that measured different endpoints or populations in an unstratified pool can manufacture precision that no single study possessed.',
    category: 'synthesis',
    see_also: ['Heterogeneity', 'Pooled analysis'],
  },
  {
    term: 'Pooled analysis',
    short:
      'Individual participant data from several trials combined into a single re-analysis.',
    long:
      'Distinct from meta-analysis, which usually combines published summary statistics. A pooled analysis re-analyses participant-level data from multiple trials with a common protocol, letting the investigators harmonise endpoint definitions, adjust for the same covariates throughout and perform consistent subgroup analyses. It is generally more informative than a literature meta-analysis and generally more costly to assemble.',
    category: 'synthesis',
    see_also: ['Meta-analysis', 'Heterogeneity'],
  },
  {
    term: 'Heterogeneity',
    short:
      'How much the results of the combined studies differ from each other beyond chance.',
    long:
      'Reported as I² or tau² in a meta-analysis. Low heterogeneity means the studies broadly agree and a single summary is meaningful; high heterogeneity means they do not, and the summary may be averaging over genuinely different situations. A high I² is a reason to subgroup or to decline to pool, not a reason to weight the studies differently until it falls.',
    category: 'synthesis',
    see_also: ['Meta-analysis', 'Subgroup analysis'],
  },
  {
    term: 'Publication bias',
    short:
      'The tendency for positive results to be published and negative ones not to be.',
    long:
      'Because a complete evidence base must contain the trials that found nothing, and those are the least likely to appear, a set of published trials overstates effects on average. An evidence base assembled from published literature — including this one — inherits that limitation, which is one reason it must not be read as a pooled estimate.',
    category: 'synthesis',
    see_also: ['Meta-analysis'],
  },
  {
    term: 'Generalizability',
    short:
      'Whether a result applies beyond the participants actually studied.',
    long:
      'Every trial has entry criteria, and the people excluded are often those at highest risk or with the most comorbidity. A result is robust in the population studied and informative — but not proven — outside it. Reading the enrolment criteria is the only way to judge how far a result travels.',
    category: 'synthesis',
    misconception:
      'A large sample size does not broaden eligibility. An enormous trial of a narrowly defined population still supports conclusions about that population.',
    see_also: ['Randomised controlled trial'],
  },
]

// ------------------------------------------------------------------ concepts

export interface ConceptExample {
  /** Real trial id in content/trials.json; the client resolves the figures. */
  trial_id: string
  /** What this example is being used to show. */
  point: string
}

export interface Concept {
  id: string
  title: string
  summary: string
  reading_minutes: number
  /** Ordered sections; `body` is authored prose, `glossary` links out. */
  sections: { heading: string; body: string[] }[]
  takeaway: string
  examples: ConceptExample[]
  glossary: string[]
}

export const CONCEPTS: Concept[] = [
  {
    id: 'reading-a-hazard-ratio',
    title: 'How to read a hazard ratio',
    summary:
      'Hazard ratios are the most common result in cardiovascular trials and the most commonly misread. What the number does and does not say.',
    reading_minutes: 4,
    sections: [
      {
        heading: 'What the number is',
        body: [
          'Every time-to-event trial reports a hazard ratio alongside a confidence interval. The hazard ratio compares the instantaneous rate at which events occur in the intervention group with the rate in the comparator group, at every moment during follow-up.',
          'A hazard ratio of 0.79 means that at any given moment, a person on the intervention had about 79% of the risk of the event compared with a person on the comparator. Values below 1.00 favour the intervention; values above 1.00 favour the comparator.',
        ],
      },
      {
        heading: 'It is not a proportion of people',
        body: [
          'The most persistent misreading is to treat the hazard ratio as a percentage of participants who avoided an event. It is not. The hazard ratio weights every event by when it happened, and the only way to know what it means for people is to look at the event rates in each arm.',
          'This is why the trial records in this application always carry both: the ratio measure with its interval, and the observed event rate in each group. One without the other cannot be interpreted.',
        ],
      },
      {
        heading: 'What the interval adds',
        body: [
          'The confidence interval shows how precisely the hazard ratio was estimated. An interval of 0.66 to 0.96 excludes 1.00, so the data are incompatible with no effect at the 0.05 level. An interval of 0.99 to 1.34 includes 1.00 — the trial did not exclude no effect, but equally did not exclude a meaningful benefit.',
          'The width of the interval is the honest measure of what the trial knows. A wide interval means the trial is compatible with several very different conclusions.',
        ],
      },
    ],
    takeaway:
      'A hazard ratio is a ratio of instantaneous event rates over time. Read it with the confidence interval and the event rates — never as a proportion of people who avoided the outcome.',
    examples: [
      {
        trial_id: 'jupiter',
        point:
          'A clear result: the interval sits entirely below 1.00, and the event rates in each arm show the absolute scale of the difference.',
      },
      {
        trial_id: 'dig',
        point:
          'A neutral result: the interval straddles 1.00, so the trial does not exclude no effect.',
      },
    ],
    glossary: ['Hazard ratio', 'Confidence interval', 'Event rate', 'Kaplan–Meier estimate'],
  },
  {
    id: 'relative-versus-absolute',
    title: 'Relative and absolute effects are different facts',
    summary:
      'The same trial can honestly report a 45% risk reduction and a difference of one percentage point. Both are true; only one tells you how many people were helped.',
    reading_minutes: 3,
    sections: [
      {
        heading: 'Two numbers from one dataset',
        body: [
          'A relative measure divides one group’s event rate by the other’s. An absolute measure subtracts them. Both are computed from the same two event rates, and they answer different questions: how much did the risk change proportionally, and how many people were affected.',
          'When an event is uncommon, the relative reduction can be large while the absolute reduction is small. A treatment that halves a 1% event rate prevents one event per 200 treated — a 50% relative reduction and a 0.5 percentage point absolute reduction, simultaneously.',
        ],
      },
      {
        heading: 'Why both are reported',
        body: [
          'Relative measures travel better across populations with different baseline risks, which is why they are used for sample-size calculations and across trials. Absolute measures tell you whether the difference is worth the cost, the inconvenience and the adverse effects for an individual patient.',
          'Reporting only the relative figure is the most reliable way to make a small benefit sound substantial, whether or not that is the intention. This application shows the reported measure with its interval on every card, because that is what the trials actually prespecified.',
        ],
      },
    ],
    takeaway:
      'A relative reduction describes proportional change; the absolute difference describes how many people were affected. Neither substitutes for the other, and any claim about magnitude needs the absolute figure.',
    examples: [
      {
        trial_id: 'woscops',
        point:
          'Reported as a relative risk reduction. The arm-level event counts show the same result in absolute terms.',
      },
      {
        trial_id: 'jupiter',
        point:
          'Event rates are reported per 100 person-years, so the absolute scale is visible alongside the ratio measure.',
      },
    ],
    glossary: [
      'Relative risk reduction',
      'Absolute risk reduction',
      'Number needed to treat',
      'Event rate',
    ],
  },
  {
    id: 'composite-endpoints',
    title: 'What a composite endpoint is hiding',
    summary:
      'Combining death, heart attack and hospitalisation into one outcome makes trials feasible. It also makes the headline harder to interpret.',
    reading_minutes: 4,
    sections: [
      {
        heading: 'Why composites exist',
        body: [
          'Trials need events to have power. If mortality alone occurs at 3% per year, a trial large and long enough to detect a mortality difference can be impractical. Combining several related events — cardiovascular death, myocardial infarction, stroke, hospitalisation — multiplies the event count and lets a trial of reasonable size answer a question.',
        ],
      },
      {
        heading: 'The first-event problem',
        body: [
          'A typical composite counts the first occurrence of any component. So a participant who is hospitalised and later dies is counted once, at hospitalisation. The composite therefore measures time to the first of these events, which is not the same as whether the treatment prevented death.',
          'This is the mechanism behind a familiar pattern: a clearly positive composite with no significant effect on its most serious component.',
        ],
      },
      {
        heading: 'How to read one',
        body: [
          'Read the components, not just the summary. Check whether the direction of effect is consistent across them, whether any single component carries the result, and whether the components were weighted or ranked. A composite containing events of very different severity, in which only the mildest component moved, supports a much narrower conclusion than the headline implies.',
          'This application surfaces secondary and component results in each trial record for exactly this reason.',
        ],
      },
    ],
    takeaway:
      'A benefit in a composite establishes a reduction in the first occurrence of any component. It does not establish that each component improved, and the least serious component can drive the result.',
    examples: [
      {
        trial_id: 'rocket-af',
        point:
          'A primary endpoint expressed as a composite of stroke and systemic embolism, in a non-inferiority design — worth reading together with its components.',
      },
      {
        trial_id: 'dig',
        point:
          'A neutral primary result, useful for seeing how trial records present a composite endpoint that did not separate the arms.',
      },
    ],
    glossary: ['Composite endpoint', 'Primary endpoint', 'Adjudicated outcome', 'Statistical power'],
  },
  {
    id: 'non-inferiority',
    title: 'Non-inferiority is not equivalence',
    summary:
      'When a proven treatment exists, new trials often ask whether a new option is not unacceptably worse. That is a different question from better.',
    reading_minutes: 4,
    sections: [
      {
        heading: 'The design question',
        body: [
          'Once a treatment has been shown to reduce events, withholding it in a trial becomes difficult to justify ethically. So a new option is tested against it, with the aim of showing the new treatment is not worse by more than a pre-specified margin — the amount of benefit considered acceptable to trade for whatever the new option offers.',
          'The margin is fixed before enrolment and is usually derived as a fraction of the benefit the active control demonstrated against placebo historically.',
        ],
      },
      {
        heading: 'What the result permits you to say',
        body: [
          'Non-inferiority means the confidence interval excludes the margin of unacceptable loss. It does not mean the treatments are equivalent in effect, only that the data are compatible with the new treatment preserving most of the established benefit.',
          'Crucially, a non-inferiority trial cannot conclude superiority. If the new treatment happens to look better, the design does not license that claim — it was not powered or pre-specified for it.',
        ],
      },
      {
        heading: 'Where these trials weaken',
        body: [
          'Two vulnerabilities are worth checking. First, the margin: a generous one makes non-inferiority easier to declare, and it is a judgement, not a measurement. Second, attrition: if more participants stopped the new treatment because it did not work, an intention-to-treat analysis dilutes the difference and can make an inferior treatment appear non-inferior. That is why both intention-to-treat and per-protocol analyses are expected in these trials.',
        ],
      },
    ],
    takeaway:
      'Non-inferiority claims that a treatment is not unacceptably worse than a proven comparator, judged against a pre-specified margin. It never demonstrates superiority, and its conclusion depends on how much follow-up was lost.',
    examples: [
      {
        trial_id: 'rocket-af',
        point:
          'A non-inferiority primary result, with the P value explicitly labelled as testing non-inferiority.',
      },
      {
        trial_id: 're-ly',
        point:
          'Another anticoagulant non-inferiority design — comparing the two side by side shows how consistently these endpoints are constructed.',
      },
    ],
    glossary: [
      'Non-inferiority trial',
      'Non-inferiority margin',
      'Per-protocol analysis',
      'Intention-to-treat',
      'Loss to follow-up',
    ],
  },
  {
    id: 'when-trials-disagree',
    title: 'Reading a neutral trial',
    summary:
      '“No significant difference” is one of the most misused phrases in medicine. It usually means the trial did not know, not that there is nothing to know.',
    reading_minutes: 3,
    sections: [
      {
        heading: 'What a null result establishes',
        body: [
          'When an interval includes the null value, the correct reading is that the data are compatible with no effect — and with a range of other effects. The interval describes that range. A trial reporting a risk ratio of 1.15 with an interval of 0.99 to 1.34 has not shown the treatment is harmless; it has shown the question is not settled, while leaning towards harm.',
          'The width of the interval decides how much the null result is worth. A narrow interval around 1.00 is genuine evidence of similarity. A wide interval around 1.00 carries almost no information.',
        ],
      },
      {
        heading: 'Why neutral trials are not wasted',
        body: [
          'A well-powered neutral trial is valuable: it excludes a benefit large enough to have mattered, which changes practice. An underpowered one adds little, because it was unlikely to detect the effect it sought. Distinguishing the two is a matter of reading the interval and the planned effect size, not the p value.',
        ],
      },
    ],
    takeaway:
      'A neutral result is a statement about what the data exclude. Read the confidence interval to see how much was excluded; a p value above 0.05 on its own says almost nothing.',
    examples: [
      {
        trial_id: 'dig',
        point:
          'A tight interval spanning 1.00 — the trial can exclude any large effect in either direction.',
      },
      {
        trial_id: 'affirm',
        point:
          'An interval that includes 1.00 while its point estimate sits above it, showing why “neutral” and “safe” are different conclusions.',
      },
    ],
    glossary: [
      'P value',
      'Confidence interval',
      'Statistical power',
      'Statistical significance',
      'Null value',
    ],
  },
]

// ------------------------------------------------------------- how to read

export interface ReadingStep {
  step: number
  title: string
  detail: string
}

/** The ordered walkthrough shown at the top of the Learn view. */
export const READING_GUIDE: ReadingStep[] = [
  {
    step: 1,
    title: 'Find the question',
    detail:
      'Read the population, the intervention and the comparator before the result. A number without the comparison it describes is uninterpretable.',
  },
  {
    step: 2,
    title: 'Identify the primary endpoint',
    detail:
      'Check what the trial was powered to answer. If it is a composite, note the components. A headline that is not the pre-specified primary endpoint deserves scrutiny.',
  },
  {
    step: 3,
    title: 'Read the effect with its interval',
    detail:
      'Take the ratio measure and the confidence interval together. Does the interval exclude 1.00? How wide is it? How precise is the estimate really?',
  },
  {
    step: 4,
    title: 'Convert to absolute terms',
    detail:
      'Look at the event rate in each arm. This converts a proportional change into the number of people affected, which is what a decision actually turns on.',
  },
  {
    step: 5,
    title: 'Check the design',
    detail:
      'Superiority or non-inferiority? Blinded or open-label? Intention-to-treat or per-protocol? Each changes what the result is entitled to claim.',
  },
  {
    step: 6,
    title: 'Read the limitations, then the secondary results',
    detail:
      'The authors usually name the weaknesses. Secondary and subgroup findings without adjustment are hypotheses, not conclusions.',
  },
]

export interface LearnPayload {
  glossary: GlossaryEntry[]
  glossary_categories: Record<GlossaryCategory, string>
  concepts: Concept[]
  reading_guide: ReadingStep[]
}
