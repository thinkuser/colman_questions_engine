/**
 * Candidate / program dimensions — the shared vector space of the fit engine.
 * Source of truth: docs/PROGRAM_MODEL.md. Do not add, remove, or rename without a recorded decision.
 */
export const DIMENSIONS = [
  "software_building",
  "data_modeling",
  "business_context",
  "math_affinity",
  "coding_depth",
  "statistical_thinking",
  "systems_process",
  "bridge_role",
  "abstract_problem_solving",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export function isDimension(value: string): value is Dimension {
  return (DIMENSIONS as readonly string[]).includes(value);
}
