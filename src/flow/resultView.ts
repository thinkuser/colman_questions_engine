import {
  getProgramSummary,
  getProgramVectors,
  getSource,
  RESULT_COPY,
  type ProgramResultContent,
  type ProgramSummary,
} from "@/data";
import type { Dimension, EvidenceItem, FitResult, ProgramId, RecordedAnswer } from "@/engine";

/**
 * Result view model (THI-10): everything the result page shows, built from the engine's `FitResult`, the
 * candidate's recorded answers and the structured presentation copy. Pure and framework-free, so the three result
 * kinds are unit-testable. The engine decides fit, order and direction; this layer only chooses and words.
 * Nothing numeric from the engine (scores, contributions, thresholds) or any enum/dimension id reaches the output.
 */

export type ResultKind = "recommended" | "near_tie" | "no_strong_fit";

export interface EvidenceCard {
  /** `supports` backs the top program, `mixed` pulls the other way, `answer` is used when there is no winner. */
  kind: "supports" | "mixed" | "answer";
  text: string;
  questionId: string;
  answerId: string;
}

export interface RealityCheckView {
  id: string;
  program: ProgramSummary;
  /** What the candidate said or answered that triggered the check, in their words. */
  leadLines: string[];
  bodyHe: string;
}

export interface TradeoffView {
  axisHe: string | null;
  topSideHe: string;
  secondSideHe: string;
  /** Plain-language concepts that tilted the decision towards the top program. */
  decidedByHe: string[];
  /** One concept the candidate also showed interest in that favours the other program. */
  counterHe: string | null;
  /** Official shared-first-year note for a CS/DS decision (explanatory only, DEC-016). */
  sharedFirstYearNote: string | null;
}

export interface ResultView {
  kind: ResultKind;
  /** The top two programs. For `no_strong_fit` these are only "closer options", never a recommendation. */
  top: ProgramSummary;
  second: ProgramSummary;
  hero: { eyebrowHe: string | null; headingHe: string | null; bodyHe: string | null; fitNoteHe: string | null };
  evidence: EvidenceCard[];
  mirrorHe: string;
  tradeoff: TradeoffView | null;
  /** Content about the top program; null when there is no recommendation. */
  topContent: ProgramResultContent | null;
  realityChecks: RealityCheckView[];
  secondary: { program: ProgramSummary; positioningHe: string; whyItFitsHe: string[] };
  noFit: { alternativesHe: string; exploreHe: string } | null;
  ctas: {
    admissionUrl: string | null;
    programUrl: string | null;
    advisorUrl: string | null;
    advisorLabelHe: string;
    /** Set when a focused re-comparison of just the top two programs makes sense (three were compared). */
    compareFocused: [ProgramId, ProgramId] | null;
  };
}

export interface ResultViewOptions {
  /** Where "speak with an advisor" leads. When absent the advisor CTA is not offered (no destination invented). */
  advisorUrl?: string | null;
}

const MAX_EVIDENCE = 5;
const MIN_PAIR_VECTOR_GAP = 2;
/** Presentation-only: a contrary signal is mentioned only if it is at least this share of the strongest one. */
const MATERIAL_SHARE = 0.25;

/** Candidate-facing name with the mandatory qualifier (DEC-015), for use inside running text. */
export function displayName(program: ProgramSummary): string {
  return program.qualifierHe ? `${program.nameHe} (${program.qualifierHe})` : program.nameHe;
}

export function resultKind(result: FitResult): ResultKind {
  if (result.bestFitProgram === null) return "no_strong_fit";
  return result.nearTie ? "near_tie" : "recommended";
}

const summary = (id: ProgramId): ProgramSummary => {
  const found = getProgramSummary(id);
  if (!found) throw new Error(`Unknown program "${id}" in result`);
  return found;
};

const wording = (item: Pick<EvidenceItem, "questionId" | "answerId">): string => {
  const text = RESULT_COPY.evidence.get(`${item.questionId}/${item.answerId}`);
  if (!text) throw new Error(`No evidence wording for ${item.questionId}/${item.answerId}`);
  return text;
};

const isNeither = (item: Pick<EvidenceItem, "answerId">) => item.answerId === "neither";

