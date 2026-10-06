import { z } from "zod";
import { DIMENSIONS, type Dimension, type ProgramId } from "@/engine";
import raw from "./content/question_bank.json";
import common from "./content/result_copy/common.json";
import evidence from "./content/result_copy/evidence.json";
import programsCopy from "./content/result_copy/programs.json";
import { getFitProfile } from "./fit";
import { getProgramFacts, PROGRAM_IDS } from "./programs";
import { QuestionBankFileSchema } from "./questions";
import type { ProgramFacts } from "./schema";

/**
 * Candidate-facing result copy (THI-10): structured presentation data, validated at load.
 * - evidence wording is keyed by "questionId/answerId" and must cover the whole question bank;
 * - dimension phrases, state copy, pair axes and the mirror are shared;
 * - per-program copy references official facts (what you learn, careers, why COLMAN) by exact text or a unique
 *   prefix, so nothing factual is invented; editorial labels, stories and reality-check wording are separate.
 * The engine never reads any of this. Candidate text must carry no numbers, scores, enum names or dimension ids.
 */

const text = z.string().trim().min(1);
const FactRefSchema = z.object({
  field: z.enum(["what_you_learn", "program_notes", "why_colman"]),
  starts_with: text.min(8),
});

const dimensionCopy = z.object({ noun_he: text, low_signal_he: text });

const CommonSchema = z.object({
  status_note: z.string(),
  dimensions: z.object(
    Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimensionCopy])) as Record<
      Dimension,
      typeof dimensionCopy
    >,
  ),
  states: z.object({
    recommended: z.object({
      eyebrow_he: text,
      fit_notes_he: z.object({ strong_fit: text, good_fit: text, consider_carefully: text }),
    }),
    near_tie: z.object({ eyebrow_he: text, heading_he: text, body_he: text }),
    no_strong_fit: z.object({ heading_he: text, body_he: text, alternatives_he: text, explore_he: text }),
  }),
  pair_axes: z.array(
    z.object({
      programs: z.tuple([z.string(), z.string()]),
      axis_he: text,
      sides_he: z.record(z.string(), text),
    }),
  ),
  mirror: z.object({ lead_he: text, and_he: text, less_he: text, no_fit_he: text }),
});

const EvidenceSchema = z.object({ status_note: z.string(), answers: z.record(z.string(), text) });

const ProgramCopySchema = z.object({
  positioning_he: text,
  learn_themes: z
    .array(z.object({ title_he: text, facts: z.array(FactRefSchema), courses: z.array(text) }))
    .min(3)
    .max(5),
  real_world: z.object({
    challenge_he: text,
    steps_he: z.array(text).min(3),
    supported_by: FactRefSchema,
  }),
  reality_checks: z.record(z.string(), z.object({ body_he: text })),
});

const ProgramsFileSchema = z.object({
  status_note: z.string(),
  programs: z.record(z.string(), ProgramCopySchema),
});

export type ResultDimensionCopy = { nounHe: string; lowSignalHe: string };
export type PairAxisCopy = { axisHe: string; sidesHe: Readonly<Record<string, string>> };

export interface ProgramResultContent {
  positioningHe: string;
  /** Editorial theme titles over verbatim official facts and course names. */
  learnThemes: ReadonlyArray<{ titleHe: string; facts: readonly string[]; courses: readonly string[] }>;
  realWorld: { challengeHe: string; stepsHe: readonly string[] };
  /** Official career-path labels, verbatim. Empty when the official page lists none. */
  careers: readonly string[];
  /** Official "why COLMAN" statements, verbatim. */
  whyColman: readonly string[];
  /** Verbatim official "shared first year" note, when the program has one (DEC-016). */
  sharedFirstYearNote: string | null;
  officialUrl: string;
  realityCheckBodyHe: Readonly<Record<string, string>>;
}

export interface ResultCopy {
  dimensions: Readonly<Record<Dimension, ResultDimensionCopy>>;
  states: z.infer<typeof CommonSchema>["states"];
  mirror: z.infer<typeof CommonSchema>["mirror"];
  /** Wording for each "questionId/answerId" the candidate can give. */
  evidence: ReadonlyMap<string, string>;
  pairAxis(a: ProgramId, b: ProgramId): PairAxisCopy | null;
  program(id: ProgramId): ProgramResultContent;
}

const fail = (message: string): never => {
  throw new Error(`Invalid result copy: ${message}`);
};

type FactField = z.infer<typeof FactRefSchema>["field"];

function factTexts(facts: ProgramFacts, field: FactField): string[] {
  return facts[field].map((fact) => fact.text_he);
}

function resolveFact(facts: ProgramFacts, ref: z.infer<typeof FactRefSchema>): string {
  const matches = factTexts(facts, ref.field).filter((value) => value.startsWith(ref.starts_with));
  if (matches.length !== 1) {
    fail(`${facts.program_id}: "${ref.starts_with}" matches ${matches.length} facts in ${ref.field} (need exactly 1)`);
  }
  return matches[0]!;
}

