import {
  getCatalogProgram,
  getSource,
  getV2QuestionCopy,
  V2_PROGRAM_IDS,
  V2_RESULT_COPY,
  DISCOVERY_OPENING,
} from "@/data";
import type { ProgramId, RealityLevel, RecordedAnswer, V2RealityAnswer, V2ScoredAnswer, V2Step } from "@/engine";
import { buildResultView, displayName, type ResultView } from "./resultView";

/**
 * V2 result view model (THI-16). Pure and framework-free, built ONLY from the engine's completed step: the recorded
 * evidence (with provenance), the ranking the engine produced, the reality-check answers and the structured copy.
 *  - recommended / near_tie / insufficient_positive_evidence: the generic result, built from the candidate's own
 *    chosen options and the programs' work-imagination statements. Deterministic templates, no runtime generation, no
 *    scores, percentages, support counts or question kinds, and no academic facts for programs still pending curation.
 *  - precision (V1 Tech): the unchanged V1 result view (`buildResultView`) over the module's own answers.
 * The engine decides fit and order; this layer only chooses and words. A near tie is shown symmetrically (catalog
 * order, never ranked order); a reality check never changes who is shown.
 */

export type V2GenericResultKind = "recommended" | "near_tie" | "insufficient_positive_evidence";

export interface DirectionView {
  programId: ProgramId;
  nameHe: string;
  qualifierHe: string | null;
  /** Name with its mandatory qualifier (DEC-015), for running text. */
  displayNameHe: string;
  /** What the candidate chose that pointed here (their own chosen options, at most three). */
  chosenHe: string[];
  /** One work-imagination statement ("a day I can imagine"), not an academic claim. */
  workStatementHe: string | null;
  /** Official program page (candidate-facing layer first), when the source registry has one. */
  programUrl: string | null;
}

export interface RealityView {
  programId: ProgramId;
  level: RealityLevel;
  headingHe: string;
  /** The realistic aspect of the work, as the check described it. */
  promptHe: string;
  /** The candidate's own answer. */
  answerHe: string;
  noteHe: string | null;
}

export interface GenericResultView {
  type: "generic";
  kind: V2GenericResultKind;
  eyebrowHe: string | null;
  headingHe: string | null;
  bodyHe: string | null;
  /** recommended: [primary, secondary?]. near_tie: both, in catalog order. insufficient: zero or one weak direction. */
  directions: DirectionView[];
  patternHe: string | null;
  mainDecision: { titleHe: string; textHe: string } | null;
  realityChecks: RealityView[];
  ctas: {
    admissionUrl: string | null;
    advisorUrl: string | null;
    advisorLabelHe: string;
  };
  disclaimerHe: string;
  /** True when at least one shown program has no curated facts: the result then carries only the candidate's choices. */
  limitedFacts: boolean;
  analytics: ResultAnalytics;
}

export interface PrecisionResultView {
  type: "precision";
  /** The V1 result view, unchanged in structure and tone. */
  view: ResultView;
  disclaimerHe: string;
  analytics: ResultAnalytics;
}

export type V2ResultView = GenericResultView | PrecisionResultView;

/** Safe metadata only (ids and counts): never text, scores or support. */
export interface ResultAnalytics {
  resultKind: V2GenericResultKind | "v1_precision_result";
  recommendedProgramId: ProgramId | null;
  alternativeProgramIds: ProgramId[];
  selectedProjectCount: number;
  scoredAnswerCount: number;
  totalAnswerCount: number;
}

export interface V2ResultOptions {
  advisorUrl?: string | null;
}

const MAX_CHOSEN = 3;
const catalogOrder = (ids: readonly ProgramId[]) =>
  [...ids].sort((a, b) => V2_PROGRAM_IDS.indexOf(a) - V2_PROGRAM_IDS.indexOf(b));

function catalog(programId: ProgramId) {
  const program = getCatalogProgram(programId);
  if (!program) throw new Error(`Unknown program "${programId}" in V2 result`);
  return program;
}

