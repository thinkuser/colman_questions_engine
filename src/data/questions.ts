import { z } from "zod";
import { DIMENSIONS, QUESTION_ROLES, QUESTION_TYPES, type BankQuestion, type QuestionBank } from "@/engine";
import raw from "./content/question_bank.json";
import copyRaw from "./content/question_copy_he.json";
import { PROGRAM_IDS } from "./programs";

/**
 * V1 question bank (DEC-021): opening questions, curated pair branches, neutral options, tie-breakers, with
 * explicit dimension signals. Validated at load so a malformed bank fails tests and the build.
 *
 * Scale note (DEC-023): curated pair branches are OPTIONAL OVERRIDES, not a structural requirement. The generic
 * bank may contain zero or more of them; adding a program does not imply authoring branches against every other
 * program. Only the V1 pilot pairs are required to be covered (`V1_PILOT_PAIRS`, checked separately below).
 * `favours` is V1 routing metadata; the durable scoring signal is the dimension vector.
 */

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const SignalsSchema = z.partialRecord(z.enum(DIMENSIONS), z.number());

const OptionSchema = z.object({
  id,
  label_en: z.string().trim().min(1),
  favours: z.string().nullable(),
  signals: SignalsSchema,
});

const QuestionSchema = z.object({
  id,
  role: z.enum(QUESTION_ROLES),
  type: z.enum(QUESTION_TYPES),
  prompt_en: z.string().trim().min(1),
  options: z.array(OptionSchema).min(2),
});

const BranchSchema = z.object({
  programs: z.tuple([z.string(), z.string()]),
  pair_question_ids: z.tuple([id, id, id]),
  tie_breaker_id: id,
});

export const QuestionBankFileSchema = z.object({
  version: z.string(),
  status_note: z.string(),
  opening_question_ids: z.tuple([id, id, id]),
  questions: z.array(QuestionSchema).min(1),
  /** Zero or more curated pair overrides (DEC-023). */
  branches: z.array(BranchSchema),
});

export type QuestionBankFile = z.infer<typeof QuestionBankFileSchema>;

const fail = (message: string): never => {
  throw new Error(`Invalid question bank: ${message}`);
};

/**
 * Validate structure and convert to the engine's QuestionBank shape. Exported for tests.
 * `programIds` is only used to reject branches that reference unknown programs; it does NOT require a branch
 * for every program pair (see `assertPairCoverage` for the V1 pilot requirement).
 */
export function buildQuestionBank(input: unknown, programIds: readonly string[] = PROGRAM_IDS): QuestionBank {
  const file = QuestionBankFileSchema.parse(input);
  const byId = new Map(file.questions.map((question) => [question.id, question]));
  if (byId.size !== file.questions.length) fail("duplicate question ids");

  for (const question of file.questions) {
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length) fail(`duplicate option ids in ${question.id}`);
  }

  const roleOf = (questionId: string, role: string) => {
    const question = byId.get(questionId) ?? fail(`unknown question "${questionId}"`);
    if (question.role !== role) fail(`${questionId} must have role "${role}"`);
    return question;
  };

  for (const questionId of file.opening_question_ids) {
    const question = roleOf(questionId, "opening");
    if (question.options.some((option) => option.favours !== null))
      fail(`opening question ${questionId} must not favour programs`);
  }

  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const branchKeys = new Set<string>();
  for (const branch of file.branches) {
    const [a, b] = branch.programs;
    for (const program of branch.programs) {
      if (!programIds.includes(program)) fail(`branch references unknown program "${program}"`);
    }
    if (a === b) fail("branch must compare two different programs");
    const key = pairKey(a, b);
    if (branchKeys.has(key)) fail(`duplicate branch for ${key}`);
    branchKeys.add(key);

    for (const questionId of branch.pair_question_ids) {
      const question = roleOf(questionId, "pair");
      // Relevance: every option favours one of this branch's programs, except exactly one neutral option.
      const favours = question.options.map((option) => option.favours);
      if (favours.some((program) => program !== null && !branch.programs.includes(program))) {
        fail(`${questionId} has an option favouring a program outside ${key}`);
      }
      if (favours.filter((program) => program === null).length !== 1) {
        fail(`${questionId} must have exactly one neutral ("neither") option`);
      }
      for (const program of branch.programs) {
        if (!favours.includes(program)) fail(`${questionId} has no option favouring ${program}`);
      }
      const neutral = question.options.find((option) => option.favours === null)!;
      if (Object.keys(neutral.signals).length > 0) fail(`${questionId} neutral option must carry no signal`);
    }

    const tieBreaker = roleOf(branch.tie_breaker_id, "tie_breaker");
    const tieFavours = tieBreaker.options.map((option) => option.favours);
    if ([...tieFavours].sort().join("|") !== key) {
      fail(`${branch.tie_breaker_id} must have exactly one option per program of ${key}`);
    }
  }

  const questions: BankQuestion[] = file.questions.map((question) => ({
    id: question.id,
    role: question.role,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, favours: option.favours, signals: option.signals })),
  }));

  return {
    questions,
    openingQuestionIds: file.opening_question_ids,
    branches: file.branches.map((branch) => ({
      programs: branch.programs,
      pairQuestionIds: branch.pair_question_ids,
      tieBreakerId: branch.tie_breaker_id,
    })),
  };
}

