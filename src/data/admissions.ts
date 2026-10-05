import type { ProgramId } from "@/engine";
import computerScience from "./content/admissions/computer_science.json";
import dataScience from "./content/admissions/data_science.json";
import managementInformationSystems from "./content/admissions/management_information_systems.json";
import { PROGRAM_IDS } from "./programs";
import { ProgramAdmissionsSchema, type ProgramAdmissions } from "./schema";

/**
 * Official admission rules (layer 3). Deliberately NOT re-exported from `@/data`:
 * eligibility must never influence fit scoring (DEC-008). Import from `@/data/admissions` only
 * in admission-check features; the engine and fit layer are lint-blocked from importing this module.
 */
const RAW_ADMISSIONS: Record<ProgramId, unknown> = {
  computer_science: computerScience,
  data_science: dataScience,
  management_information_systems: managementInformationSystems,
};

const ADMISSIONS: ReadonlyMap<ProgramId, ProgramAdmissions> = new Map(
  PROGRAM_IDS.map((id) => {
    const admissions = ProgramAdmissionsSchema.parse(RAW_ADMISSIONS[id]);
    if (admissions.program_id !== id) {
      throw new Error(`Admissions registered as "${id}" declare program_id "${admissions.program_id}"`);
    }
    return [id, admissions];
  }),
);

export function getAdmissions(id: ProgramId): ProgramAdmissions | undefined {
  return ADMISSIONS.get(id);
}

/**
 * Gate for admission-check features (DEC-017): automated eligibility decisions are allowed only for
 * rules usable as published. Callers remain responsible for honouring `last_reviewed` freshness.
 * Never consult this from fit/scoring (DEC-008).
 */
export function isAutomatedEligibilityAllowed(admissions: ProgramAdmissions): boolean {
  return admissions.usage_status === "usable_as_published";
}
