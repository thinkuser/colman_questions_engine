import { CAREER_PROJECTS } from "@/data";
import { buildCandidatePool, validateProjectSelection, type CandidatePool, type ProjectSelectionError } from "@/engine";

/**
 * Start a V2 discovery from the candidate's 1-2 chosen career projects (THI-13). Wires the V2 project data into the
 * pure discovery logic and returns the candidate pool, or the reasons the selection is invalid.
 * The pool is routing input only: there is no score here, and the V1 comparison flow is untouched.
 * Shortlisting, scoring and question routing over the pool are THI-14.
 */
export type DiscoveryStart = { ok: true; pool: CandidatePool } | { ok: false; errors: ProjectSelectionError[] };

export function startDiscovery(selectedProjectIds: readonly string[]): DiscoveryStart {
  const validation = validateProjectSelection(selectedProjectIds, CAREER_PROJECTS);
  if (!validation.ok) return validation;
  return { ok: true, pool: buildCandidatePool(validation.projectIds, CAREER_PROJECTS) };
}
