import type { ProgramId, ProgramInput, ProgramVector, RealityCheckInput } from "@/engine";
import computerScience from "./content/fit/computer_science.json";
import dataScience from "./content/fit/data_science.json";
import managementInformationSystems from "./content/fit/management_information_systems.json";
import { PROGRAM_IDS } from "./programs";
import { ProgramFitProfileSchema, type ProgramFitProfile } from "./schema";

/**
 * Internal fit profiles (layer 2): editorial heuristics, not official facts.
 * Must never read admissions data (DEC-008) — enforced by lint.
 */
const RAW_FIT_PROFILES: Record<ProgramId, unknown> = {
  computer_science: computerScience,
  data_science: dataScience,
  management_information_systems: managementInformationSystems,
};

const FIT_PROFILES: ReadonlyMap<ProgramId, ProgramFitProfile> = new Map(
  PROGRAM_IDS.map((id) => {
    const profile = ProgramFitProfileSchema.parse(RAW_FIT_PROFILES[id]);
    if (profile.program_id !== id) {
      throw new Error(`Fit profile registered as "${id}" declares program_id "${profile.program_id}"`);
    }
    return [id, profile];
  }),
);

export function getFitProfile(id: ProgramId): ProgramFitProfile | undefined {
  return FIT_PROFILES.get(id);
}

/** Program vectors for the given programs, ready to hand to the engine. Unknown ids throw. */
export function getProgramVectors(ids: readonly ProgramId[]): Record<ProgramId, ProgramVector> {
  return Object.fromEntries(
    ids.map((id) => {
      const profile = FIT_PROFILES.get(id);
      if (!profile) {
        throw new Error(`No fit profile for program "${id}"`);
      }
      return [id, { ...profile.dimensions }];
    }),
  );
}

/** Engine program inputs (id + vector) for the selected programs, preserving selection order. */
export function getProgramInputs(ids: readonly ProgramId[]): ProgramInput[] {
  const vectors = getProgramVectors(ids);
  return ids.map((id) => ({ id, vector: vectors[id]! }));
}

/** Reality-check definitions for the selected programs, in the engine's generic input shape. */
export function getRealityCheckInputs(ids: readonly ProgramId[]): RealityCheckInput[] {
  return ids.flatMap((id) =>
    (FIT_PROFILES.get(id)?.reality_checks ?? []).map((check) => ({
      id: check.id,
      programId: id,
      relatedDimensions: check.related_dimensions,
    })),
  );
}
