import { CAREER_PROJECTS } from "@/data";
import { MAX_SELECTED_PROJECTS, validateProjectSelection, type RecordedAnswer, type V2Step } from "@/engine";
import { nextDiscoveryStep } from "./v2Step";

/**
 * V2 journey state (THI-16): choose 1-2 career projects, answer, result. Pure reducer + selectors, like the V1
 * comparison flow. The durable state is only what the candidate did: the selected projects, whether they started,
 * and the answers in order. Which question comes next, the handoff to the V1 Tech module, and the result are ALWAYS
 * recomputed by the engine (`nextDiscoveryStep`); nothing derived (scores, ranking, shortlist, recommendation) is
 * ever stored. The reducer never routes on its own: it only accepts an answer to the question the engine is asking.
 */

export type DiscoveryPhase = "selecting" | "answering";

/** The route a state belongs on. `questions` also covers an engine content gap (rendered as a safe dead end). */
export type DiscoveryRoute = "select" | "questions" | "result";

export interface DiscoveryState {
  phase: DiscoveryPhase;
  selectedProjectIds: string[];
  answers: RecordedAnswer[];
}

export type DiscoveryAction =
  | { type: "toggle_project"; projectId: string }
  | { type: "start" }
  | { type: "record_answer"; answer: RecordedAnswer }
  /** Remove the last answer and recompute; from the first question, return to project selection (selection kept). */
  | { type: "go_back" }
  | { type: "restart" };

export const initialDiscoveryState: DiscoveryState = { phase: "selecting", selectedProjectIds: [], answers: [] };

export function canStartDiscovery(state: Pick<DiscoveryState, "selectedProjectIds">): boolean {
  return validateProjectSelection(state.selectedProjectIds, CAREER_PROJECTS).ok;
}

/** The engine's next step for an answering state, or null while selecting (or if the stored answers do not replay). */
export function discoveryStep(state: DiscoveryState): V2Step | null {
  if (state.phase !== "answering") return null;
  try {
    return nextDiscoveryStep({ selectedProjectIds: state.selectedProjectIds, answers: state.answers });
  } catch {
    return null;
  }
}

export function discoveryRoute(state: DiscoveryState): DiscoveryRoute {
  const step = discoveryStep(state);
  if (!step) return "select";
  return step.status === "complete" ? "result" : "questions";
}

export function canAccessDiscoveryRoute(state: DiscoveryState, route: DiscoveryRoute): boolean {
  return route === "select" || discoveryRoute(state) === route;
}

/** Ids and option ids the engine would accept next (both generic and precision questions). */
function askedQuestion(step: V2Step | null): { id: string; optionIds: string[] } | null {
  if (step?.status !== "ask") return null;
  if (step.mode === "precision") {
    return { id: step.question.id, optionIds: step.question.options.map((option) => option.id) };
  }
  return { id: step.question.question.id, optionIds: step.question.question.options.map((option) => option.id) };
}

export function discoveryReducer(state: DiscoveryState, action: DiscoveryAction): DiscoveryState {
  switch (action.type) {
    case "toggle_project": {
      const known = CAREER_PROJECTS.find((project) => project.id === action.projectId);
      if (!known || !known.enabled) return state;
      const isSelected = state.selectedProjectIds.includes(action.projectId);
      if (!isSelected && state.selectedProjectIds.length >= MAX_SELECTED_PROJECTS) return state;
      const selectedProjectIds = isSelected
        ? state.selectedProjectIds.filter((id) => id !== action.projectId)
        : [...state.selectedProjectIds, action.projectId];
      // Changing the selection invalidates any answers collected for the previous one.
      return { phase: "selecting", selectedProjectIds, answers: [] };
    }
    case "start":
      if (!canStartDiscovery(state)) return state;
      return { ...state, phase: "answering", answers: [] };
    case "record_answer": {
      if (state.phase !== "answering") return state;
      const asked = askedQuestion(discoveryStep(state));
      if (!asked || asked.id !== action.answer.questionId || !asked.optionIds.includes(action.answer.answerId)) {
        return state;
      }
      return {
        ...state,
        answers: [...state.answers, { questionId: action.answer.questionId, answerId: action.answer.answerId }],
      };
    }
    case "go_back":
      if (state.phase !== "answering") return state;
      if (state.answers.length === 0) return { ...state, phase: "selecting" };
      return { ...state, answers: state.answers.slice(0, -1) };
    case "restart":
      return initialDiscoveryState;
  }
}
