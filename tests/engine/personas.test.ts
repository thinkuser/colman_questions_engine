import { describe, expect, it } from "vitest";
import { computeFit, type FitClassification, type ProgramId } from "@/engine";
import { fitInput } from "./fixtures";
import { SANITY_CASES } from "./sanityCases";

/**
 * Persona acceptance (docs/PERSONAS_AND_TESTS.md, THI-7 acceptance criteria) and sanity cases.
 * These VALIDATE the proposed DEC-018 thresholds against synthetic pair signals; they did not set them.
 * The expected table below is mirrored in docs/SCORING.md for review.
 */
const run = (id: string) => {
  const sanity = SANITY_CASES.find((candidate) => candidate.id === id)!;
  return computeFit(fitInput(sanity.answers, sanity.programs));
};

describe("THI-7 acceptance criteria", () => {
  it("Persona A ranks Computer Science first", () => {
    expect(run("persona_a_cs").ranking[0]!.programId).toBe("computer_science");
  });

  it("Persona B ranks Data Science first", () => {
    expect(run("persona_b_ds").ranking[0]!.programId).toBe("data_science");
  });

  it("Persona C ranks Management Information Systems first", () => {
    expect(run("persona_c_mis").ranking[0]!.programId).toBe("management_information_systems");
  });

  it("Persona D is no_strong_fit rather than a forced MIS recommendation", () => {
    const result = run("persona_d_no_fit");
    expect(result.fitClassification).toBe("no_strong_fit");
    expect(result.bestFitProgram).toBeNull();
  });

  it.each([
    ["low_math_cs", "computer_science", "cs_math_load"],
    ["low_math_ds", "data_science", "ds_math_statistics_programming"],
  ])(
    "%s: lowest math tolerance does not override repeated strong interest — %s stays first, with a reality check",
    (id, program, check) => {
      const result = run(id);
      expect(result.ranking[0]!.programId).toBe(program);
      expect(result.bestFitProgram).toBe(program);
      expect(result.fitClassification).not.toBe("no_strong_fit");
      expect(result.realityChecks.map((c) => c.id)).toContain(check);
    },
  );

  it("low math lowers fit but does not eliminate CS (signal, not gate)", () => {
    const high = run("persona_a_cs").ranking.find((p) => p.programId === "computer_science")!;
    const low = run("low_math_cs").ranking.find((p) => p.programId === "computer_science")!;
    expect(low.normalizedFit).toBeLessThan(high.normalizedFit);
    expect(low.normalizedFit).toBeGreaterThan(0);
    expect(low.rank).toBe(1);
  });
});

describe("sanity table (behaviour under PROPOSED thresholds and SYNTHETIC pair signals)", () => {
  const expected: Record<
    string,
    { order: ProgramId[]; classification: FitClassification; nearTie: boolean; checks: string[] }
  > = {
    persona_a_cs: {
      order: ["computer_science", "management_information_systems", "data_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: [],
    },
    persona_b_ds: {
      order: ["data_science", "management_information_systems", "computer_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: [],
    },
    persona_c_mis: {
      order: ["management_information_systems", "data_science", "computer_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: [],
    },
    persona_d_no_fit: {
      order: ["management_information_systems", "data_science", "computer_science"],
      classification: "no_strong_fit",
      nearTie: false,
      checks: ["ds_math_statistics_programming", "mis_technical_and_quantitative_load"],
    },
    low_math_cs: {
      order: ["computer_science", "management_information_systems", "data_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: ["cs_math_load", "mis_technical_and_quantitative_load"],
    },
    low_math_ds: {
      order: ["data_science", "management_information_systems", "computer_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: ["ds_math_statistics_programming", "mis_technical_and_quantitative_load"],
    },
    mixed_cs_ds: {
      order: ["data_science", "computer_science"],
      classification: "strong_fit",
      nearTie: true,
      checks: [],
    },
    mixed_three_way: {
      order: ["management_information_systems", "data_science", "computer_science"],
      classification: "good_fit",
      nearTie: false,
      checks: [],
    },
    weak_profile: {
      order: ["management_information_systems", "computer_science", "data_science"],
      classification: "no_strong_fit",
      nearTie: false,
      checks: [],
    },
    mirrored_cs_ds: {
      order: ["data_science", "computer_science"],
      classification: "strong_fit",
      nearTie: false,
      checks: [],
    },
  };

  it("covers every sanity case", () => {
    expect(Object.keys(expected).sort()).toEqual(SANITY_CASES.map((c) => c.id).sort());
  });

  it.each(SANITY_CASES.map((c) => c.id))("%s", (id) => {
    const result = run(id);
    const want = expected[id]!;
    expect(result.ranking.map((p) => p.programId)).toEqual(want.order);
    expect(result.fitClassification).toBe(want.classification);
    expect(result.nearTie).toBe(want.nearTie);
    expect(result.realityChecks.map((c) => c.id).sort()).toEqual([...want.checks].sort());
  });
});
