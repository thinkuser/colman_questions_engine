import type { FitResult, ProgramId } from "@/engine";
import { resultKind } from "@/flow";
import type { AnalyticsParams } from "./events";

/**
 * Parameter builders shared by every event. Pure, deterministic, no state.
 * Conventions (docs/ANALYTICS.md): program ids are stable internal ids; program lists, clusters and pairs use
 * canonical (alphabetical) order so the same selected set always produces the same value, whatever the
 * selection order or which program won.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmContext = Partial<Record<UtmKey, string>>;

const MAX_UTM_LENGTH = 100;

/** Alphabetical, de-duplicated program ids. */
export function canonicalProgramIds(ids: readonly ProgramId[]): ProgramId[] {
  return [...new Set(ids)].sort();
}

/** `a|b` with the two ids in canonical order, e.g. `computer_science|data_science`. */
export function canonicalPair(a: ProgramId, b: ProgramId): string {
  return canonicalProgramIds([a, b]).join("|");
}

/** All selected programs joined in canonical order. */
export function comparisonCluster(ids: readonly ProgramId[]): string {
  return canonicalProgramIds(ids).join("|");
}

/** Read UTM parameters from a query string: trimmed, control characters removed, length-capped, empties dropped. */
export function parseUtm(search: string): UtmContext {
  const query = new URLSearchParams(search);
  const utm: UtmContext = {};
  for (const key of UTM_KEYS) {
    const value = (query.get(key) ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, MAX_UTM_LENGTH);
    if (value) utm[key] = value;
  }
  return utm;
}

export function hasUtm(utm: UtmContext): boolean {
  return UTM_KEYS.some((key) => Boolean(utm[key]));
}

/** Common parameters: comparison id (when a comparison is running), selected programs, cluster, and UTM context. */
export function comparisonContext(input: {
  comparisonId: string | null;
  selectedProgramIds: readonly ProgramId[];
  utm: UtmContext;
}): AnalyticsParams {
  const ids = canonicalProgramIds(input.selectedProgramIds);
  const params: AnalyticsParams = {};
  if (input.comparisonId) params.comparison_id = input.comparisonId;
  if (ids[0]) params.program_1 = ids[0];
  if (ids[1]) params.program_2 = ids[1];
  if (ids[2]) params.program_3 = ids[2];
  params.selected_program_count = ids.length;
  if (ids.length > 0) params.comparison_cluster = ids.join("|");
  for (const key of UTM_KEYS) {
    const value = input.utm[key];
    if (value) params[key] = value;
  }
  return params;
}

/**
 * Result metadata used by completion and result-page events.
 * - `recommended_program` is the actual recommendation: present only when the engine has a best-fit program
 *   (never invented for no_strong_fit).
 * - `secondary_program` is analytical rank #2: the second member of `mainDecision`, which the engine keeps even for
 *   no_strong_fit. It is deliberately NOT the candidate-facing `secondaryProgram` field (null for no-fit).
 * - The pair is canonical, not winner-first.
 */
export function resultParams(result: FitResult): AnalyticsParams {
  const params: AnalyticsParams = {};
  if (result.bestFitProgram) params.recommended_program = result.bestFitProgram;
  params.secondary_program = result.mainDecision[1];
  params.main_decision_pair = canonicalPair(...result.mainDecision);
  params.fit_classification = result.fitClassification;
  params.result_kind = resultKind(result);
  return params;
}
