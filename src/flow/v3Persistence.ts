import { z } from "zod";
import { CAREER_PROJECTS } from "@/data";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import { canStartDiscovery, discoveryReducer, initialDiscoveryState, type DiscoveryState } from "./discoveryFlow";

/**
 * Durable V3 journey state. Same model as V2 (only the candidate's own actions are stored: phase, selected projects,
 * answers; everything derived is recomputed by replaying through the unchanged reducer) but a SEPARATE key and a
 * `flow: "v3"` marker, so V2 and V3 can never read, overwrite or clear each other's journey. A V2 payload is rejected
 * as invalid V3 state (and vice versa), never interpreted.
 */

export const V3_STORAGE_KEY = "colman-studymatch:v3:journey";
export const V3_STORAGE_VERSION = 1;

const StoredV3Schema = z.strictObject({
  version: z.literal(V3_STORAGE_VERSION),
  flow: z.literal("v3"),
  phase: z.enum(["selecting", "answering"]),
  selectedProjectIds: z.array(z.string()).max(MAX_SELECTED_PROJECTS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

export function serializeV3Journey(state: DiscoveryState): string | null {
  if (state.selectedProjectIds.length === 0 && state.answers.length === 0 && state.phase === "selecting") return null;
  return JSON.stringify({
    version: V3_STORAGE_VERSION,
    flow: "v3",
    phase: state.phase,
    selectedProjectIds: [...state.selectedProjectIds],
    answers: state.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  });
}

/** Rebuild a state by replaying the stored selection and answers through the reducer. Null if anything is invalid. */
export function restoreV3Journey(raw: string | null): DiscoveryState | null {
  if (raw === null) return null;
  try {
    const parsed = StoredV3Schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { phase, selectedProjectIds, answers } = parsed.data;
    const known = new Set(CAREER_PROJECTS.filter((project) => project.enabled).map((project) => project.id));
    if (new Set(selectedProjectIds).size !== selectedProjectIds.length) return null;
    if (!selectedProjectIds.every((id) => known.has(id))) return null;

    const selection: DiscoveryState = { ...initialDiscoveryState, selectedProjectIds };
    if (phase === "selecting") return answers.length === 0 ? selection : null;
    if (!canStartDiscovery(selection)) return null;

    let state = discoveryReducer(selection, { type: "start" });
    for (const answer of answers) {
      const next = discoveryReducer(state, { type: "record_answer", answer });
      if (next.answers.length !== state.answers.length + 1) return null;
      state = next;
    }
    return state;
  } catch {
    return null;
  }
}