/** About 3-5 grounded items: strongest support first, one contrary item where useful, never every answer. */
export function selectEvidence(result: FitResult, kind: ResultKind): EvidenceCard[] {
  const card = (item: EvidenceItem, cardKind: EvidenceCard["kind"]): EvidenceCard => ({
    kind: cardKind,
    text: wording(item),
    questionId: item.questionId,
    answerId: item.answerId,
  });
  // `result.evidence` is already ordered by decisiveness (largest |top vs second| first).
  const ordered = result.evidence;

  if (kind === "no_strong_fit") {
    const rejected = ordered.filter(isNeither);
    const others = ordered.filter((item) => !isNeither(item));
    return [...rejected.slice(0, 3), ...others.slice(0, Math.max(0, 4 - Math.min(3, rejected.length)))].map((item) =>
      card(item, "answer"),
    );
  }

  const supports = ordered.filter((item) => item.direction === "supports_top");
  const strongest = Math.max(0, ...ordered.map((item) => Math.abs(item.topVsSecond)));
  const contrary = ordered.find(
    (item) => item.direction === "supports_second" && Math.abs(item.topVsSecond) >= MATERIAL_SHARE * strongest,
  );
  const neutral = ordered.filter((item) => item.direction === "neutral" && !isNeither(item));
  const room = contrary ? MAX_EVIDENCE - 1 : MAX_EVIDENCE;
  const supportCount = Math.min(supports.length, Math.min(room, contrary ? 3 : 4));
  const picked = supports.slice(0, supportCount).map((item) => card(item, "supports"));
  // Thin support: top up with neutral answers (e.g. a math-tolerance answer) so the section is never nearly empty.
  for (const item of neutral) {
    if (picked.length >= 3) break;
    picked.push(card(item, "supports"));
  }
  if (contrary) picked.push(card(contrary, "mixed"));
  return picked;
}

interface AxisDimensions {
  decidedBy: Dimension[];
  counter: Dimension | null;
  less: Dimension | null;
}

/**
 * Which dimensions to talk about. Uses the engine's signed deltas, but only where the candidate actually leaned
 * towards the dimension (a negative candidate value would otherwise read as interest).
 */
function axisDimensions(result: FitResult): AxisDimensions {
  const vector = result.candidateVector;
  const [top, second] = result.mainDecision;
  const decidedBy = result.tradeoff.decidingDimensions
    .filter((d) => d.delta > 0 && vector[d.dimension] > 0)
    .slice(0, 2)
    .map((d) => d.dimension);
  const strongestDelta = Math.max(0, ...result.tradeoff.decidingDimensions.map((d) => Math.abs(d.delta)));
  const counter =
    [...result.tradeoff.decidingDimensions]
      .reverse()
      .find((d) => d.delta < 0 && vector[d.dimension] > 0 && -d.delta >= MATERIAL_SHARE * strongestDelta)?.dimension ??
    null;

  const vectors = getProgramVectors([top, second]);
  const less =
    (Object.keys(vectors[top]!) as Dimension[])
      .map((dimension) => ({ dimension, gap: vectors[second]![dimension] - vectors[top]![dimension] }))
      .filter(
        (d) =>
          d.gap >= MIN_PAIR_VECTOR_GAP &&
          (d.dimension === "math_affinity" ? vector[d.dimension] < 0 : vector[d.dimension] <= 0),
      )
      .sort((a, b) => b.gap - a.gap)[0]?.dimension ?? null;
  return { decidedBy, counter, less };
}

function mirrorText(result: FitResult, kind: ResultKind, axis: AxisDimensions): string {
  const { mirror, dimensions } = RESULT_COPY;
  if (kind === "no_strong_fit") return mirror.no_fit_he;
  const nouns = axis.decidedBy.map((d) => dimensions[d].nounHe);
  if (nouns.length === 0) {
    return `${mirror.lead_he} ${RESULT_COPY.program(result.mainDecision[0]).positioningHe}.`;
  }
  const lead = `${mirror.lead_he} ${nouns[0]}${nouns[1] ? ` ${mirror.and_he} ${nouns[1]}` : ""}`;
  const less = axis.less ? `, ${mirror.less_he} ${dimensions[axis.less].nounHe}` : "";
  return `${lead}${less}.`;
}

