import type { FitResult, ProgramId, RecordedAnswer } from "@/engine";

/**
 * Comparison flow state: select → questions → result.
 * Pure reducer + selectors so routing rules are unit-testable and stay out of UI components.
 * Question selection (THI-8) and scoring (THI-7) plug in here later; this skeleton only tracks progress.
 */

export const MIN_SELECTED_PROGRAMS = 2;
export const MAX_SELECTED_PROGRAMS = 3;

export type FlowStep = "select" | "questions" | "result";

export type FlowStatus = "selecting" | "answering" | "completed";

export interface ComparisonState {
  status: FlowStatus;
  selectedProgramIds: ProgramId[];
  answers: RecordedAnswer[];
  result: FitResult | null;
}

export type ComparisonAction =
  | { type: "toggle_program"; programId: ProgramId }
  | { type: "start_questions" }
  | { type: "record_answer"; answer: RecordedAnswer }
  | { type: "complete"; result: FitResult | null }
  | { type: "restart" };

export const initialComparisonState: ComparisonState = {
  status: "selecting",
  selectedProgramIds: [],
  answers: [],
  result: null,
};

export function canStartQuestions(state: ComparisonState): boolean {
  const count = state.selectedProgramIds.length;
  return count >= MIN_SELECTED_PROGRAMS && count <= MAX_SELECTED_PROGRAMS;
}

/** The step the candidate belongs on for the current state. Guards redirect here. */
export function currentStep(state: ComparisonState): FlowStep {
  switch (state.status) {
    case "selecting":
      return "select";
    case "answering":
      return "questions";
    case "completed":
      return "result";
  }
}

/** Whether a route step may be shown for the current state. Selection is always reachable. */
export function canAccessStep(state: ComparisonState, step: FlowStep): boolean {
  switch (step) {
    case "select":
      return true;
    case "questions":
      return state.status === "answering";
    case "result":
      return state.status === "completed";
  }
}

export function comparisonReducer(state: ComparisonState, action: ComparisonAction): ComparisonState {
  switch (action.type) {
    case "toggle_program": {
      const isSelected = state.selectedProgramIds.includes(action.programId);
      if (!isSelected && state.selectedProgramIds.length >= MAX_SELECTED_PROGRAMS) {
        return state;
      }
      const selectedProgramIds = isSelected
        ? state.selectedProgramIds.filter((id) => id !== action.programId)
        : [...state.selectedProgramIds, action.programId];
      // Changing the comparison set invalidates any answers and result collected for the previous set.
      return { ...initialComparisonState, selectedProgramIds };
    }
    case "start_questions":
      // (Re)starting always begins a fresh question pass for the current selection.
      if (!canStartQuestions(state)) {
        return state;
      }
      return { ...state, status: "answering", answers: [], result: null };
    case "record_answer":
      if (state.status !== "answering") {
        return state;
      }
      // Append-only: historical answers are never silently rewritten.
      return { ...state, answers: [...state.answers, action.answer] };
    case "complete":
      if (state.status !== "answering") {
        return state;
      }
      return { ...state, status: "completed", result: action.result };
    case "restart":
      return initialComparisonState;
  }
}
