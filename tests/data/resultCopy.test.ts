import { describe, expect, it } from "vitest";
import {
  buildResultCopy,
  getFitProfile,
  getProgramFacts,
  PROGRAM_IDS,
  QUESTION_BANK,
  RESULT_COPY,
  type ResultCopySources,
} from "@/data";
import common from "@/data/content/result_copy/common.json";
import evidence from "@/data/content/result_copy/evidence.json";
import programs from "@/data/content/result_copy/programs.json";
import { DIMENSIONS } from "@/engine";

const sources: ResultCopySources = {
  bankQuestions: QUESTION_BANK.questions,
  programIds: PROGRAM_IDS,
  getFacts: getProgramFacts,
  getRealityCheckIds: (id) => (getFitProfile(id)?.reality_checks ?? []).map((check) => check.id),
};
const clone = <T>(value: T) => structuredClone(value) as T;
const build = (overrides: { common?: unknown; evidence?: unknown; programs?: unknown }) =>
  buildResultCopy({ common, evidence, programs, ...overrides }, sources);

describe("result copy covers the question bank and program data", () => {
  it("has candidate wording for every question/option combination, and nothing else", () => {
    const keys = QUESTION_BANK.questions.flatMap((q) => q.options.map((o) => `${q.id}/${o.id}`));
    expect([...RESULT_COPY.evidence.keys()].sort()).toEqual(keys.sort());
  });

  it("has result content, reality-check wording and an official page for every pilot program", () => {
    for (const id of PROGRAM_IDS) {
      const content = RESULT_COPY.program(id);
      expect(content.officialUrl).toMatch(/^https:\/\/www\.colman\.ac\.il\//);
      expect(content.learnThemes.length).toBeGreaterThanOrEqual(3);
      expect(content.learnThemes.length).toBeLessThanOrEqual(5);
      expect(content.whyColman.length).toBeGreaterThan(0);
      const checks = getFitProfile(id)!.reality_checks.map((c) => c.id);
      expect(Object.keys(content.realityCheckBodyHe).sort()).toEqual(checks.sort());
    }
  });

  it("shows official facts and course names verbatim (nothing invented)", () => {
    for (const id of PROGRAM_IDS) {
      const facts = getProgramFacts(id)!;
      const officialText = [
        ...facts.what_you_learn,
        ...facts.program_notes,
        ...facts.why_colman,
        ...facts.career_paths,
        ...facts.key_courses,
      ].map((f) => f.text_he);
      const content = RESULT_COPY.program(id);
      for (const theme of content.learnThemes) {
        for (const text of [...theme.facts, ...theme.courses]) expect(officialText).toContain(text);
      }
      for (const text of [...content.careers, ...content.whyColman]) expect(officialText).toContain(text);
    }
  });

  it("only offers a shared-first-year note where the official data has one", () => {
    expect(RESULT_COPY.program("computer_science").sharedFirstYearNote).toMatch(/\S/);
    expect(RESULT_COPY.program("data_science").sharedFirstYearNote).toMatch(/\S/);
    expect(RESULT_COPY.program("management_information_systems").sharedFirstYearNote).toBeNull();
  });

  it("has a plain-language phrase for every dimension and an axis for every pilot pair", () => {
    for (const dimension of DIMENSIONS) {
      expect(RESULT_COPY.dimensions[dimension].nounHe).toMatch(/[֐-׿]/);
    }
    expect(RESULT_COPY.pairAxis("data_science", "computer_science")).not.toBeNull();
    expect(RESULT_COPY.pairAxis("computer_science", "management_information_systems")).not.toBeNull();
    expect(RESULT_COPY.pairAxis("management_information_systems", "data_science")).not.toBeNull();
  });
});

describe("candidate copy hygiene", () => {
  const candidateStrings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(candidateStrings)
        : value && typeof value === "object"
          ? Object.entries(value)
              .filter(([key]) => key !== "status_note" && key !== "field" && key !== "starts_with")
              .flatMap(([, v]) => candidateStrings(v))
          : [];

  it("contains no percentages, decimals, enum names or dimension ids", () => {
    const forbidden = [
      /%/,
      /\d\.\d/,
      /strong_fit|good_fit|consider_carefully|no_strong_fit|normalized|raw_fit/,
      new RegExp(DIMENSIONS.join("|")),
    ];
    for (const text of [...candidateStrings(common), ...candidateStrings(evidence), ...candidateStrings(programs)]) {
      for (const pattern of forbidden) expect(text).not.toMatch(pattern);
    }
  });

  it("uses no score or percentage vocabulary", () => {
    for (const text of [...candidateStrings(common), ...candidateStrings(evidence)]) {
      expect(text).not.toMatch(/ציון|אחוז|% התאמה/);
    }
  });
});

describe("result copy validation rejects inconsistent data", () => {
  it("rejects missing and unknown evidence wording", () => {
    const missing = clone(evidence);
    delete (missing.answers as Record<string, string>)["Q1/A"];
    expect(() => build({ evidence: missing })).toThrow(/missing evidence wording for "Q1\/A"/);

    const unknown = clone(evidence);
    (unknown.answers as Record<string, string>)["Q9/Z"] = "x";
    expect(() => build({ evidence: unknown })).toThrow(/unknown answer "Q9\/Z"/);
  });

  it("rejects references to facts or courses that are not in the official data", () => {
    const badFact = clone(programs);
    badFact.programs.data_science.learn_themes[0]!.facts[0]!.starts_with = "טקסט שלא קיים באתר";
    expect(() => build({ programs: badFact })).toThrow(/matches 0 facts/);

    const badCourse = clone(programs);
    badCourse.programs.data_science.learn_themes[0]!.courses = ["קורס מומצא"];
    expect(() => build({ programs: badCourse })).toThrow(/not in the official course list/);
  });

  it("rejects missing or unknown reality-check wording and a missing program", () => {
    const missingCheck = clone(programs);
    missingCheck.programs.data_science.reality_checks = {} as never;
    expect(() => build({ programs: missingCheck })).toThrow(/missing reality-check wording/);

    const unknownCheck = clone(programs);
    (unknownCheck.programs.data_science.reality_checks as Record<string, unknown>)["nope"] = { body_he: "x" };
    expect(() => build({ programs: unknownCheck })).toThrow(/unknown check/);

    const missingProgram = clone(programs);
    delete (missingProgram.programs as Record<string, unknown>)["computer_science"];
    expect(() => build({ programs: missingProgram })).toThrow(/no result copy for program "computer_science"/);
  });

  it("rejects an incomplete dimension table", () => {
    const bad = clone(common);
    delete (bad.dimensions as Record<string, unknown>)["bridge_role"];
    expect(() => build({ common: bad })).toThrow();
  });
});
