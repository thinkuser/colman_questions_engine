import { getProgramInputs, getRealityCheckInputs, QUESTION_BANK } from "@/data";
import {
  getBankQuestion,
  nextAdaptiveStep,
  type AdaptiveStep,
  type AnsweredQuestion,
  type BankQuestion,
  type FitInput,
  type ProgramId,
  type RecordedAnswer,
} from "@/engine";

/**
 * Test helpers over the REAL V1 question bank (src/data/content/question_bank.json, DEC-021).
 * The THI-7 synthetic pair fixtures were replaced in THI-8.
 */

export const CS = "computer_science";
export const DS = "data_science";
export const MIS = "management_information_systems";
export const ALL_PILOT: ProgramId[] = [CS, DS, MIS];

export const q = (id: string): BankQuestion => getBankQuestion(QUESTION_BANK, id);
export const answer = (questionId: string, answerId: string): AnsweredQuestion => ({
  question: q(questionId),
  answerId,
});

/** Fit input using the real documented program vectors and reality checks from the data layer. */
export function fitInput(answers: AnsweredQuestion[], programs: ProgramId[] = ALL_PILOT): FitInput {
  return { programs: getProgramInputs(programs), answers, realityChecks: getRealityCheckInputs(programs) };
}

export function adaptiveStep(programs: ProgramId[], answers: RecordedAnswer[]): AdaptiveStep {
  return nextAdaptiveStep({
    programs: getProgramInputs(programs),
    realityChecks: getRealityCheckInputs(programs),
    bank: QUESTION_BANK,
    answers,
  });
}

/** Picks an option id for the question being asked. */
export type AnswerPolicy = (question: BankQuestion) => string;

export type CompletedRun = Extract<AdaptiveStep, { status: "complete" }> & {
  asked: string[];
  answers: RecordedAnswer[];
};

/** Play the adaptive flow to completion with an answer policy. */
export function runFlow(programs: ProgramId[], policy: AnswerPolicy): CompletedRun {
  const answers: RecordedAnswer[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const step = adaptiveStep(programs, answers);
    if (step.status === "complete") {
      return { ...step, asked: answers.map((a) => a.questionId), answers };
    }
    answers.push({ questionId: step.question.id, answerId: policy(step.question) });
  }
  throw new Error("Adaptive flow did not terminate");
}

/**
 * Persona-style policy: fixed opening answers (Q1, Q2, Q3), then for every later question the first option id
 * from `preference` that the question offers ("cs" | "ds" | "mis" | "neither").
 */
export function preferencePolicy(opening: [string, string, string], preference: string[]): AnswerPolicy {
  return (question) => {
    const openingIndex = ["Q1", "Q2", "Q3"].indexOf(question.id);
    if (openingIndex >= 0) return opening[openingIndex]!;
    const ids = question.options.map((option) => option.id);
    const choice = preference.find((candidate) => ids.includes(candidate));
    if (!choice) throw new Error(`Policy has no answer for ${question.id}`);
    return choice;
  };
}

/** Policy that cycles through `sequence` for non-opening questions (skipping options the question lacks). */
export function alternatingPolicy(opening: [string, string, string], sequence: string[]): AnswerPolicy {
  let position = 0;
  return (question) => {
    const openingIndex = ["Q1", "Q2", "Q3"].indexOf(question.id);
    if (openingIndex >= 0) return opening[openingIndex]!;
    const ids = question.options.map((option) => option.id);
    for (let offset = 0; offset < sequence.length; offset++) {
      const candidate = sequence[(position + offset) % sequence.length]!;
      if (ids.includes(candidate)) {
        position += offset + 1;
        return candidate;
      }
    }
    throw new Error(`Policy has no answer for ${question.id}`);
  };
}

/** Every complete answer path through the adaptive flow (depth-first over all options at each asked question). */
export function enumerateRuns(programs: ProgramId[]): CompletedRun[] {
  const runs: CompletedRun[] = [];
  const walk = (answers: RecordedAnswer[]) => {
    const step = adaptiveStep(programs, answers);
    if (step.status === "complete") {
      runs.push({ ...step, asked: answers.map((a) => a.questionId), answers });
      return;
    }
    for (const option of step.question.options) {
      walk([...answers, { questionId: step.question.id, answerId: option.id }]);
    }
  };
  walk([]);
  return runs;
}
