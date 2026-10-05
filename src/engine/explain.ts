import { EPSILON, REALITY_CHECK_BOTTOM_FRACTION, REALITY_CHECK_MAX_SIGNAL } from "./constants";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { chosenOption, optionContribution, questionIdeal, questionWeight } from "./scoring";
import type {
  AnsweredQuestion,
  CandidateVector,
  DimensionDelta,
  EvidenceItem,
  ProgramContribution,
  ProgramId,
  ProgramInput,
  RealityCheckInput,
  ScoredProgram,
  Tradeoff,
  TriggeredDimension,
  TriggeredRealityCheck,
} from "./types";

/**
 * Structured explanation inputs: evidence, trade-off, reality checks.
 * None of these feed back into scores, and none produce candidate-facing prose (THI-10 writes copy).
 */

/** Every answered question with its contribution to each program, ordered by decisiveness for #1 vs #2. */
export function buildEvidence(
  answers: readonly AnsweredQuestion[],
  programs: readonly ProgramInput[],
  ranking: readonly ScoredProgram[],
): EvidenceItem[] {
  const [top, second] = ranking;
  const items = answers.map((answer) => {
    const weight = questionWeight(answer);
    const option = chosenOption(answer);
    const contributions: Record<ProgramId, ProgramContribution> = {};
    for (const program of programs) {
      const scored = ranking.find((candidate) => candidate.programId === program.id)!;
      const contribution = optionContribution(option, weight, program.vector);
      contributions[program.id] = {
        contribution,
        questionIdeal: questionIdeal(answer, program.vector),
        normalizedContribution: scored.hasUsableSignal ? contribution / scored.idealFit : 0,
      };
    }
    const topVsSecond =
      contributions[top!.programId]!.normalizedContribution - contributions[second!.programId]!.normalizedContribution;
    const direction: EvidenceItem["direction"] =
      topVsSecond > EPSILON ? "supports_top" : topVsSecond < -EPSILON ? "supports_second" : "neutral";
    return {
      questionId: answer.question.id,
      answerId: answer.answerId,
      questionType: answer.question.type,
      weight,
      contributions,
      topVsSecond,
      direction,
    };
  });
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Math.abs(b.item.topVsSecond) - Math.abs(a.item.topVsSecond) || a.index - b.index)
    .map(({ item }) => item);
}

/** Per-dimension decomposition of the top-two normalized gap. */
export function buildTradeoff(top: ScoredProgram, second: ScoredProgram): Tradeoff {
  const decidingDimensions: DimensionDelta[] = DIMENSIONS.map((dimension) => {
    const topContribution = top.dimensionContributions[dimension];
    const secondContribution = second.dimensionContributions[dimension];
    return { dimension, topContribution, secondContribution, delta: topContribution - secondContribution };
  })
    .filter((item) => Math.abs(item.delta) > EPSILON)
    .sort((a, b) => b.delta - a.delta);
  return { topProgram: top.programId, secondProgram: second.programId, decidingDimensions };
}

/** Attainable min/max of `C[d]` given the questions actually asked (each question picks its extreme option). */
export function dimensionRange(
  answers: readonly AnsweredQuestion[],
  dimension: Dimension,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const answer of answers) {
    const weight = questionWeight(answer);
    const values = answer.question.options.map((option) => weight * (option.signals[dimension] ?? 0));
    min += Math.min(...values);
    max += Math.max(...values);
  }
  return { min, max };
}

/**
 * Generic reality checks for the top two programs only. A check triggers when at least one related dimension is
 * materially low: strictly below `min + (max − min) / 3` of its attainable range AND net-negative (< 0).
 * Dimensions without variation never trigger. Checks never modify fit (DEC-009).
 */
export function evaluateRealityChecks(
  answers: readonly AnsweredQuestion[],
  candidate: CandidateVector,
  topTwo: readonly ProgramId[],
  checks: readonly RealityCheckInput[],
): TriggeredRealityCheck[] {
  const triggered: TriggeredRealityCheck[] = [];
  for (const check of checks) {
    if (!topTwo.includes(check.programId)) continue;
    const triggeredDimensions: TriggeredDimension[] = [];
    for (const dimension of check.relatedDimensions) {
      const { min, max } = dimensionRange(answers, dimension);
      if (max - min <= EPSILON) continue;
      const threshold = min + (max - min) * REALITY_CHECK_BOTTOM_FRACTION;
      const value = candidate[dimension];
      if (value < threshold - EPSILON && value < REALITY_CHECK_MAX_SIGNAL - EPSILON) {
        triggeredDimensions.push({ dimension, value, min, max, threshold });
      }
    }
    if (triggeredDimensions.length > 0) {
      triggered.push({ id: check.id, programId: check.programId, triggeredDimensions });
    }
  }
  return triggered;
}