/**
 * V1 pilot coverage requirement (DEC-021/DEC-023): the current V1 flow routes only through curated branches, so
 * every pilot pair must have one. Listed explicitly — NOT derived from all combinations of PROGRAM_IDS.
 */
export const V1_PILOT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["computer_science", "data_science"],
  ["computer_science", "management_information_systems"],
  ["data_science", "management_information_systems"],
];

/** Throws unless each listed pair has a curated branch. */
export function assertPairCoverage(bank: QuestionBank, pairs: ReadonlyArray<readonly [string, string]>): void {
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const covered = new Set(bank.branches.map((branch) => key(...branch.programs)));
  for (const [a, b] of pairs) {
    if (!covered.has(key(a, b))) fail(`V1 pilot pair ${a} vs ${b} has no curated branch`);
  }
}

/** The validated V1 question bank, ready to hand to `nextAdaptiveStep`. */
export const QUESTION_BANK: QuestionBank = buildQuestionBank(raw);
assertPairCoverage(QUESTION_BANK, V1_PILOT_PAIRS);

/** Internal English reference copy (prompts/labels) for each question. Candidate-facing Hebrew copy: `QUESTION_COPY_HE`. */
export const QUESTION_TEXT_EN: ReadonlyMap<string, { prompt: string; options: Record<string, string> }> = new Map(
  QuestionBankFileSchema.parse(raw).questions.map((question) => [
    question.id,
    {
      prompt: question.prompt_en,
      options: Object.fromEntries(question.options.map((option) => [option.id, option.label_en])),
    },
  ]),
);

/** Shape of `content/question_copy_he.json` (THI-9). */
export const QuestionCopyFileSchema = z.object({
  version: z.string(),
  status_note: z.string(),
  neutral_option: z.string().trim().min(1),
  questions: z.record(
    z.string(),
    z.object({
      prompt: z.string().trim().min(1),
      options: z.record(z.string(), z.string().trim().min(1)),
    }),
  ),
});

export interface QuestionCopyHe {
  prompt: string;
  /** In bank option order (the neutral option is last, as in the bank). */
  options: ReadonlyArray<{ id: string; label: string }>;
}

/**
 * Join candidate-facing Hebrew copy to the bank and validate it is complete and exact: every question has a
 * prompt, every option has a label (neutral options of pair questions use `neutral_option`), and nothing in the
 * copy refers to a question or option the bank does not have. Exported for tests.
 */
export function buildQuestionCopy(bankInput: unknown, copyInput: unknown): ReadonlyMap<string, QuestionCopyHe> {
  const bank = QuestionBankFileSchema.parse(bankInput);
  const copyFile = QuestionCopyFileSchema.parse(copyInput);
  const bankIds = new Set(bank.questions.map((question) => question.id));
  for (const questionId of Object.keys(copyFile.questions)) {
    if (!bankIds.has(questionId)) fail(`Hebrew copy for unknown question "${questionId}"`);
  }

  const result = new Map<string, QuestionCopyHe>();
  for (const question of bank.questions) {
    const entry = copyFile.questions[question.id] ?? fail(`missing Hebrew copy for question "${question.id}"`);
    const isNeutral = (option: (typeof question.options)[number]) =>
      question.role === "pair" && option.favours === null;
    const expected = new Set(question.options.filter((option) => !isNeutral(option)).map((option) => option.id));
    for (const optionId of Object.keys(entry.options)) {
      if (!expected.has(optionId)) fail(`Hebrew copy for unknown or neutral option "${question.id}/${optionId}"`);
    }
    result.set(question.id, {
      prompt: entry.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        label: isNeutral(option)
          ? copyFile.neutral_option
          : (entry.options[option.id] ?? fail(`missing Hebrew copy for option "${question.id}/${option.id}"`)),
      })),
    });
  }
  return result;
}

/** Candidate-facing Hebrew question copy, keyed by question id. Presentation data only; never read by the engine. */
export const QUESTION_COPY_HE: ReadonlyMap<string, QuestionCopyHe> = buildQuestionCopy(raw, copyRaw);

export function getQuestionCopyHe(questionId: string): QuestionCopyHe {
  return QUESTION_COPY_HE.get(questionId) ?? fail(`no Hebrew copy for question "${questionId}"`);
}

/** The shared neutral option wording ("none of these really appeals to me"), reused by V2 generated focus questions. */
export const NEUTRAL_OPTION_HE: string = QuestionCopyFileSchema.parse(copyRaw).neutral_option;
