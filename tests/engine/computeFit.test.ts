import { describe, expect, it } from "vitest";
import { computeFit, dimensionRange, evaluateRealityChecks, buildCandidateVector, type FitInput } from "@/engine";
import { getProgramInputs } from "@/data";
import {
  ALL_PILOT,
  answer,
  fitInput,
  Q1_PROJECT_CHOICE as Q1,
  Q2_DESIRED_OUTCOME as Q2,
  Q3_MATH_TOLERANCE as Q3,
  SYN_CSDS_1,
  SYN_CSDS_2,
  SYN_CSDS_3,
} from "./fixtures";
import { SANITY_CASES } from "./sanityCases";

const sanity = (id: string) => {
  const found = SANITY_CASES.find((candidate) => candidate.id === id)!;
  return fitInput(found.answers, found.programs);
};

describe("computeFit result contract", () => {
  it("is deterministic", () => {
    expect(computeFit(sanity("mixed_three_way"))).toEqual(computeFit(sanity("mixed_three_way")));
  });

  it("returns every selected program in the ranking and the top two as the main decision", () => {
    const result = computeFit(sanity("persona_b_ds"));
    expect(result.ranking.map((p) => p.programId).sort()).toEqual([...ALL_PILOT].sort());
    expect(result.mainDecision).toEqual([result.ranking[0]!.programId, result.ranking[1]!.programId]);
    expect(result.bestFitProgram).toBe(result.ranking[0]!.programId);
    expect(result.secondaryProgram).toBe(result.ranking[1]!.programId);
  });

  it("never emits candidate-facing prose or percentage strings", () => {
    expect(JSON.stringify(computeFit(sanity("persona_a_cs")))).not.toMatch(/%/);
  });
});

describe("no_strong_fit (DEC-010)", () => {
  it("sets bestFitProgram null but keeps ranking and top-two information", () => {
    const result = computeFit(sanity("persona_d_no_fit"));
    expect(result.fitClassification).toBe("no_strong_fit");
    expect(result.bestFitProgram).toBeNull();
    expect(result.secondaryProgram).toBeNull();
    expect(result.mainDecision).toHaveLength(2);
    expect(result.ranking).toHaveLength(3);
  });

  it("is not overridden by a near tie", () => {
    // Identical programs + only neutral answers: gap 0 (near tie) and nothing fits.
    const twins = getProgramInputs(["computer_science", "computer_science"]).map((p, i) => ({ ...p, id: `twin_${i}` }));
    const result = computeFit({
      programs: twins,
      answers: [answer(SYN_CSDS_1, "neither"), answer(SYN_CSDS_2, "neither")],
    });
    expect(result.nearTie).toBe(true);
    expect(result.fitClassification).toBe("no_strong_fit");
    expect(result.bestFitProgram).toBeNull();
  });

  it("is the outcome when no questions have been answered", () => {
    const result = computeFit(fitInput([]));
    expect(result.fitClassification).toBe("no_strong_fit");
    expect(result.ranking.every((p) => !p.hasUsableSignal)).toBe(true);
  });
});

describe("near tie (PROPOSED DEC-018)", () => {
  it("flags a top-two gap below 0.05 without forcing or hiding the leader", () => {
    const result = computeFit(sanity("mixed_cs_ds"));
    const gap = result.ranking[0]!.normalizedFit - result.ranking[1]!.normalizedFit;
    expect(gap).toBeLessThan(0.05);
    expect(result.nearTie).toBe(true);
    expect(result.bestFitProgram).not.toBeNull();
  });

  it("does not flag a clear lead", () => {
    const result = computeFit(sanity("mirrored_cs_ds"));
    expect(result.ranking[0]!.normalizedFit - result.ranking[1]!.normalizedFit).toBeGreaterThanOrEqual(0.05);
    expect(result.nearTie).toBe(false);
  });
});

describe("evidence", () => {
  it("covers every answered question, including answers that work against #1", () => {
    const input = sanity("mixed_cs_ds");
    const result = computeFit(input);
    expect(result.evidence).toHaveLength(input.answers.length);
    expect(result.evidence.some((item) => item.direction === "supports_second")).toBe(true);
    expect(result.evidence.some((item) => item.direction === "supports_top")).toBe(true);
  });

  it("is ordered by decisiveness and decomposes the top-two gap exactly", () => {
    const result = computeFit(sanity("mixed_three_way"));
    const magnitudes = result.evidence.map((item) => Math.abs(item.topVsSecond));
    expect(magnitudes).toEqual([...magnitudes].sort((x, y) => y - x));
    const [top, second] = result.ranking;
    const sum = result.evidence.reduce((total, item) => total + item.topVsSecond, 0);
    expect(sum).toBeCloseTo(top!.rawFit / top!.idealFit - second!.rawFit / second!.idealFit, 12);
  });

  it("gives per-program contributions that sum to each program's raw fit", () => {
    const result = computeFit(sanity("persona_c_mis"));
    for (const program of result.ranking) {
      const sum = result.evidence.reduce(
        (total, item) => total + item.contributions[program.programId]!.contribution,
        0,
      );
      expect(sum).toBeCloseTo(program.rawFit, 9);
    }
  });
});

