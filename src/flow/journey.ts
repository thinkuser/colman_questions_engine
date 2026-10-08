import { CAREER_PROJECTS, V2_CLUSTERS, V3_WORLD_CLUSTERS, V3_WORLDS, worldsAsRoutingEntries } from "@/data";
import {
  MAX_SELECTED_PROJECTS,
  nextV2Step,
  validateProjectSelection,
  type RecordedAnswer,
  type V2Step,
} from "@/engine";
import { nextDiscoveryStep, V1_TECH_PRECISION_MODULE, V2_WORK_STATEMENTS } from "./v2Step";

/**
 * Discovery strategies (DEC-034). The DISCOVERY STRATEGY (what the opening screen asks: brands or working worlds) is
 * deliberately separate from the EXPERIENCE (the V3 UI). Both strategies feed the SAME engine (`nextV2Step`): the
 * opening choice is routing only (candidate pool + first scenarios) and scores nothing.
 *
 *  - `brand_projects`: the V2 career projects, delegating to the unchanged V2 `nextDiscoveryStep`. V2 itself does not
 *    use this module (it keeps `discoveryFlow.ts`); this wrapper exists so the V3 experience could run brand-led.
 *  - `worlds`: the V3 working worlds, adapted into the engine's routing entries and clusters.
 *
 * The generic journey below mirrors the V2 reducer exactly (same accept/reject rules), parameterised by strategy.
 */

export type DiscoveryStrategyId = "brand_projects" | "worlds";

export interface DiscoveryStrategy {
  id: DiscoveryStrategyId;
  /** Enabled entry ids, in display order. */
  entryIds: readonly string[];
  maxSelected: number;
  /** 1..max distinct known entries. */
  isValidSelection(selectedIds: readonly string[]): boolean;
  /** The engine's next step for a valid selection (selection order as given) and the answers so far. Throws if invalid. */
  nextStep(selectedIds: readonly string[], answers: readonly RecordedAnswer[]): V2Step;
}

export const BRAND_STRATEGY: DiscoveryStrategy = {
  id: "brand_projects",
  entryIds: CAREER_PROJECTS.filter((project) => project.enabled).map((project) => project.id),
  maxSelected: MAX_SELECTED_PROJECTS,
  isValidSelection: (selectedIds) => validateProjectSelection(selectedIds, CAREER_PROJECTS).ok,
  nextStep: (selectedIds, answers) => nextDiscoveryStep({ selectedProjectIds: selectedIds, answers }),
};

const WORLD_CLUSTERS = [...V3_WORLD_CLUSTERS, ...V2_CLUSTERS];

export const WORLD_STRATEGY: DiscoveryStrategy = {
  id: "worlds",
  entryIds: V3_WORLDS.filter((world) => world.enabled).map((world) => world.id),
  maxSelected: MAX_SELECTED_PROJECTS,
  isValidSelection: (selectedIds) => validateProjectSelection(selectedIds, worldsAsRoutingEntries(selectedIds)).ok,
  nextStep: (selectedIds, answers) =>
    nextV2Step({
      // Selected worlds are ordered by the candidate's own selection order (which opening scenario comes first).
      projects: worldsAsRoutingEntries(selectedIds),
      // The world clusters drive the journey; the V2 clusters are present so reality checks (found by explicit
      // applicability across all clusters) reach every program exactly as in V2.
      clusters: WORLD_CLUSTERS,
      workStatements: V2_WORK_STATEMENTS,
      precisionModules: [V1_TECH_PRECISION_MODULE],
      selectedProjectIds: selectedIds,
      answers,
    }),
};

// --- Generic journey -----------------------------------------------------------------------------------------------

export type JourneyPhase = "selecting" | "answering";
export type JourneyRoute = "select" | "questions" | "result";

export interface JourneyState {
  phase: JourneyPhase;
  /** Selected entry ids (worlds or projects), in the candidate's selection order. */
  selectedIds: string[];
  answers: RecordedAnswer[];
}

export type JourneyAction =
  | { type: "toggle_entry"; entryId: string }
  | { type: "start" }
  | { type: "record_answer"; answer: RecordedAnswer }
  | { type: "go_back" }
  | { type: "restart" };

export const initialJourneyState: JourneyState = { phase: "selecting", selectedIds: [], answers: [] };

export function canStartJourney(strategy: DiscoveryStrategy, state: Pick<JourneyState, "selectedIds">): boolean {
  return strategy.isValidSelection(state.selectedIds);
}

export function journeyStep(strategy: DiscoveryStrategy, state: JourneyState): V2Step | null {
  if (state.phase !== "answering") return null;
  try {
    return strategy.nextStep(state.selectedIds, state.answers);
  } catch {
    return null;
  }
}

export function journeyRoute(strategy: DiscoveryStrategy, state: JourneyState): JourneyRoute {
  const step = journeyStep(strategy, state);
  if (!step) return "select";
  return step.status === "complete" ? "result" : "questions";
}

function askedQuestion(step: V2Step | null): { id: string; optionIds: string[] } | null {
  if (step?.status !== "ask") return null;
  if (step.mode === "precision") {
    return { id: step.question.id, optionIds: step.question.options.map((option) => option.id) };
  }
  return { id: step.question.question.id, optionIds: step.question.question.options.map((option) => option.id) };
}

export function journeyReducer(strategy: DiscoveryStrategy, state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case "toggle_entry": {
      if (!strategy.entryIds.includes(action.entryId)) return state;
      const isSelected = state.selectedIds.includes(action.entryId);
      if (!isSelected && state.selectedIds.length >= strategy.maxSelected) return state;
      const selectedIds = isSelected
        ? state.selectedIds.filter((id) => id !== action.entryId)
        : [...state.selectedIds, action.entryId];
      // Changing the selection invalidates any answers collected for the previous one.
      return { phase: "selecting", selectedIds, answers: [] };
    }
    case "start":
      if (!canStartJourney(strategy, state)) return state;
      return { ...state, phase: "answering", answers: [] };
    case "record_answer": {
      if (state.phase !== "answering") return state;
      const asked = askedQuestion(journeyStep(strategy, state));
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
      return initialJourneyState;
  }
}
