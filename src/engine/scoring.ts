import { EPSILON, FIT_THRESHOLDS, QUESTION_TYPE_WEIGHTS } from "./constants";
import { DIMENSIONS, isDimension, type Dimension } from "./dimensions";
import type {
  AnswerOption,
  AnsweredQuestion,
  CandidateVector,
  FitClassification,
  ProgramInput,
  ProgramVector,
  ScoredProgram,
  SignalVector,
} from "./types";

/**
 * Scoring core (DEC-019). All functions are pure and deterministic.
 *
 *   C[d]            = Σ_q weight(q) × signal(chosen option of q)[d]
 *   raw_fit(P)      = Σ_d C[d] × P[d]
 *   ideal(P)        = Σ_q max_option weight(q) × Σ_d signal(option)[d] × P[d]
 *   normalized(P)   = clamp(raw_fit(P) / ideal(P), 0, 1), or 0 when ideal(P) <= 0
 */

export function questionWeight(answer: AnsweredQuestion): number {
  return QUESTION_TYPE_WEIGHTS[answer.question.type];
}

export function chosenOption(answer: AnsweredQuestion): AnswerOption {
  const option = answer.question.options.find((candidate) => candidate.id === answer.answerId);
  if (!option) {
    throw new Error(`Answer "${answer.answerId}" is not an option of question "${answer.question.id}"`);
  }
  return option;
}

const signalOf = (signals: SignalVector, dimension: Dimension) => signals[dimension] ?? 0;

export function emptyCandidateVector(): CandidateVector {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as CandidateVector;
}

export function buildCandidateVector(answers: readonly AnsweredQuestion[]): CandidateVector {
  const vector = emptyCandidateVector();
  for (const answer of answers) {
    const weight = questionWeight(answer);
    const { signals } = chosenOption(answer);
    for (const dimension of DIMENSIONS) {
      vector[dimension] += weight * signalOf(signals, dimension);
    }
  }
  return vector;
}

/** `weight × Σ_d signal[d] × P[d]` — one option's contribution to one program's raw fit. */
export function optionContribution(option: AnswerOption, weight: number, vector: ProgramVector): number {
  return DIMENSIONS.reduce(
    (sum, dimension) => sum + weight * signalOf(option.signals, dimension) * vector[dimension],
    0,
  );
}

/** Best attainable contribution of a question to a program, over all of its options. */
export function questionIdeal(answer: AnsweredQuestion, vector: ProgramVector): number {
  const weight = questionWeight(answer);
  return Math.max(...answer.question.options.map((option) => optionContribution(option, weight, vector)));
}

export function idealFit(answers: readonly AnsweredQuestion[], vector: ProgramVector): number {
  return answers.reduce((sum, answer) => sum + questionIdeal(answer, vector), 0);
}

export function rawFit(candidate: CandidateVector, vector: ProgramVector): number {
  return DIMENSIONS.reduce((sum, dimension) => sum + candidate[dimension] * vector[dimension], 0);
}

/** Qualitative class from normalized fit using the PROPOSED thresholds (DEC-018). */
export function classifyFit(normalizedFit: number, hasUsableSignal = true): FitClassification {
  if (!hasUsableSignal) return "no_strong_fit";
  if (normalizedFit >= FIT_THRESHOLDS.strong_fit - EPSILON) return "strong_fit";
  if (normalizedFit >= FIT_THRESHOLDS.good_fit - EPSILON) return "good_fit";
  if (normalizedFit >= FIT_THRESHOLDS.consider_carefully - EPSILON) return "consider_carefully";
  return "no_strong_fit";
}

/** Score and rank programs by normalized fit. Exact ties keep selection order. */
export function scorePrograms(
  answers: readonly AnsweredQuestion[],
  programs: readonly ProgramInput[],
  candidate: CandidateVector = buildCandidateVector(answers),
): ScoredProgram[] {
  const scored = programs.map((program) => {
    const raw = rawFit(candidate, program.vector);
    const ideal = idealFit(answers, program.vector);
    const hasUsableSignal = ideal > EPSILON;
    const normalizedFit = hasUsableSignal ? Math.min(1, Math.max(0, raw / ideal)) : 0;
    const dimensionContributions = Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        hasUsableSignal ? (candidate[dimension] * program.vector[dimension]) / ideal : 0,
      ]),
    ) as Record<Dimension, number>;
    return {
      programId: program.id,
      rank: 0,
      rawFit: raw,
      idealFit: ideal,
      normalizedFit,
      hasUsableSignal,
      fitClassification: classifyFit(normalizedFit, hasUsableSignal),
      dimensionContributions,
    };
  });
  return scored
    .map((program, index) => ({ program, index }))
    .sort((a, b) => b.program.normalizedFit - a.program.normalizedFit || a.index - b.index)
    .map(({ program }, position) => ({ ...program, rank: position + 1 }));
}

/** Throws on malformed input: these are programming errors in the question bank or flow, not candidate states. */
export function validateFitInput(programs: readonly ProgramInput[], answers: readonly AnsweredQuestion[]): void {
  if (programs.length < 2) {
    throw new Error("The fit engine needs at least two programs to compare");
  }
  const programIds = new Set(programs.map((program) => program.id));
  if (programIds.size !== programs.length) {
    throw new Error("Duplicate program ids in fit input");
  }
  for (const program of programs) {
    for (const dimension of DIMENSIONS) {
      if (!Number.isFinite(program.vector[dimension])) {
        throw new Error(`Program "${program.id}" has no value for dimension "${dimension}"`);
      }
    }
  }
  const questionIds = new Set<string>();
  for (const answer of answers) {
    if (questionIds.has(answer.question.id)) {
      throw new Error(`Question "${answer.question.id}" was answered more than once`);
    }
    questionIds.add(answer.question.id);
    if (answer.question.options.length === 0) {
      throw new Error(`Question "${answer.question.id}" has no options`);
    }
    for (const option of answer.question.options) {
      for (const [dimension, value] of Object.entries(option.signals)) {
        if (!isDimension(dimension)) {
          throw new Error(`Option "${option.id}" of "${answer.question.id}" uses unknown dimension "${dimension}"`);
        }
        if (!Number.isFinite(value)) {
          throw new Error(
            `Option "${option.id}" of "${answer.question.id}" has a non-numeric signal for "${dimension}"`,
          );
        }
      }
    }
    chosenOption(answer);
  }
}
