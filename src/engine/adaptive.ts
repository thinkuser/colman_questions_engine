import { computeFit } from "./computeFit";
import type {
  AnswerOption,
  AnsweredQuestion,
  FitResult,
  ProgramId,
  ProgramInput,
  QuestionDefinition,
  RealityCheckInput,
  RecordedAnswer,
} from "./types";

/**
 * Adaptive question selection and stop logic (DEC-021). Pure and deterministic: given the selected programs,
 * the question bank, and the answers so far (in order), it returns the next question or the final result.
 * The question bank is an input (src/data/content/question_bank.json); the engine never reads the data layer.
 *
 *   Q1–Q3 (opening) → score → lock pair branch from the current top two
 *   → pair-1, pair-2
 *   → stop at 5 if both favour the same program (neither is "neither") and the result is not a near tie
 *   → else pair-3; stop at 6 if no_strong_fit or not a near tie
 *   → else ONE tie-breaker for the CURRENT top two; stop at 7 regardless
 */

export const QUESTION_ROLES = ["opening", "pair", "tie_breaker"] as const;
export type QuestionRole = (typeof QUESTION_ROLES)[number];

export interface BankOption extends AnswerOption {
  /** The program this option points towards; null for neutral options ("neither") and opening questions. */
  favours: ProgramId | null;
}

export interface BankQuestion extends QuestionDefinition {
  role: QuestionRole;
  options: readonly BankOption[];
}

export interface PairBranch {
  programs: readonly [ProgramId, ProgramId];
  /** Exactly three pair questions, asked in order. */
  pairQuestionIds: readonly [string, string, string];
  tieBreakerId: string;
}

export interface QuestionBank {
  questions: readonly BankQuestion[];
  /** Exactly three common opening questions, asked first in order. */
  openingQuestionIds: readonly [string, string, string];
  branches: readonly PairBranch[];
}

export interface AdaptiveInput {
  programs: readonly ProgramInput[];
  bank: QuestionBank;
  /** Answers so far, in the order the questions were asked. */
  answers: readonly RecordedAnswer[];
  realityChecks?: readonly RealityCheckInput[];
}

export type AdaptivePhase = "opening" | "pair" | "tie_breaker";

export type StopReason =
  /** Pair-1 and pair-2 favour the same program and the result is not a near tie (5 questions). */
  | "pair_answers_agree"
  /** After pair-3 the result is no_strong_fit; never followed by a tie-breaker. */
  | "no_strong_fit"
  /** After pair-3 the result is not a near tie. */
  | "clear_after_pair_3"
  /** The single tie-breaker was asked; the result is returned even if still close. */
  | "tie_breaker_asked";

export type AdaptiveStep =
  | {
      status: "ask";
      question: BankQuestion;
      phase: AdaptivePhase;
      /** 1-based position of the question about to be asked. */
      questionNumber: number;
      /** The locked pair branch; null during the opening phase. */
      branch: PairBranch | null;
    }
  | {
      status: "complete";
      result: FitResult;
      questionsAsked: number;
      branch: PairBranch;
      tieBreakerUsed: boolean;
      stopReason: StopReason;
    };

export const OPENING_QUESTION_COUNT = 3;
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 7;

const pairKey = (a: ProgramId, b: ProgramId) => [a, b].sort().join("|");

export function findBranch(bank: QuestionBank, a: ProgramId, b: ProgramId): PairBranch {
  const branch = bank.branches.find((candidate) => pairKey(...candidate.programs) === pairKey(a, b));
  if (!branch) {
    throw new Error(`Question bank has no pair branch for ${a} vs ${b}`);
  }
  return branch;
}

export function getBankQuestion(bank: QuestionBank, id: string): BankQuestion {
  const question = bank.questions.find((candidate) => candidate.id === id);
  if (!question) {
    throw new Error(`Question bank has no question "${id}"`);
  }
  return question;
}

function favouredBy(question: BankQuestion, answerId: string): ProgramId | null {
  const option = question.options.find((candidate) => candidate.id === answerId);
  if (!option) {
    throw new Error(`Answer "${answerId}" is not an option of question "${question.id}"`);
  }
  return option.favours;
}

/**
 * Next step of the adaptive comparison. Answers are replayed against the questions the algorithm would have
 * asked; an answer to any other question is a programming error and throws.
 */
export function nextAdaptiveStep(input: AdaptiveInput): AdaptiveStep {
  const { programs, bank, answers, realityChecks = [] } = input;
  const answered: AnsweredQuestion[] = [];

  const fit = () => computeFit({ programs, answers: answered, realityChecks });
  /** Either return the question to ask now, or consume the recorded answer for it and continue. */
  const step = (question: BankQuestion, phase: AdaptivePhase, branch: PairBranch | null): AdaptiveStep | null => {
    const index = answered.length;
    const recorded = answers[index];
    if (!recorded) {
      return { status: "ask", question, phase, questionNumber: index + 1, branch };
    }
    if (recorded.questionId !== question.id) {
      throw new Error(`Answer ${index + 1} is for "${recorded.questionId}" but the flow asked "${question.id}"`);
    }
    favouredBy(question, recorded.answerId); // validates the option exists
    answered.push({ question, answerId: recorded.answerId });
    return null;
  };
  const complete = (branch: PairBranch, stopReason: StopReason, tieBreakerUsed = false): AdaptiveStep => {
    if (answers.length > answered.length) {
      throw new Error(`Received ${answers.length} answers but the flow stopped after ${answered.length}`);
    }
    return { status: "complete", result: fit(), questionsAsked: answered.length, branch, tieBreakerUsed, stopReason };
  };

  // 1. Common opening questions.
  for (const id of bank.openingQuestionIds) {
    const pending = step(getBankQuestion(bank, id), "opening", null);
    if (pending) return pending;
  }

  // 2. Lock the pair branch from the current top two (fixed when only two programs are selected).
  const branch = findBranch(bank, ...fit().mainDecision);
  const [pair1, pair2, pair3] = branch.pairQuestionIds.map((id) => getBankQuestion(bank, id));

  // 3. Two pair questions.
  for (const question of [pair1!, pair2!]) {
    const pending = step(question, "pair", branch);
    if (pending) return pending;
  }
  const first = favouredBy(pair1!, answered[OPENING_QUESTION_COUNT]!.answerId);
  const second = favouredBy(pair2!, answered[OPENING_QUESTION_COUNT + 1]!.answerId);
  if (first !== null && first === second && !fit().nearTie) {
    return complete(branch, "pair_answers_agree");
  }

  // 4. Third pair question: answers split, a "neither", or still a near tie.
  const pending3 = step(pair3!, "pair", branch);
  if (pending3) return pending3;
  const afterPair3 = fit();
  if (afterPair3.fitClassification === "no_strong_fit") return complete(branch, "no_strong_fit");
  if (!afterPair3.nearTie) return complete(branch, "clear_after_pair_3");

  // 5. At most one tie-breaker, for the CURRENT top two. Then stop, even if still close.
  const tieBreaker = getBankQuestion(bank, findBranch(bank, ...afterPair3.mainDecision).tieBreakerId);
  const pendingTieBreaker = step(tieBreaker, "tie_breaker", branch);
  if (pendingTieBreaker) return pendingTieBreaker;
  return complete(branch, "tie_breaker_asked", true);
}