export interface ResultCopySources {
  bankQuestions: ReadonlyArray<{ id: string; options: ReadonlyArray<{ id: string }> }>;
  programIds: readonly ProgramId[];
  getFacts(id: ProgramId): ProgramFacts | undefined;
  getRealityCheckIds(id: ProgramId): readonly string[];
}

/** Validate result copy against the bank, the facts layer and the fit layer. Exported for tests. */
export function buildResultCopy(
  inputs: { common: unknown; evidence: unknown; programs: unknown },
  sources: ResultCopySources,
): ResultCopy {
  const commonCopy = CommonSchema.parse(inputs.common);
  const evidenceCopy = EvidenceSchema.parse(inputs.evidence);
  const programsFile = ProgramsFileSchema.parse(inputs.programs);

  // Evidence wording: exactly the bank's question/option combinations.
  const expectedKeys = new Set(
    sources.bankQuestions.flatMap((question) => question.options.map((option) => `${question.id}/${option.id}`)),
  );
  for (const key of expectedKeys) {
    if (!(key in evidenceCopy.answers)) fail(`missing evidence wording for "${key}"`);
  }
  for (const key of Object.keys(evidenceCopy.answers)) {
    if (!expectedKeys.has(key)) fail(`evidence wording for unknown answer "${key}"`);
  }

  for (const axis of commonCopy.pair_axes) {
    for (const program of axis.programs) {
      if (!sources.programIds.includes(program)) fail(`pair axis references unknown program "${program}"`);
      if (!(program in axis.sides_he)) fail(`pair axis ${axis.programs.join("/")} lacks a side for ${program}`);
    }
  }

  const programs = new Map<ProgramId, ProgramResultContent>();
  for (const id of sources.programIds) {
    const copy = programsFile.programs[id] ?? fail(`no result copy for program "${id}"`);
    const facts = sources.getFacts(id) ?? fail(`no facts for program "${id}"`);
    const courseTexts = new Set(facts.key_courses.map((course) => course.text_he));

    const checkIds = sources.getRealityCheckIds(id);
    for (const checkId of checkIds) {
      if (!(checkId in copy.reality_checks)) fail(`${id}: missing reality-check wording for "${checkId}"`);
    }
    for (const checkId of Object.keys(copy.reality_checks)) {
      if (!checkIds.includes(checkId)) fail(`${id}: reality-check wording for unknown check "${checkId}"`);
    }

    resolveFact(facts, copy.real_world.supported_by);
    programs.set(id, {
      positioningHe: copy.positioning_he,
      learnThemes: copy.learn_themes.map((theme) => {
        if (theme.facts.length === 0 && theme.courses.length === 0) fail(`${id}: empty theme "${theme.title_he}"`);
        for (const course of theme.courses) {
          if (!courseTexts.has(course)) fail(`${id}: course "${course}" is not in the official course list`);
        }
        return {
          titleHe: theme.title_he,
          facts: theme.facts.map((ref) => resolveFact(facts, ref)),
          courses: theme.courses,
        };
      }),
      realWorld: { challengeHe: copy.real_world.challenge_he, stepsHe: copy.real_world.steps_he },
      careers: facts.career_paths.map((career) => career.text_he),
      whyColman: facts.why_colman.map((item) => item.text_he),
      sharedFirstYearNote: facts.program_notes.find((note) => note.topic === "shared_first_year")?.text_he ?? null,
      officialUrl: facts.official_urls[0]!,
      realityCheckBodyHe: Object.fromEntries(Object.entries(copy.reality_checks).map(([k, v]) => [k, v.body_he])),
    });
  }
  for (const id of Object.keys(programsFile.programs)) {
    if (!sources.programIds.includes(id)) fail(`result copy for unknown program "${id}"`);
  }

  const axisKey = (a: string, b: string) => [a, b].sort().join("|");
  const axes = new Map(commonCopy.pair_axes.map((axis) => [axisKey(...axis.programs), axis]));

  return {
    dimensions: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        {
          nounHe: commonCopy.dimensions[dimension].noun_he,
          lowSignalHe: commonCopy.dimensions[dimension].low_signal_he,
        },
      ]),
    ) as Record<Dimension, ResultDimensionCopy>,
    states: commonCopy.states,
    mirror: commonCopy.mirror,
    evidence: new Map(Object.entries(evidenceCopy.answers)),
    pairAxis(a, b) {
      const axis = axes.get(axisKey(a, b));
      return axis ? { axisHe: axis.axis_he, sidesHe: axis.sides_he } : null;
    },
    program(id) {
      return programs.get(id) ?? fail(`no result content for program "${id}"`);
    },
  };
}

export const RESULT_COPY: ResultCopy = buildResultCopy(
  { common, evidence, programs: programsCopy },
  {
    bankQuestions: QuestionBankFileSchema.parse(raw).questions,
    programIds: PROGRAM_IDS,
    getFacts: getProgramFacts,
    getRealityCheckIds: (id) => (getFitProfile(id)?.reality_checks ?? []).map((check) => check.id),
  },
);
