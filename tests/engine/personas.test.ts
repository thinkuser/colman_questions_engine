import { describe, expect, it } from "vitest";
import type { FitClassification, ProgramId, StopReason } from "@/engine";
import { CS, DS, MIS, runFlow } from "./fixtures";
import { SANITY_CASES } from "./sanityCases";

/**
 * Persona acceptance and sanity cases through the REAL adaptive flow (THI-7 + THI-8 acceptance criteria,
 * docs/PERSONAS_AND_TESTS.md). These VALIDATE the proposed DEC-018 thresholds; they did not set them.
 * The expected table below is mirrored in docs/SCORING.md for review.
 */
const run = (id: string) => {
  const sanity = SANITY_CASES.find((candidate) => candidate.id === id)!;
  return runFlow(sanity.programs, sanity.policy());
};

describe("acceptance criteria", () => {
  it("Persona A ranks Computer Science first", () => {
    expect(run("persona_a_cs").result.ranking[0]!.programId).toBe(CS);
  });

  it("Persona B ranks Data Science first", () => {
    expect(run("persona_b_ds").result.ranking[0]!.programId).toBe(DS);
  });

  it("Persona C ranks Management Information Systems first", () => {
    expect(run("persona_c_mis").result.ranking[0]!.programId).toBe(MIS);
  });

  it("Persona D, explicitly rejecting the offered directions, is no_strong_fit — no forced MIS", () => {
    const result = run("persona_d_no_fit");
    expect(result.result.fitClassification).toBe("no_strong_fit");
    expect(result.result.bestFitProgram).toBeNull();
    expect(result.tieBreakerUsed).toBe(false);
  });

  it("D′, who repeatedly chooses MIS-style answers, is a legitimate MIS fit with reality checks", () => {
    const result = run("persona_d_prime_mis").result;
    expect(result.bestFitProgram).toBe(MIS);
    expect(result.realityChecks.map((c) => c.id)).toContain("mis_technical_and_quantitative_load");
  });

  it.each([
    ["low_math_cs", CS, "cs_math_load"],
    ["low_math_ds", DS, "ds_math_statistics_programming"],
  ])("%s: lowest math tolerance does not override repeated strong interest — %s stays first", (id, program, check) => {
    const result = run(id).result;
    expect(result.bestFitProgram).toBe(program);
    expect(result.fitClassification).not.toBe("no_strong_fit");
    if (id === "low_math_cs") expect(result.realityChecks.map((c) => c.id)).toContain(check);
  });

  it("typical coherent personas finish in 5 questions", () => {
    for (const id of ["persona_a_cs", "persona_b_ds", "persona_c_mis"]) {
      expect(run(id).questionsAsked).toBe(5);
    }
  });
});

describe("sanity table (real bank, PROPOSED DEC-018 thresholds)", () => {
  const expected: Record<
    string,
    {
      n: number;
      order: ProgramId[];
      classification: FitClassification;
      nearTie: boolean;
      stop: StopReason;
      checks: string[];
    }
  > = {
    persona_a_cs: {
      n: 5,
      order: [CS, DS, MIS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
    persona_b_ds: {
      n: 5,
      order: [DS, MIS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
    persona_c_mis: {
      n: 5,
      order: [MIS, DS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
    persona_d_no_fit: {
      n: 6,
      order: [MIS, DS, CS],
      classification: "no_strong_fit",
      nearTie: false,
      stop: "no_strong_fit",
      checks: ["ds_math_statistics_programming", "mis_technical_and_quantitative_load"],
    },
    persona_d_prime_mis: {
      n: 5,
      order: [MIS, DS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: ["ds_math_statistics_programming", "mis_technical_and_quantitative_load"],
    },
    low_math_cs: {
      n: 5,
      order: [CS, MIS, DS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: ["cs_math_load", "mis_technical_and_quantitative_load"],
    },
    low_math_ds: {
      n: 5,
      order: [DS, CS, MIS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
    mixed_cs_ds: {
      n: 7,
      order: [DS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "tie_breaker_asked",
      checks: [],
    },
    mixed_three_way: {
      n: 6,
      order: [MIS, CS, DS],
      classification: "strong_fit",
      nearTie: false,
      stop: "clear_after_pair_3",
      checks: [],
    },
    weak_profile: {
      n: 6,
      order: [MIS, DS, CS],
      classification: "no_strong_fit",
      nearTie: false,
      stop: "no_strong_fit",
      checks: [],
    },
    persona_b_cs_ds_only: {
      n: 5,
      order: [DS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
    persona_c_cs_mis_only: {
      n: 5,
      order: [MIS, CS],
      classification: "strong_fit",
      nearTie: false,
      stop: "pair_answers_agree",
      checks: [],
    },
  };

  it("covers every sanity case", () => {
    expect(Object.keys(expected).sort()).toEqual(SANITY_CASES.map((c) => c.id).sort());
  });

  it.each(SANITY_CASES.map((c) => c.id))("%s", (id) => {
    const outcome = run(id);
    const want = expected[id]!;
    expect(outcome.questionsAsked).toBe(want.n);
    expect(outcome.result.ranking.map((p) => p.programId)).toEqual(want.order);
    expect(outcome.result.fitClassification).toBe(want.classification);
    expect(outcome.result.nearTie).toBe(want.nearTie);
    expect(outcome.stopReason).toBe(want.stop);
    expect(outcome.result.realityChecks.map((c) => c.id).sort()).toEqual([...want.checks].sort());
  });
});