/** Candidate-facing text of what was chosen: the authored option, or the work statement of a generated focus choice. */
function chosenText(answer: V2ScoredAnswer, programId: ProgramId): string | null {
  if (answer.source.type === "generic_focus") {
    const index = Number(answer.questionId.split(":").at(-1));
    return Number.isInteger(index) ? (catalog(programId).workStatementsHe[index] ?? null) : null;
  }
  return getV2QuestionCopy(answer.questionId)?.options.find((option) => option.id === answer.answerId)?.label ?? null;
}

function officialUrl(programId: ProgramId): string | null {
  const program = catalog(programId);
  const sourceId = program.academySourceIds[0] ?? program.colmanSourceIds[0];
  return sourceId ? (getSource(sourceId)?.url ?? null) : null;
}

function direction(programId: ProgramId, evidence: readonly V2ScoredAnswer[]): DirectionView {
  const program = catalog(programId);
  const chosen = evidence
    .filter((answer) => answer.programIds.includes(programId))
    .map((answer) => ({ answer, text: chosenText(answer, programId) }))
    .filter((item): item is { answer: V2ScoredAnswer; text: string } => item.text !== null)
    // Strongest first (weight), then the order the candidate answered in.
    .sort((a, b) => b.answer.weight - a.answer.weight)
    .map((item) => item.text);
  return {
    programId,
    nameHe: program.nameHe,
    qualifierHe: program.qualifierHe,
    displayNameHe: displayName({
      id: programId,
      nameHe: program.nameHe,
      nameEn: program.nameEn,
      qualifierHe: program.qualifierHe,
    }),
    chosenHe: [...new Set(chosen)].slice(0, MAX_CHOSEN),
    workStatementHe: program.workStatementsHe[0] ?? null,
    programUrl: officialUrl(programId),
  };
}

function realityViews(realityEvidence: readonly V2RealityAnswer[], shown: readonly ProgramId[]): RealityView[] {
  const { reality } = V2_RESULT_COPY;
  const views: RealityView[] = [];
  for (const entry of realityEvidence) {
    const programId = entry.forProgramIds.find((id) => shown.includes(id));
    if (!programId) continue; // a check for a program that is not shown is never surfaced
    const copy = getV2QuestionCopy(entry.questionId);
    const answerHe = copy?.options.find((option) => option.id === entry.answerId)?.label;
    if (!copy || !answerHe) continue;
    views.push({
      programId,
      level: entry.realityLevel,
      headingHe: reality.heading[entry.realityLevel],
      promptHe: copy.prompt,
      answerHe,
      noteHe: entry.realityLevel === "negative" ? reality.negativeNote : null,
    });
  }
  return views;
}