function buildTradeoff(result: FitResult, axis: AxisDimensions): TradeoffView {
  const [top, second] = result.mainDecision;
  const pair = RESULT_COPY.pairAxis(top, second);
  const sharedYear =
    [top, second].every((id) => id === "computer_science" || id === "data_science") &&
    RESULT_COPY.program(top).sharedFirstYearNote;
  return {
    axisHe: pair?.axisHe ?? null,
    topSideHe: pair?.sidesHe[top] ?? RESULT_COPY.program(top).positioningHe,
    secondSideHe: pair?.sidesHe[second] ?? RESULT_COPY.program(second).positioningHe,
    decidedByHe: axis.decidedBy.map((d) => RESULT_COPY.dimensions[d].nounHe),
    counterHe: axis.counter ? RESULT_COPY.dimensions[axis.counter].nounHe : null,
    sharedFirstYearNote: sharedYear || null,
  };
}

function buildRealityChecks(result: FitResult, answers: readonly RecordedAnswer[]): RealityCheckView[] {
  return result.realityChecks.map((check) => {
    const leadLines: string[] = [];
    for (const dimension of check.triggeredDimensions) {
      const quoted = dimension.explicitNegativeQuestionIds
        .map((questionId) => answers.find((answer) => answer.questionId === questionId))
        .filter((answer): answer is RecordedAnswer => answer !== undefined)
        .map(wording);
      const lines = quoted.length > 0 ? quoted : [RESULT_COPY.dimensions[dimension.dimension].lowSignalHe];
      for (const line of lines) if (!leadLines.includes(line)) leadLines.push(line);
    }
    const bodyHe = RESULT_COPY.program(check.programId).realityCheckBodyHe[check.id];
    if (!bodyHe) throw new Error(`No wording for reality check "${check.id}"`);
    return { id: check.id, program: summary(check.programId), leadLines, bodyHe };
  });
}

export function buildResultView(
  result: FitResult,
  answers: readonly RecordedAnswer[],
  selectedProgramIds: readonly ProgramId[],
  options: ResultViewOptions = {},
): ResultView {
  const kind = resultKind(result);
  const [topId, secondId] = result.mainDecision;
  const top = summary(topId);
  const second = summary(secondId);
  const { states } = RESULT_COPY;
  const axis = axisDimensions(result);
  const evidence = selectEvidence(result, kind);
  const fitNote =
    kind === "recommended" && result.fitClassification !== "no_strong_fit"
      ? states.recommended.fit_notes_he[result.fitClassification]
      : null;

  const hero: ResultView["hero"] =
    kind === "no_strong_fit"
      ? {
          eyebrowHe: null,
          headingHe: states.no_strong_fit.heading_he,
          bodyHe: states.no_strong_fit.body_he,
          fitNoteHe: null,
        }
      : kind === "near_tie"
        ? {
            eyebrowHe: states.near_tie.eyebrow_he,
            headingHe: states.near_tie.heading_he,
            bodyHe: states.near_tie.body_he,
            fitNoteHe: null,
          }
        : { eyebrowHe: states.recommended.eyebrow_he, headingHe: null, bodyHe: null, fitNoteHe: fitNote };

  const contraryTexts = evidence.filter((item) => item.kind === "mixed").map((item) => item.text);
  const advisorLabelHe = `אני רוצה לשוחח עם יועץ על ${displayName(top)} מול ${displayName(second)}`;

  return {
    kind,
    top,
    second,
    hero,
    evidence,
    mirrorHe: mirrorText(result, kind, axis),
    tradeoff: kind === "no_strong_fit" ? null : buildTradeoff(result, axis),
    topContent: kind === "no_strong_fit" ? null : RESULT_COPY.program(topId),
    realityChecks: buildRealityChecks(result, answers),
    secondary: {
      program: second,
      positioningHe: RESULT_COPY.program(secondId).positioningHe,
      whyItFitsHe: contraryTexts,
    },
    noFit:
      kind === "no_strong_fit"
        ? { alternativesHe: states.no_strong_fit.alternatives_he, exploreHe: states.no_strong_fit.explore_he }
        : null,
    ctas: {
      admissionUrl: getSource("academy_admission_page")?.url ?? null,
      programUrl: kind === "no_strong_fit" ? null : RESULT_COPY.program(topId).officialUrl,
      advisorUrl: options.advisorUrl?.trim() || null,
      advisorLabelHe,
      compareFocused: selectedProgramIds.length > 2 ? [topId, secondId] : null,
    },
  };
}