describe("trade-off", () => {
  it("names the top two and orders signed dimension deltas that sum to the normalized gap", () => {
    const result = computeFit(sanity("persona_b_ds"));
    const { tradeoff, ranking } = result;
    expect([tradeoff.topProgram, tradeoff.secondProgram]).toEqual(result.mainDecision);
    const deltas = tradeoff.decidingDimensions.map((d) => d.delta);
    expect(deltas).toEqual([...deltas].sort((x, y) => y - x));
    expect(deltas.reduce((t, v) => t + v, 0)).toBeCloseTo(
      ranking[0]!.rawFit / ranking[0]!.idealFit - ranking[1]!.rawFit / ranking[1]!.idealFit,
      12,
    );
    expect(tradeoff.decidingDimensions[0]!.dimension).toBe("data_modeling");
  });
});

describe("reality checks", () => {
  const mathCheck = [
    { id: "math_check", programId: "computer_science", relatedDimensions: ["math_affinity"] as const },
  ];
  const topTwo = ["computer_science", "data_science"];

  it("uses min + (max − min) / 3 of the attainable range, not max / 3", () => {
    // Q1 (math 0 or +0.5 ×3) and Q3 (−2…+2 ×1.5): range [−3, 4.5], threshold −0.5 (max/3 would be 1.5).
    const answers = [answer(Q1, "A"), answer(Q3, "3")];
    expect(dimensionRange(answers, "math_affinity")).toEqual({ min: -3, max: 4.5 });
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, mathCheck)).toEqual([]);

    const low = [answer(Q1, "A"), answer(Q3, "2")];
    const [triggered] = evaluateRealityChecks(low, buildCandidateVector(low), topTwo, mathCheck);
    expect(triggered!.triggeredDimensions[0]).toEqual({
      dimension: "math_affinity",
      value: -1.5,
      min: -3,
      max: 4.5,
      threshold: -0.5,
    });
  });

  it("requires net-negative evidence: not choosing a dimension's options is not 'materially low'", () => {
    // statistical_thinking: range [0, 6], value 0 is in the bottom third but not negative.
    const answers = [answer(Q1, "A"), answer(Q2, "A")];
    const statsCheck = [
      { id: "stats", programId: "computer_science", relatedDimensions: ["statistical_thinking"] as const },
    ];
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, statsCheck)).toEqual([]);
  });

  it("never triggers on a dimension without attainable variation", () => {
    const answers = [answer(Q3, "1")];
    const check = [{ id: "sp", programId: "computer_science", relatedDimensions: ["systems_process"] as const }];
    expect(dimensionRange(answers, "systems_process")).toEqual({ min: 0, max: 0 });
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, check)).toEqual([]);
  });

  it("is evaluated only for the top two programs", () => {
    const answers = [answer(Q1, "A"), answer(Q3, "1")];
    const check = [
      { id: "mis_math", programId: "management_information_systems", relatedDimensions: ["math_affinity"] as const },
    ];
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, check)).toEqual([]);
  });

  it("never modifies fit scores or ranking", () => {
    const input = sanity("low_math_cs");
    const withChecks = computeFit(input);
    const withoutChecks = computeFit({ ...input, realityChecks: [] } satisfies FitInput);
    expect(withChecks.realityChecks.length).toBeGreaterThan(0);
    expect({ ...withChecks, realityChecks: [] }).toEqual(withoutChecks);
  });
});

describe("input validation", () => {
  const base = fitInput([answer(Q1, "A")]);

  it("rejects fewer than two programs", () => {
    expect(() => computeFit({ ...base, programs: base.programs.slice(0, 1) })).toThrow(/two programs/);
  });

  it("rejects an answer that is not an option of its question", () => {
    expect(() => computeFit(fitInput([answer(Q1, "Z")]))).toThrow(/not an option/);
  });

  it("rejects a question answered twice", () => {
    expect(() => computeFit(fitInput([answer(Q1, "A"), answer(Q1, "B")]))).toThrow(/more than once/);
  });

  it("rejects unknown dimensions in signals", () => {
    const bad = { id: "BAD", type: "tradeoff" as const, options: [{ id: "x", signals: { likes_tech: 1 } as never }] };
    expect(() => computeFit(fitInput([answer(bad, "x")]))).toThrow(/unknown dimension/);
  });

  it("rejects programs with incomplete vectors", () => {
    const [cs, ds] = base.programs;
    const broken = { ...cs!, vector: { ...cs!.vector, bridge_role: Number.NaN } };
    expect(() => computeFit({ ...base, programs: [broken, ds!] })).toThrow(/bridge_role/);
  });
});

describe("pair-question fixtures are only synthetic", () => {
  it("are labelled SYN_ so they cannot be mistaken for the THI-8 question bank", () => {
    for (const question of [SYN_CSDS_1, SYN_CSDS_2, SYN_CSDS_3]) {
      expect(question.id.startsWith("SYN_")).toBe(true);
    }
  });
});
