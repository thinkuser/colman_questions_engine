import { z } from "zod";
import { CAREER_PROJECTS } from "@/data";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import { canStartDiscovery, discoveryReducer, initialDiscoveryState, type DiscoveryState } from "./discoveryFlow";

/**
 * Durable V2 journey state for refresh recovery (THI-16). Stored: the flow version, whether the candidate started,
 * the selected project ids and the answers. NEVER stored: scores, ranking, support, shortlist, branch, next question,
 * recommendation. They are recomputed by replaying the answers through the same reducer the live flow uses, so stored
 * derived state cannot go stale.
 *
 * The key and the `flow: "v2"` marker are separate from V1 (`colman-studymatch:comparison`), so V1 storage can never
 * be read as a V2 journey or vice versa. Anything malformed, unknown or inconsistent with the current content restores
 * to null (the caller clears it and starts over) instead of throwing.
 */

export const DISCOVERY_STORAGE_KEY = "colman-studymatch:v2:journey";
export const DISCOVERY_STORAGE_VERSION = 1;

const StoredDiscoverySchema = z.strictObject({
  version: z.literal(DISCOVERY_STORAGE_VERSION),
  flow: z.literal("v2"),
  phase: z.enum(["selecting", "answering"]),
  selectedProjectIds: z.array(z.string()).max(MAX_SELECTED_PROJECTS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

export type StoredDiscovery = z.infer<typeof StoredDiscoverySchema>;

/** The durable slice, or null when there is nothing worth keeping (the entry is removed). */
export function toStoredDiscovery(state: DiscoveryState): StoredDiscovery | null {
  if (state.selectedProjectIds.length === 0 && state.answers.length === 0 && state.phase === "selecting") return null;
  return {
    version: DISCOVERY_STORAGE_VERSION,
    flow: "v2",
    phase: state.phase,
    selectedProjectIds: [...state.selectedProjectIds],
    answers: state.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  };
}

export function serializeDiscovery(state: DiscoveryState): string | null {
  const stored = toStoredDiscovery(state);
  return stored ? JSON.stringify(stored) : null;
}

/** Rebuild a state by replaying the stored selection and answers through the reducer. Null if anything is invalid. */
export function restoreDiscovery(raw: string | null): DiscoveryState | null {
  if (raw === null) return null;
  try {
    const parsed = StoredDiscoverySchema.safeParse(JSON.parse(raw));
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
      if (next.answers.length !== state.answers.length + 1) return null; // wrong question, unknown option, past the end
      state = next;
    }
    return state;
  } catch {
    return null;
  }
}
