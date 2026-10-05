import type { FitResult, ProgramId, RecordedAnswer } from "@/engine";
import { nextComparisonStep } from "./adaptiveStep";
import { isValidSelectionSize, MAX_SELECTED_PROGRAMS } from "./selection";

/**
 * Comparison flow state: select, questions, result.
 * Pure reducer + selectors so routing rules are unit-testable and stay out of UI components.
 * Which question comes next, and when the flow is complete, is decided only by the adaptive engine
 * (`nextComparisonStep`); this reducer validates recorded answers against it and never routes on its own.
 * Durable state is just the selection and the answers; the next question and the result are always recomputed.
 */

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
  /** Remove the last answer and return to that question (or to program selection from the first question). */
  | { type: "go_back" }
  | { type: "complete"; result: FitResult | null }
  | { type: "restart" };

export const initialComparisonState: ComparisonState = {
  status: "selecting",
  selectedProgramIds: [],
  answers: [],
  result: null,
};

export function canStartQuestions(state: Pick<ComparisonState, "selectedProgramIds">): boolean {
  return isValidSelectionSize(state.selectedProgramIds.length);
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

/** Accept an answer only if it answers the question the engine is currently asking, with one of its options. */
function recordAnswer(state: ComparisonState, answer: RecordedAnswer): ComparisonState {
  if (state.status !== "answering") {
    return state;
  }
  const step = nextComparisonStep(state);
  if (
    step?.status !== "ask" ||
    step.question.id !== answer.questionId ||
    !step.question.options.some((option) => option.id === answer.answerId)
  ) {
    return state;
  }
  const answers = [...state.answers, { questionId: answer.questionId, answerId: answer.answerId }];
  const next = nextComparisonStep({ selectedProgramIds: state.selectedProgramIds, answers });
  if (next?.status === "complete") {
    return { ...state, answers, status: "completed", result: next.result };
  }
  return { ...state, answers };
}

function goBack(state: ComparisonState): ComparisonState {
  switch (state.status) {
    case "selecting":
      return state;
    case "answering":
      if (state.answers.length === 0) {
        return { ...initialComparisonState, selectedProgramIds: state.selectedProgramIds };
      }
      return { ...state, answers: state.answers.slice(0, -1) };
    case "completed":
      // Everything derived from the removed answer (result, any later question) is recomputed by the engine.
      return { ...state, status: "answering", answers: state.answers.slice(0, -1), result: null };
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
      return recordAnswer(state, action.answer);
    case "go_back":
      return goBack(state);
    case "complete":
      if (state.status !== "answering") {
        return state;
      }
      return { ...state, status: "completed", result: action.result };
    case "restart":
      return initialComparisonState;
  }
}
