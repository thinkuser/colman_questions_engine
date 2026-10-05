import { z } from "zod";
import { DIMENSIONS } from "@/engine";

/**
 * Program data schema. Three layers, kept in separate files and modules:
 *   1. Official facts  — verbatim from official COLMAN sources, each item traceable to a source (DEC-012).
 *   2. Fit profile     — internal editorial heuristics (dimension vectors, positioning, reality checks).
 *   3. Admissions      — official admission rules, isolated from fit/scoring (DEC-008).
 * See docs/PROGRAM_DATA.md for curation and evidence rules.
 */

/** Only the official COLMAN properties documented in the repo may be cited. */
export const OFFICIAL_SOURCE_HOSTS = ["www.colman.ac.il", "colman.ac.il", "www.academy.org.il", "academy.org.il"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const programId = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected snake_case program id");
const sourceId = z.string().regex(/^[a-z][a-z0-9_]*$/, "expected snake_case source id");
const nonEmpty = z.string().trim().min(1);

export const SourceSchema = z.object({
  id: sourceId,
  url: z.url().refine((url) => OFFICIAL_SOURCE_HOSTS.includes(new URL(url).hostname), {
    message: "source must be an official COLMAN property",
  }),
  title_he: nonEmpty,
  retrieved_at: isoDate,
});

export const SourceRegistrySchema = z.object({ sources: z.array(SourceSchema).min(1) });

/**
 * An official fact. `text_he` is either a verbatim excerpt of a cited source, or a short display label
 * whose verbatim evidence is given in `quote_he`. Verified against source snapshots in tests.
 */
export const OfficialFactSchema = z.object({
  text_he: nonEmpty,
  quote_he: nonEmpty.optional(),
  source_ids: z.array(sourceId).min(1),
});

export const GroupedFactSchema = OfficialFactSchema.extend({
  /** Grouping label as presented on the source page (e.g. "קורסי בסיס"). Structural, not a fact. */
  group_he: nonEmpty,
});

export const ProgramNoteSchema = OfficialFactSchema.extend({
  /** Stable machine-readable topic, e.g. `shared_first_year`. */
  topic: z.string().regex(/^[a-z][a-z0-9_]*$/),
});

export const ProgramFactsSchema = z.object({
  program_id: programId,
  /** Short Hebrew display name; must appear verbatim on the program page. */
  program_name_he: nonEmpty,
  /** Other official spellings seen on official sources (sources are not always consistent). */
  program_name_aliases_he: z.array(nonEmpty),
  /** Internal English label (product docs), not an official translation. */
  program_name_en: nonEmpty,
  official_title: OfficialFactSchema,
  degree: z.enum(["BSc", "BA"]),
  faculty: OfficialFactSchema,
  official_urls: z.array(z.url()).min(1),
  short_description: OfficialFactSchema,
  what_you_learn: z.array(OfficialFactSchema),
  key_courses: z.array(GroupedFactSchema),
  career_paths: z.array(OfficialFactSchema),
  /** Not distinguished by current official sources — left empty rather than invented. */
  entry_level_roles: z.array(OfficialFactSchema),
  future_roles: z.array(OfficialFactSchema),
  /** Official "who is it for" statements. */
  ideal_for: z.array(OfficialFactSchema),
  why_colman: z.array(OfficialFactSchema),
  /** Structural facts that matter for decisions (double major, shared first year, disclaimers). */
  program_notes: z.array(ProgramNoteSchema),
  source_ids: z.array(sourceId).min(1),
  last_reviewed: isoDate,
});

const dimensionScore = z.number().int().min(1).max(5);

export const DimensionVectorSchema = z.strictObject(
  Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimensionScore])) as Record<
    (typeof DIMENSIONS)[number],
    typeof dimensionScore
  >,
);

export const RealityCheckSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Internal summary; candidate-facing Hebrew copy is written in the result experience (THI-10). */
  summary_en: nonEmpty,
  related_dimensions: z.array(z.enum(DIMENSIONS)).min(1),
  /** Official sources supporting the check. */
  evidence_source_ids: z.array(sourceId).min(1),
  /** Repo docs that specify the check. */
  doc_refs: z.array(nonEmpty).min(1),
});

export const ProgramFitProfileSchema = z.object({
  program_id: programId,
  /** Marks the whole layer as product-model heuristics, not official academic data. */
  basis: z.literal("editorial_heuristic"),
  /** 1–5 relative emphasis within the pilot set (docs/PROGRAM_MODEL.md). */
  dimensions: DimensionVectorSchema,
  positioning_shorthand_en: nonEmpty,
  less_suitable_for: z.array(nonEmpty),
  reality_checks: z.array(RealityCheckSchema),
  doc_refs: z.array(nonEmpty).min(1),
});

export const ProgramAdmissionsSchema = z.object({
  program_id: programId,
  rules: z.array(GroupedFactSchema).min(1),
  /** Sources that state the same rules (possibly with typographic differences). */
  corroborating_source_ids: z.array(sourceId),
  last_reviewed: isoDate,
});

export type Source = z.infer<typeof SourceSchema>;
export type OfficialFact = z.infer<typeof OfficialFactSchema>;
export type GroupedFact = z.infer<typeof GroupedFactSchema>;
export type ProgramNote = z.infer<typeof ProgramNoteSchema>;
export type ProgramFacts = z.infer<typeof ProgramFactsSchema>;
export type RealityCheckDefinition = z.infer<typeof RealityCheckSchema>;
export type ProgramFitProfile = z.infer<typeof ProgramFitProfileSchema>;
export type ProgramAdmissions = z.infer<typeof ProgramAdmissionsSchema>;
