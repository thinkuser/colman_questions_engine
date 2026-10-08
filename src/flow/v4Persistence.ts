import { z } from "zod";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import {
  BRAND_STRATEGY,
  canStartJourney,
  initialJourneyState,
  journeyReducer,
  WORLD_STRATEGY,
  type DiscoveryStrategy,
  type JourneyState,
} from "./journey";

/**
 * V4 (dual-entry) journey persistence (DEC-035). A separate key from V2 and V3, so no version ever reads, overwrites or
 * clears another's journey. Only the candidate's own actions are stored: the chosen entry mode (which discovery
 * strategy), the phase, the selection (in selection order) and the answers; everything derived is replayed.
 *
 * The entry mode is NOT evidence: it only selects the strategy (worlds -> WORLD_STRATEGY, projects -> BRAND_STRATEGY).
 */

export const V4_STORAGE_KEY = "colman-studymatch:v4:journey";
export const V4_STORAGE_VERSION = 1;

export type V4EntryMode = "worlds" | "projects";

export interface V4Journey {
  entryMode: V4EntryMode | null;
  journey: JourneyState;
}

export const initialV4Journey: V4Journey = { entryMode: null, journey: initialJourneyState };

export function strategyForEntryMode(mode: V4EntryMode | null): DiscoveryStrategy {
  return mode === "projects" ? BRAND_STRATEGY : WORLD_STRATEGY;
}

const StoredV4Schema = z.strictObject({
  version: z.literal(V4_STORAGE_VERSION),
  flow: z.literal("v4"),
  entryMode: z.enum(["worlds", "projects"]).nullable(),
  phase: z.enum(["selecting", "answering"]),
  selectedIds: z.array(z.string()).max(MAX_SELECTED_PROJECTS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

/** The durable slice, or null when there is nothing worth keeping. */
export function serializeV4Journey(value: V4Journey): string | null {
  const { entryMode, journey } = value;
  if (entryMode === null && journey.selectedIds.length === 0 && journey.answers.length === 0) return null;
  return JSON.stringify({
    version: V4_STORAGE_VERSION,
    flow: "v4",
    entryMode,
    phase: journey.phase,
    selectedIds: [...journey.selectedIds],
    answers: journey.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  });
}

/** Rebuild by replaying through the reducer of the stored entry mode's strategy. Null if anything is invalid. */
export function restoreV4Journey(raw: string | null): V4Journey | null {
  if (raw === null) return null;
  try {
    const parsed = StoredV4Schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const { entryMode, phase, selectedIds, answers } = parsed.data;
    if (entryMode === null) {
      // No method chosen yet: nothing else can exist.
      return selectedIds.length === 0 && answers.length === 0 && phase === "selecting" ? initialV4Journey : null;
    }
    const strategy = strategyForEntryMode(entryMode);
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
