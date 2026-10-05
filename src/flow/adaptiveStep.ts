import { getProgramInputs, getRealityCheckInputs, QUESTION_BANK } from "@/data";
import { nextAdaptiveStep, type AdaptiveStep, type ProgramId, type RecordedAnswer } from "@/engine";
import { isValidSelectionSize } from "./selection";

/**
 * Contract for the question UI (THI-9): the next question to ask, or the final result, for the current selection
 * and answers. Wires the V1 question bank and program data into the pure adaptive engine.
 * Returns null while the selection is not valid for a comparison.
 * Throws if the answers do not match the questions the engine would ask (callers validate before storing).
 */
export function nextComparisonStep(state: {
  selectedProgramIds: readonly ProgramId[];
  answers: readonly RecordedAnswer[];
}): AdaptiveStep | null {
  if (!isValidSelectionSize(state.selectedProgramIds.length)) {
    return null;
  }
  return nextAdaptiveStep({
    programs: getProgramInputs(state.selectedProgramIds),
    realityChecks: getRealityCheckInputs(state.selectedProgramIds),
    bank: QUESTION_BANK,
    answers: state.answers,
  });
}
