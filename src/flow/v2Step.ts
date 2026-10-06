import {
  CAREER_PROJECTS,
  getProgramInputs,
  getRealityCheckInputs,
  PROGRAM_IDS,
  QUESTION_BANK,
  V2_CLUSTERS,
  V2_PROGRAM_CATALOG,
} from "@/data";
import {
  createV1TechPrecisionModule,
  nextV2Step,
  type PrecisionModuleAdapter,
  type ProgramId,
  type RecordedAnswer,
  type V2Step,
} from "@/engine";

/**
 * V2 routing wired to the real data (THI-14). The unchanged V1 CS/DS/MIS engine is registered as the `v1_tech`
 * precision module. UI, persistence and analytics integration are THI-16; this is the contract they will call.
 */

export const V1_TECH_PRECISION_MODULE: PrecisionModuleAdapter = createV1TechPrecisionModule({
  bank: QUESTION_BANK,
  programIds: PROGRAM_IDS,
  programInputs: getProgramInputs,
  realityChecks: getRealityCheckInputs,
});

/** Curated work statements per program (empty until THI-15 adds them). */
export const V2_WORK_STATEMENTS: Readonly<Record<ProgramId, readonly string[]>> = Object.fromEntries(
  V2_PROGRAM_CATALOG.map((program) => [program.id, program.workStatementsHe]),
);

/** Next V2 step for the selected projects (1-2, validated) and the answers so far. Throws on invalid answers. */
export function nextDiscoveryStep(input: {
  selectedProjectIds: readonly string[];
  answers: readonly RecordedAnswer[];
}): V2Step {
  return nextV2Step({
    projects: CAREER_PROJECTS,
    clusters: V2_CLUSTERS,
    workStatements: V2_WORK_STATEMENTS,
    precisionModules: [V1_TECH_PRECISION_MODULE],
    selectedProjectIds: input.selectedProjectIds,
    answers: input.answers,
  });
}
