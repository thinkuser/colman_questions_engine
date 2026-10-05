import type { ProgramId, ProgramVector } from "@/engine";
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
