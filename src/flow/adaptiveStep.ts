import { getProgramInputs, getRealityCheckInputs, QUESTION_BANK } from "@/data";
import { nextAdaptiveStep, type AdaptiveStep } from "@/engine";
import { canStartQuestions, type ComparisonState } from "./comparisonFlow";

/**
 * Contract for the question UI (THI-9): the next question to ask, or the final result, for the current selection
 * and answers. Wires the V1 question bank and program data into the pure adaptive engine.
 * Returns null while the selection is not valid for a comparison.
 */
export function nextComparisonStep(
  state: Pick<ComparisonState, "selectedProgramIds" | "answers">,
): AdaptiveStep | null {
  if (!canStartQuestions({ ...state, status: "answering", result: null })) {
    return null;
  }
  return nextAdaptiveStep({
    programs: getProgramInputs(state.selectedProgramIds),
    realityChecks: getRealityCheckInputs(state.selectedProgramIds),
    bank: QUESTION_BANK,
    answers: state.answers,
  });
}
