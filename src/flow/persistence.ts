import { z } from "zod";
import { PROGRAM_IDS } from "@/data";
import type { ProgramId } from "@/engine";
import { comparisonReducer, initialComparisonState, type ComparisonState } from "./comparisonFlow";
import { MAX_SELECTED_PROGRAMS, isValidSelectionSize } from "./selection";

/**
 * Durable comparison state for refresh recovery. Only what the candidate chose is stored: the selected programs
 * and the recorded answers, plus a schema version. Scores, ranking, branch, next question and result are never
 * persisted; they are recomputed by the engine on restore so stored derived state cannot go stale.
 *
 * Anything malformed, unknown, or inconsistent with the current question bank restores to null (the caller
 * starts over) instead of throwing.
 */

export const COMPARISON_STORAGE_KEY = "colman-studymatch:comparison";
export const COMPARISON_STORAGE_VERSION = 1;

const StoredComparisonSchema = z.strictObject({
  version: z.literal(COMPARISON_STORAGE_VERSION),
  selectedProgramIds: z.array(z.string()).max(MAX_SELECTED_PROGRAMS),
  answers: z.array(z.strictObject({ questionId: z.string(), answerId: z.string() })),
});

export type StoredComparison = z.infer<typeof StoredComparisonSchema>;

/** The durable slice of the state, or null when there is nothing worth keeping (the storage entry is removed). */
export function toStoredComparison(state: ComparisonState): StoredComparison | null {
  if (state.selectedProgramIds.length === 0 && state.answers.length === 0) {
    return null;
  }
  return {
    version: COMPARISON_STORAGE_VERSION,
    selectedProgramIds: [...state.selectedProgramIds],
    answers: state.answers.map(({ questionId, answerId }) => ({ questionId, answerId })),
  };
}

export function serializeComparison(state: ComparisonState): string | null {
  const stored = toStoredComparison(state);
  return stored ? JSON.stringify(stored) : null;
}

/**
 * Rebuild a full state from a stored value by replaying the selection and answers through the same reducer the
 * live flow uses. Returns null if anything is invalid. With no answers the candidate returns to program
 * selection (selection kept); with answers the engine decides whether they are still mid-flow or complete.
 */
export function restoreComparison(raw: string | null): ComparisonState | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = StoredComparisonSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return null;
    }
    const { answers } = parsed.data;
    const selectedProgramIds = parsed.data.selectedProgramIds as ProgramId[];
    const known = new Set<string>(PROGRAM_IDS);
    const unique = new Set(selectedProgramIds).size === selectedProgramIds.length;
    if (!unique || !selectedProgramIds.every((id) => known.has(id))) {
      return null;
    }
    const selection: ComparisonState = { ...initialComparisonState, selectedProgramIds };
    if (answers.length === 0) {
      return selection;
    }
    if (!isValidSelectionSize(selectedProgramIds.length)) {
      return null;
    }
    let state = comparisonReducer(selection, { type: "start_questions" });
    for (const answer of answers) {
      const next = comparisonReducer(state, { type: "record_answer", answer });
      if (next.answers.length !== state.answers.length + 1) {
        return null; // wrong question, unknown option, or answers past the end of the flow
      }
      state = next;
    }
    return state;
  } catch {
    return null;
  }
}
