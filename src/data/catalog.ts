import { z } from "zod";
import type { ProgramId } from "@/engine";
import raw from "./content/catalog/programs.json";
import { getProgramFacts, PROGRAM_IDS } from "./programs";
import type { ProgramFacts, Source } from "./schema";
import { getSource } from "./sources";

/**
 * StudyMatch V2 program catalog (THI-13, DEC-029): identity and provenance for the 14 programs in V2 scope.
 *
 * Kept separate from the V1 pilot (`PROGRAM_IDS`, `PILOT_PROGRAMS`): the V1 comparison flow, persistence and engine
 * still see exactly the three pilot programs. The catalog reuses the same ids for those three and must agree with
 * their facts-layer names and qualifier.
 *
 * Content layers: `sources.colman` cites the academic layer (colman.ac.il), `sources.academy` the prospect-facing
 * layer (academy.org.il). Names and aliases must appear verbatim in an official degree heading of the program's own
 * cited pages, recorded in `catalog/verified_headings.json` (tests). Full-page snapshots are committed only for
 * sources that back verbatim facts. No academic facts are added for the new programs (`facts_status: pending_curation`).
 */

const nonEmpty = z.string().trim().min(1);
const programId = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected snake_case program id");
const sourceId = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected snake_case source id");

export const FACTS_STATUSES = ["verified_v1_pilot", "pending_curation"] as const;
export type FactsStatus = (typeof FACTS_STATUSES)[number];

export const CatalogProgramSchema = z.strictObject({
  program_id: programId,
  /** Candidate-facing canonical short name. */
  program_name_he: nonEmpty,
  /** Other official wordings of the name (e.g. page-title wording). */
  program_name_aliases_he: z.array(nonEmpty),
  /** Must be shown with the name wherever candidates see it, when non-null (DEC-015). */
  program_qualifier_he: nonEmpty.nullable(),
  /** Internal English label, not an official translation. */
  program_name_en: nonEmpty,
  sources: z.strictObject({ colman: z.array(sourceId).min(1), academy: z.array(sourceId) }),
  facts_status: z.enum(FACTS_STATUSES),
  /** "Day at work" statements for generated 2-/3-way focus questions (THI-15 content). */
  work_statements_he: z.array(nonEmpty),
});

export const CatalogFileSchema = z.strictObject({
  version: z.string(),
  status_note: z.string(),
  last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  programs: z.array(CatalogProgramSchema).min(1),
});

/** A catalog program. Structurally compatible with `ProgramSummary`, so name components can render it. */
export interface CatalogProgram {
  id: ProgramId;
  nameHe: string;
  aliasesHe: readonly string[];
  qualifierHe: string | null;
  nameEn: string;
  colmanSourceIds: readonly string[];
  academySourceIds: readonly string[];
  /** Official program pages, COLMAN first. */
  officialUrls: readonly string[];
  factsStatus: FactsStatus;
  workStatementsHe: readonly string[];
}

const LAYER_HOSTS = {
  colman: ["www.colman.ac.il", "colman.ac.il"],
  academy: ["www.academy.org.il", "academy.org.il"],
} as const;

export interface CatalogDependencies {
  getSource(id: string): Source | undefined;
  /** V1 pilot programs that already have verified facts; their identity must match. */
  pilotProgramIds: readonly ProgramId[];
  getPilotFacts(id: ProgramId): ProgramFacts | undefined;
}

const fail = (message: string): never => {
  throw new Error(`Invalid program catalog: ${message}`);
};

/** Validate the catalog file and convert it. Exported for tests. */
export function buildProgramCatalog(
  input: unknown,
  deps: CatalogDependencies = { getSource, pilotProgramIds: PROGRAM_IDS, getPilotFacts: getProgramFacts },
): CatalogProgram[] {
  const file = CatalogFileSchema.parse(input);
  const ids = file.programs.map((program) => program.program_id);
  if (new Set(ids).size !== ids.length) fail("duplicate program ids");

  for (const pilotId of deps.pilotProgramIds) {
    if (!ids.includes(pilotId)) fail(`V1 pilot program "${pilotId}" is missing from the catalog`);
  }

  return file.programs.map((program) => {
    const id = program.program_id;
    const names = [program.program_name_he, ...program.program_name_aliases_he];
    if (new Set(names).size !== names.length) fail(`${id}: an alias repeats the name or another alias`);
    if (program.program_qualifier_he !== null && names.includes(program.program_qualifier_he)) {
      fail(`${id}: the qualifier must add information, not repeat a name`);
    }
    if (new Set(program.work_statements_he).size !== program.work_statements_he.length) {
      fail(`${id}: duplicate work statements`);
    }

    const urls: string[] = [];
    for (const layer of ["colman", "academy"] as const) {
      for (const sourceIdValue of program.sources[layer]) {
        const source = deps.getSource(sourceIdValue) ?? fail(`${id}: unknown source "${sourceIdValue}"`);
        const host = new URL(source.url).hostname;
        if (!(LAYER_HOSTS[layer] as readonly string[]).includes(host)) {
          fail(`${id}: source "${sourceIdValue}" (${host}) is not on the ${layer} layer`);
        }
        urls.push(source.url);
      }
    }

    const isPilot = deps.pilotProgramIds.includes(id);
    if (isPilot !== (program.facts_status === "verified_v1_pilot")) {
      fail(`${id}: facts_status must be "verified_v1_pilot" exactly for V1 pilot programs`);
    }
    if (isPilot) {
      const facts = deps.getPilotFacts(id) ?? fail(`${id}: V1 facts not found`);
      if (facts.program_name_he !== program.program_name_he) fail(`${id}: name differs from V1 facts`);
      if (facts.program_qualifier_he !== program.program_qualifier_he) fail(`${id}: qualifier differs from V1 facts`);
      if (facts.program_name_en !== program.program_name_en) fail(`${id}: English name differs from V1 facts`);
      for (const alias of facts.program_name_aliases_he) {
        if (!program.program_name_aliases_he.includes(alias)) fail(`${id}: V1 alias "${alias}" is missing`);
      }
      for (const url of facts.official_urls) {
        if (!urls.includes(url)) fail(`${id}: V1 official URL ${url} is not cited`);
      }
    }

    return {
      id,
      nameHe: program.program_name_he,
      aliasesHe: program.program_name_aliases_he,
      qualifierHe: program.program_qualifier_he,
      nameEn: program.program_name_en,
      colmanSourceIds: program.sources.colman,
      academySourceIds: program.sources.academy,
      officialUrls: urls,
      factsStatus: program.facts_status,
      workStatementsHe: program.work_statements_he,
    };
  });
}

/** The V2 catalog, in display order. */
export const V2_PROGRAM_CATALOG: readonly CatalogProgram[] = buildProgramCatalog(raw);

/** All V2 program ids, in display order. The V1 pilot ids (`PROGRAM_IDS`) are a subset. */
export const V2_PROGRAM_IDS: readonly ProgramId[] = V2_PROGRAM_CATALOG.map((program) => program.id);

export function getCatalogProgram(id: ProgramId): CatalogProgram | undefined {
  return V2_PROGRAM_CATALOG.find((program) => program.id === id);
}
