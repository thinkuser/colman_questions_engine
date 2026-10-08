import { z } from "zod";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import {
  canStartJourney,
  initialJourneyState,
  journeyReducer,
  type DiscoveryStrategy,
  type JourneyState,
} from "./journey";

/**
 * Durable V3 journey state. Only the candidate's own actions are stored (phase, selected entries in selection order,
 * answers); everything derived is recomputed by replaying through the reducer. Separate key and `flow: "v3"` marker,
 * so V2 and V3 never read, overwrite or clear each other's journey.
 *
 * Version 2 (DEC-034) stores WHICH discovery strategy the selection belongs to (`strategy: "worlds"` for the V3
 * world-led experiment) and the selection as `selectedIds`. A version-1 payload (brand projects, `selectedProjectIds`)
 * or a payload of another strategy is rejected: the caller clears it and the candidate starts again at the landing.
 */

export const V3_STORAGE_KEY = "colman-studymatch:v3:journey";
export const V3_STORAGE_VERSION = 2;

const StoredV3Schema = z.strictObject({
  version: z.literal(V3_STORAGE_VERSION),
  flow: z.literal("v3"),
  strategy: z.enum(["worlds", "brand_projects"]),
  phase: z.enum(["selecting", "answering"]),
  selectedIds: z.array(z.string()).max(MAX_SELECTED_PROJECTS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

export function serializeV3Journey(strategy: DiscoveryStrategy, state: JourneyState): string | null {
  if (state.selectedIds.length === 0 && state.answers.length === 0 && state.phase === "selecting") return null;
  return JSON.stringify({
    version: V3_STORAGE_VERSION,
    flow: "v3",
    strategy: strategy.id,
    phase: state.phase,
    selectedIds: [...state.selectedIds],
    answers: state.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  });
}

/** Rebuild a state by replaying the stored selection and answers through the reducer. Null if anything is invalid. */
export function restoreV3Journey(strategy: DiscoveryStrategy, raw: string | null): JourneyState | null {
  if (raw === null) return null;
  try {
    const parsed = StoredV3Schema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.strategy !== strategy.id) return null;
    const { phase, selectedIds, answers } = parsed.data;
    if (new Set(selectedIds).size !== selectedIds.length) return null;
    if (!selectedIds.every((id) => strategy.entryIds.includes(id))) return null;

    // Replay the selection in its stored order (the order is meaningful: it decides which opening scenario is first).
    let state: JourneyState = initialJourneyState;
    for (const entryId of selectedIds) state = journeyReducer(strategy, state, { type: "toggle_entry", entryId });
    if (phase === "selecting") return answers.length === 0 ? state : null;
    if (!canStartJourney(strategy, state)) return null;

    state = journeyReducer(strategy, state, { type: "start" });
    for (const answer of answers) {
      const next = journeyReducer(strategy, state, { type: "record_answer", answer });
      if (next.answers.length !== state.answers.length + 1) return null;
      state = next;
    }
    return state;
  } catch {
    return null;
  }
}
