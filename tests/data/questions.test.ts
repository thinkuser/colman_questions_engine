import { describe, expect, it } from "vitest";
import raw from "@/data/content/question_bank.json";
import {
  assertPairCoverage,
  buildQuestionBank,
  PROGRAM_IDS,
  QUESTION_BANK,
  QUESTION_TEXT_EN,
  V1_PILOT_PAIRS,
  type QuestionBankFile,
} from "@/data";
import { getBankQuestion, mathToleranceSignal } from "@/engine";

const signalsOf = (questionId: string) =>
  Object.fromEntries(getBankQuestion(QUESTION_BANK, questionId).options.map((option) => [option.id, option.signals]));
const clone = () => JSON.parse(JSON.stringify(raw)) as QuestionBankFile;

describe("V1 question bank — approved signals (DEC-021)", () => {
  it("asks the three documented opening questions first", () => {
    expect(QUESTION_BANK.openingQuestionIds).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("keeps the documented opening signals and types", () => {
    expect(getBankQuestion(QUESTION_BANK, "Q1").type).toBe("scenario");
    expect(signalsOf("Q1")).toEqual({
      A: { software_building: 2, coding_depth: 1, abstract_problem_solving: 1 },
      B: { data_modeling: 2, statistical_thinking: 1, math_affinity: 0.5 },
      C: { business_context: 1.5, systems_process: 1.5, bridge_role: 2 },
    });
    expect(getBankQuestion(QUESTION_BANK, "Q2").type).toBe("tradeoff");
    expect(signalsOf("Q2")).toEqual({
      A: { software_building: 2, coding_depth: 1 },
      B: { data_modeling: 2, statistical_thinking: 1 },
      C: { business_context: 1.5, systems_process: 1.5, bridge_role: 1 },
    });
  });

  it("maps Q3 with mathToleranceSignal as a self_rating (DEC-020)", () => {
    const q3 = getBankQuestion(QUESTION_BANK, "Q3");
    expect(q3.type).toBe("self_rating");
    for (const option of q3.options) {
      expect(option.signals).toEqual({ math_affinity: mathToleranceSignal(Number(option.id)) });
    }
  });

  it.each([
    [
      "CSDS-1",
      "tradeoff",
      { abstract_problem_solving: 2, coding_depth: 1 },
      { data_modeling: 2, statistical_thinking: 1 },
    ],
    ["CSDS-2", "scenario", { software_building: 2, coding_depth: 1 }, { data_modeling: 2, statistical_thinking: 1 }],
    [
      "CSDS-3",
      "preference",
      { abstract_problem_solving: 1, coding_depth: 1, software_building: 1 },
      { statistical_thinking: 1.5, data_modeling: 1.5 },
    ],
    [
      "CSMIS-1",
      "preference",
      { software_building: 2, abstract_problem_solving: 1 },
      { bridge_role: 2, business_context: 1 },
    ],
    ["CSMIS-2", "scenario", { software_building: 2, coding_depth: 1 }, { systems_process: 1.5, bridge_role: 1.5 }],
    [
      "CSMIS-3",
      "tradeoff",
      { abstract_problem_solving: 1.5, coding_depth: 0.5 },
      { bridge_role: 1.5, systems_process: 0.5 },
    ],
    ["DSMIS-1", "tradeoff", { data_modeling: 2, statistical_thinking: 1 }, { business_context: 2, systems_process: 1 }],
    [
      "DSMIS-2",
      "scenario",
      { data_modeling: 1.5, statistical_thinking: 1, math_affinity: 0.5 },
      { bridge_role: 2, business_context: 1 },
    ],
    [
      "DSMIS-3",
      "preference",
      { data_modeling: 1.5, statistical_thinking: 1.5 },
      { bridge_role: 2, business_context: 1 },
    ],
  ])("%s is a %s question with the approved A/B signals and a neutral option", (id, type, optionA, optionB) => {
    const question = getBankQuestion(QUESTION_BANK, id);
    expect(question.type).toBe(type);
    expect(question.role).toBe("pair");
    expect(question.options.map((option) => option.signals)).toEqual([optionA, optionB, {}]);
    expect(question.options[2]).toMatchObject({ id: "neither", favours: null });
  });

  it.each([
    ["TB-CSDS", { cs: { abstract_problem_solving: 2 }, ds: { statistical_thinking: 2 } }],
    ["TB-CSMIS", { cs: { coding_depth: 2 }, mis: { systems_process: 1, bridge_role: 1 } }],
    ["TB-DSMIS", { ds: { data_modeling: 2 }, mis: { business_context: 2 } }],
  ])("%s is the approved tradeoff tie-breaker without a neutral option", (id, expected) => {
    const question = getBankQuestion(QUESTION_BANK, id);
    expect(question).toMatchObject({ role: "tie_breaker", type: "tradeoff" });
    expect(signalsOf(id)).toEqual(expected);
    expect(question.options.every((option) => option.favours !== null)).toBe(true);
  });

  it("has one branch per pilot pair, each with three pair questions and a tie-breaker", () => {
    expect(QUESTION_BANK.branches.map((b) => [...b.programs].sort().join("|")).sort()).toEqual([
      "computer_science|data_science",
      "computer_science|management_information_systems",
      "data_science|management_information_systems",
    ]);
  });

  it("only lets branch options favour that branch's programs (no irrelevant questions)", () => {
    for (const branch of QUESTION_BANK.branches) {
      for (const id of [...branch.pairQuestionIds, branch.tieBreakerId]) {
        for (const option of getBankQuestion(QUESTION_BANK, id).options) {
          expect(option.favours === null || branch.programs.includes(option.favours), `${id}/${option.id}`).toBe(true);
        }
      }
    }
  });

  it("keeps internal English reference text for every question and option", () => {
    for (const question of QUESTION_BANK.questions) {
      const text = QUESTION_TEXT_EN.get(question.id)!;
      expect(text.prompt.length).toBeGreaterThan(0);
      expect(Object.keys(text.options)).toEqual(question.options.map((option) => option.id));
    }
  });
});

describe("question bank validation", () => {
  it("accepts the shipped bank", () => {
    expect(() => buildQuestionBank(raw)).not.toThrow();
  });

  it("rejects an option favouring a program outside its branch", () => {
    const bank = clone();
    bank.questions.find((q) => q.id === "CSDS-1")!.options[0]!.favours = "management_information_systems";
    expect(() => buildQuestionBank(bank)).toThrow(/outside/);
  });

  it("rejects a pair question without exactly one neutral option", () => {
    const bank = clone();
    const question = bank.questions.find((q) => q.id === "DSMIS-2")!;
    question.options = question.options.filter((option) => option.id !== "neither");
    expect(() => buildQuestionBank(bank)).toThrow(/neutral/);
  });

  it("rejects a neutral option that carries a signal", () => {
    const bank = clone();
    (bank.questions.find((q) => q.id === "CSMIS-3")!.options[2]!.signals as Record<string, number>).bridge_role = 1;
    expect(() => buildQuestionBank(bank)).toThrow(/no signal/);
  });

  it("rejects unknown dimensions", () => {
    const bank = clone();
    (bank.questions[0]!.options[0]!.signals as Record<string, number>).likes_tech = 1;
    expect(() => buildQuestionBank(bank)).toThrow();
  });

  it("rejects an opening list that points at a pair question", () => {
    const bank = clone();
    bank.opening_question_ids[2] = "CSDS-1";
    expect(() => buildQuestionBank(bank)).toThrow(/role "opening"/);
  });
});

describe("scale-ready structure (DEC-023)", () => {
  it("does not require a curated branch for every program pair in the generic bank", () => {
    const bank = clone();
    bank.branches = bank.branches.slice(1);
    expect(() => buildQuestionBank(bank)).not.toThrow();
    expect(() => buildQuestionBank({ ...clone(), branches: [] })).not.toThrow();
  });

  it("does not require new branches when a program is added to the catalog", () => {
    expect(() => buildQuestionBank(raw, [...PROGRAM_IDS, "law", "psychology"])).not.toThrow();
  });

  it("still enforces V1 pilot coverage separately", () => {
    expect(() => assertPairCoverage(QUESTION_BANK, V1_PILOT_PAIRS)).not.toThrow();
    const partial = buildQuestionBank({ ...clone(), branches: clone().branches.slice(1) });
    expect(() => assertPairCoverage(partial, V1_PILOT_PAIRS)).toThrow(/no curated branch/);
  });

  it("lists the V1 pilot pairs explicitly rather than deriving all combinations", () => {
    expect(V1_PILOT_PAIRS).toHaveLength(3);
  });
});
