import { describe, expect, it } from "vitest";
import { buildQuestionCopy, getQuestionCopyHe, QUESTION_BANK, QUESTION_COPY_HE } from "@/data";
import raw from "@/data/content/question_bank.json";
import copyRaw from "@/data/content/question_copy_he.json";

const HEBREW = /[֐-׿]/;
const NEUTRAL = "אף אחת מהאפשרויות לא ממש מושכת אותי";

describe("candidate-facing Hebrew question copy", () => {
  it("covers every question and option of the bank, in bank order", () => {
    expect([...QUESTION_COPY_HE.keys()].sort()).toEqual(QUESTION_BANK.questions.map((q) => q.id).sort());
    for (const question of QUESTION_BANK.questions) {
      const copy = getQuestionCopyHe(question.id);
      expect(copy.options.map((o) => o.id)).toEqual(question.options.map((o) => o.id));
    }
  });

  it("is Hebrew for every prompt and label", () => {
    for (const copy of QUESTION_COPY_HE.values()) {
      expect(copy.prompt).toMatch(HEBREW);
      for (const option of copy.options) {
        expect(option.label.length).toBeGreaterThan(0);
        // Q3 numeric anchors such as "2" are the only labels allowed to be digits only.
        if (!/^\d$/.test(option.label)) expect(option.label).toMatch(HEBREW);
      }
    }
  });

  it("uses the same neutral option on every pair question and never on other questions", () => {
    for (const question of QUESTION_BANK.questions) {
      const labels = getQuestionCopyHe(question.id).options.map((o) => o.label);
      expect(labels.includes(NEUTRAL)).toBe(question.role === "pair");
    }
  });

  it("keeps the neutral option last on pair questions", () => {
    for (const question of QUESTION_BANK.questions.filter((q) => q.role === "pair")) {
      const options = getQuestionCopyHe(question.id).options;
      expect(options[options.length - 1]!.label).toBe(NEUTRAL);
    }
  });

  it("keeps the Q3 scale 1 to 5 with anchors at both ends", () => {
    const options = getQuestionCopyHe("Q3").options;
    expect(options.map((o) => o.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(options[0]!.label).toMatch(HEBREW);
    expect(options[4]!.label).toMatch(HEBREW);
  });

  it("rejects missing, unknown, and neutral-option copy", () => {
    type CopyFile = { questions: Record<string, { prompt?: string; options: Record<string, string> }> };
    const clone = () => structuredClone(copyRaw) as unknown as CopyFile;

    const missingQuestion = clone();
    delete missingQuestion.questions["Q1"];
    expect(() => buildQuestionCopy(raw, missingQuestion)).toThrow(/missing Hebrew copy for question "Q1"/);

    const unknownQuestion = clone();
    unknownQuestion.questions["NOPE"] = { prompt: "x", options: {} };
    expect(() => buildQuestionCopy(raw, unknownQuestion)).toThrow(/unknown question "NOPE"/);

    const missingOption = clone();
    delete missingOption.questions["CSDS-1"]!.options["ds"];
    expect(() => buildQuestionCopy(raw, missingOption)).toThrow(/missing Hebrew copy for option "CSDS-1\/ds"/);

    const neutralOverride = clone();
    neutralOverride.questions["CSDS-1"]!.options["neither"] = "x";
    expect(() => buildQuestionCopy(raw, neutralOverride)).toThrow(/unknown or neutral option/);
  });
});