export function buildV2ResultView(
  step: Extract<V2Step, { status: "complete" }>,
  selectedProjectIds: readonly string[],
  answers: readonly RecordedAnswer[],
  options: V2ResultOptions = {},
): V2ResultView {
  const { state } = step;
  const base = {
    selectedProjectCount: selectedProjectIds.length,
    scoredAnswerCount: state.scoredAnswerCount,
    totalAnswerCount: answers.length,
  };
  const disclaimerHe = DISCOVERY_OPENING.brandDisclaimer;
  const advisorUrl = options.advisorUrl?.trim() || null;
  const outcome = step.outcome;

  if (outcome.kind === "precision") {
    // V1 Tech keeps its own result semantics. `selected` stays empty so the V1-only "focused comparison" CTA is not
    // offered (V1 comparisons are a different flow); the V2 restart is offered instead.
    const view = buildResultView(outcome.result, state.precision?.moduleAnswers ?? [], [], { advisorUrl });
    return {
      type: "precision",
      view,
      disclaimerHe,
      analytics: {
        ...base,
        resultKind: "v1_precision_result",
        recommendedProgramId: outcome.result.bestFitProgram,
        alternativeProgramIds: outcome.result.secondaryProgram ? [outcome.result.secondaryProgram] : [],
      },
    };
  }

  const { recommended, nearTie, insufficient, mainDecision: decisionCopy } = V2_RESULT_COPY;
  const ctas = {
    admissionUrl: getSource("academy_admission_page")?.url ?? null,
    advisorUrl,
    advisorLabelHe: V2_RESULT_COPY.actions.advisor,
  };
  const supportOf = (id: ProgramId) => state.support[id] ?? 0;
  const finish = (
    view: Omit<GenericResultView, "type" | "ctas" | "disclaimerHe" | "limitedFacts" | "analytics">,
    recommendedId: ProgramId | null,
    alternatives: ProgramId[],
  ): GenericResultView => ({
    type: "generic",
    ...view,
    ctas,
    disclaimerHe,
    limitedFacts: view.directions.some((item) => catalog(item.programId).factsStatus !== "verified_v1_pilot"),
    analytics: {
      ...base,
      resultKind: outcome.kind,
      recommendedProgramId: recommendedId,
      alternativeProgramIds: alternatives,
    },
  });

  if (outcome.kind === "recommended") {
    const primary = direction(outcome.programId, state.evidence);
    // The runner-up is the best-ranked OTHER program that actually has supporting evidence (never an untested one).
    const runnerUpId = state.ranking.find((row) => row.programId !== outcome.programId && row.support > 0)?.programId;
    const runnerUp = runnerUpId ? direction(runnerUpId, state.evidence) : null;
    const support = supportOf(outcome.programId);
    return finish(
      {
        kind: "recommended",
        eyebrowHe: recommended.eyebrow,
        headingHe: null,
        bodyHe: null,
        directions: runnerUp ? [primary, runnerUp] : [primary],
        patternHe: support >= 2 ? recommended.pattern(support) : null,
        mainDecision:
          runnerUp && primary.workStatementHe && runnerUp.workStatementHe
            ? {
                titleHe: decisionCopy.title,
                textHe: decisionCopy.recommended(
                  primary.displayNameHe,
                  primary.workStatementHe,
                  runnerUp.displayNameHe,
                  runnerUp.workStatementHe,
                ),
              }
            : null,
        realityChecks: realityViews(state.realityEvidence, [primary.programId]),
      },
      outcome.programId,
      runnerUp ? [runnerUp.programId] : [],
    );
  }

  if (outcome.kind === "near_tie") {
    // Symmetric by construction: catalog display order, never the engine's ranked order.
    const [first, second] = catalogOrder(outcome.programIds).map((id) => direction(id, state.evidence));
    if (!first || !second) throw new Error("A near tie needs two programs");
    return finish(
      {
        kind: "near_tie",
        eyebrowHe: nearTie.eyebrow,
        headingHe: null,
        bodyHe: nearTie.body,
        directions: [first, second],
        patternHe: null,
        mainDecision:
          first.workStatementHe && second.workStatementHe
            ? {
                titleHe: decisionCopy.title,
                textHe: decisionCopy.nearTie(
                  first.displayNameHe,
                  first.workStatementHe,
                  second.displayNameHe,
                  second.workStatementHe,
                ),
              }
            : null,
        realityChecks: realityViews(state.realityEvidence, [first.programId, second.programId]),
      },
      null,
      [first.programId, second.programId],
    );
  }

  // insufficient_positive_evidence: never a recommendation. One weakly supported program may be offered to check.
  const weak = state.ranking.filter((row) => row.support > 0);
  const weakDirection = weak.length === 1 ? direction(weak[0]!.programId, state.evidence) : null;
  return finish(
    {
      kind: "insufficient_positive_evidence",
      eyebrowHe: null,
      headingHe: insufficient.heading,
      bodyHe: insufficient.body,
      directions: weakDirection ? [weakDirection] : [],
      patternHe: null,
      mainDecision: null,
      realityChecks: [],
    },
    null,
    weakDirection ? [weakDirection.programId] : [],
  );
}
