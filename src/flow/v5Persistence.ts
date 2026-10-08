import { z } from "zod";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import {
  canStartJourney,
  initialJourneyState,
  journeyReducer,
  PROJECT_STRATEGY,
  WORLD_STRATEGY,
  type DiscoveryStrategy,
  type JourneyState,
} from "./journey";

/**
 * V5 (dual entry with balanced project-led discovery, DEC-037) journey persistence. Its own key, so V5 never reads,
 * overwrites or clears V2/V3/V4 storage, and no other version reads V5's. Only the candidate's own actions are stored:
 * the entry mode, the phase, the selection (in selection order) and the answers; everything derived is replayed.
 *
 * The entry mode is NOT evidence: it only selects the strategy (worlds -> WORLD_STRATEGY, the same strategy as V3/V4;
 * projects -> PROJECT_STRATEGY, the V5 balanced projects; never V2's BRAND_STRATEGY).
 */

export const V5_STORAGE_KEY = "colman-studymatch:v5:journey";
export const V5_STORAGE_VERSION = 1;

export type V5EntryMode = "worlds" | "projects";

export interface V5Journey {
  entryMode: V5EntryMode | null;
  journey: JourneyState;
}

export const initialV5Journey: V5Journey = { entryMode: null, journey: initialJourneyState };

export function strategyForV5EntryMode(mode: V5EntryMode | null): DiscoveryStrategy {
  return mode === "projects" ? PROJECT_STRATEGY : WORLD_STRATEGY;
}

const StoredV5Schema = z.strictObject({
  version: z.literal(V5_STORAGE_VERSION),
  flow: z.literal("v5"),
  entryMode: z.enum(["worlds", "projects"]).nullable(),
  phase: z.enum(["selecting", "answering"]),
  selectedIds: z.array(z.string()).max(MAX_SELECTED_PROJECTS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

/** The durable slice, or null when there is nothing worth keeping. */
export function serializeV5Journey(value: V5Journey): string | null {
  const { entryMode, journey } = value;
  if (entryMode === null && journey.selectedIds.length === 0 && journey.answers.length === 0) return null;
  return JSON.stringify({
    version: V5_STORAGE_VERSION,
    flow: "v5",
    entryMode,
    phase: journey.phase,
    selectedIds: [...journey.selectedIds],
    answers: journey.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  });
}

/** Rebuild by replaying through the reducer of the stored entry mode's strategy. Null if anything is invalid. */
export function restoreV5Journey(raw: string | null): V5Journey | null {
  if (raw === null) return null;
  try {
    const parsed = StoredV5Schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { entryMode, phase, selectedIds, answers } = parsed.data;
    if (entryMode === null) {
      // No method chosen yet: nothing else can exist.
      return selectedIds.length === 0 && answers.length === 0 && phase === "selecting" ? initialV5Journey : null;
    }
    const strategy = strategyForV5EntryMode(entryMode);
    if (new Set(selectedIds).size !== selectedIds.length) return null;
    if (!selectedIds.every((id) => strategy.entryIds.includes(id))) return null;

    let journey: JourneyState = initialJourneyState;
    for (const entryId of selectedIds) journey = journeyReducer(strategy, journey, { type: "toggle_entry", entryId });
    if (phase === "selecting") return answers.length === 0 ? { entryMode, journey } : null;
    if (!canStartJourney(strategy, journey)) return null;

    journey = journeyReducer(strategy, journey, { type: "start" });
    for (const answer of answers) {
      const next = journeyReducer(strategy, journey, { type: "record_answer", answer });
      if (next.answers.length !== journey.answers.length + 1) return null;
      journey = next;
    }
    return { entryMode, journey };
  } catch {
    return null;
  }
}
