import type { ProgramId } from "@/engine";
import computerScience from "./content/facts/computer_science.json";
import dataScience from "./content/facts/data_science.json";
import managementInformationSystems from "./content/facts/management_information_systems.json";
import { ProgramFactsSchema, type ProgramFacts } from "./schema";

/**
 * Official program facts (layer 1). To add a program: add `content/facts/<id>.json`,
 * `content/fit/<id>.json`, and `content/admissions/<id>.json`, then register it in each loader.
 */
const RAW_FACTS: Record<ProgramId, unknown> = {
  computer_science: computerScience,
  data_science: dataScience,
  management_information_systems: managementInformationSystems,
};

/** V1 pilot programs, in display order (DEC-013). */
export const PROGRAM_IDS: readonly ProgramId[] = ["computer_science", "data_science", "management_information_systems"];

const PROGRAM_FACTS: ReadonlyMap<ProgramId, ProgramFacts> = new Map(
  PROGRAM_IDS.map((id) => {
    const facts = ProgramFactsSchema.parse(RAW_FACTS[id]);
    if (facts.program_id !== id) {
      throw new Error(`Program facts registered as "${id}" declare program_id "${facts.program_id}"`);
    }
    return [id, facts];
  }),
);

export function getProgramFacts(id: ProgramId): ProgramFacts | undefined {
  return PROGRAM_FACTS.get(id);
}

export function listProgramFacts(): ProgramFacts[] {
  return PROGRAM_IDS.map((id) => PROGRAM_FACTS.get(id)!);
}

/** Lightweight view for selection/listing UI. */
export interface ProgramSummary {
  id: ProgramId;
  nameHe: string;
  nameEn: string;
}

export const PILOT_PROGRAMS: readonly ProgramSummary[] = listProgramFacts().map((facts) => ({
  id: facts.program_id,
  nameHe: facts.program_name_he,
  nameEn: facts.program_name_en,
}));

export function getProgramSummary(id: ProgramId): ProgramSummary | undefined {
  return PILOT_PROGRAMS.find((program) => program.id === id);
}
