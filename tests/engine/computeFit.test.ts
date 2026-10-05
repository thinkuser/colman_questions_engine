import { describe, expect, it } from "vitest";
import { getProgramInputs } from "@/data";
import { buildCandidateVector, computeFit, dimensionRange, evaluateRealityChecks, type FitInput } from "@/engine";
import { ALL_PILOT, answer, CS, DS, fitInput } from "./fixtures";

/** computeFit over explicit answer sets from the REAL question bank. */
const PERSONA_A = [
  answer("Q1", "A"),
  answer("Q2", "A"),
  answer("Q3", "5"),
  answer("CSDS-1", "cs"),
  answer("CSDS-2", "cs"),
];
const PERSONA_B = [
  answer("Q1", "B"),
  answer("Q2", "B"),
  answer("Q3", "4"),
  answer("CSDS-1", "ds"),
  answer("CSDS-2", "ds"),
];
const PERSONA_C = [
  answer("Q1", "C"),
  answer("Q2", "C"),
  answer("Q3", "3"),
  answer("DSMIS-1", "mis"),
  answer("DSMIS-2", "mis"),
];
const PERSONA_D = [
  answer("Q1", "C"),
  answer("Q2", "C"),
  answer("Q3", "1"),
  answer("DSMIS-1", "neither"),
  answer("DSMIS-2", "neither"),
  answer("DSMIS-3", "neither"),
];
const MIXED_THREE_WAY = [
  answer("Q1", "A"),
  answer("Q2", "C"),
  answer("Q3", "3"),
  answer("CSMIS-1", "mis"),
  answer("CSMIS-2", "cs"),
  answer("CSMIS-3", "mis"),
];
/** CS+DS selected: split pair answers — a near tie before the tie-breaker. */
const NEAR_TIE_CS_DS = [
  answer("Q1", "A"),
  answer("Q2", "B"),
  answer("Q3", "4"),
  answer("CSDS-1", "cs"),
  answer("CSDS-2", "ds"),
  answer("CSDS-3", "cs"),
];
/** CS+DS selected: mirrored answers that still lean DS clearly. */
const LEAN_DS = [
  answer("Q1", "A"),
  answer("Q2", "B"),
  answer("Q3", "4"),
  answer("CSDS-1", "cs"),
  answer("CSDS-2", "ds"),
];
const LOW_MATH_CS = [
  answer("Q1", "A"),
  answer("Q2", "A"),
  answer("Q3", "1"),
  answer("CSDS-1", "cs"),
  answer("CSDS-2", "cs"),
];

describe("computeFit result contract", () => {
  it("is deterministic", () => {
    expect(computeFit(fitInput(MIXED_THREE_WAY))).toEqual(computeFit(fitInput(MIXED_THREE_WAY)));
  });

  it("returns every selected program in the ranking and the top two as the main decision", () => {
    const result = computeFit(fitInput(PERSONA_B));
    expect(result.ranking.map((p) => p.programId).sort()).toEqual([...ALL_PILOT].sort());
    expect(result.mainDecision).toEqual([result.ranking[0]!.programId, result.ranking[1]!.programId]);
    expect(result.bestFitProgram).toBe(result.ranking[0]!.programId);
    expect(result.secondaryProgram).toBe(result.ranking[1]!.programId);
  });

  it("never emits candidate-facing prose or percentage strings", () => {
    expect(JSON.stringify(computeFit(fitInput(PERSONA_A)))).not.toMatch(/%/);
  });
});

describe("no_strong_fit (DEC-010)", () => {
  it("sets bestFitProgram null but keeps ranking and top-two information", () => {
    const result = computeFit(fitInput(PERSONA_D));
    expect(result.fitClassification).toBe("no_strong_fit");
    expect(result.bestFitProgram).toBeNull();
    expect(result.secondaryProgram).toBeNull();
    expect(result.mainDecision).toHaveLength(2);
    expect(result.ranking).toHaveLength(3);
  });

  it("is not overridden by a near tie", () => {
    // Identical programs + only neutral answers: gap 0 (near tie) and nothing fits.
    const twins = getProgramInputs([CS, CS]).map((p, i) => ({ ...p, id: `twin_${i}` }));
    const result = computeFit({ programs: twins, answers: [answer("CSDS-1", "neither"), answer("CSDS-2", "neither")] });
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
    const result = computeFit(fitInput(NEAR_TIE_CS_DS, [CS, DS]));
    expect(result.ranking[0]!.normalizedFit - result.ranking[1]!.normalizedFit).toBeLessThan(0.05);
    expect(result.nearTie).toBe(true);
    expect(result.bestFitProgram).not.toBeNull();
  });

  it("does not flag a clear lead", () => {
    const result = computeFit(fitInput(LEAN_DS, [CS, DS]));
    expect(result.ranking[0]!.normalizedFit - result.ranking[1]!.normalizedFit).toBeGreaterThanOrEqual(0.05);
    expect(result.nearTie).toBe(false);
  });
});

describe("evidence", () => {
  it("covers every answered question, including answers that work against #1", () => {
    const result = computeFit(fitInput(NEAR_TIE_CS_DS, [CS, DS]));
    expect(result.evidence).toHaveLength(NEAR_TIE_CS_DS.length);
    expect(result.evidence.some((item) => item.direction === "supports_second")).toBe(true);
    expect(result.evidence.some((item) => item.direction === "supports_top")).toBe(true);
  });

  it("is ordered by decisiveness and decomposes the top-two gap exactly", () => {
    const result = computeFit(fitInput(MIXED_THREE_WAY));
    const magnitudes = result.evidence.map((item) => Math.abs(item.topVsSecond));
    expect(magnitudes).toEqual([...magnitudes].sort((x, y) => y - x));
    const [top, second] = result.ranking;
    const sum = result.evidence.reduce((total, item) => total + item.topVsSecond, 0);
    expect(sum).toBeCloseTo(top!.rawFit / top!.idealFit - second!.rawFit / second!.idealFit, 12);
  });

  it("gives per-program contributions that sum to each program's raw fit", () => {
    const result = computeFit(fitInput(PERSONA_C));
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
    const result = computeFit(fitInput(PERSONA_B));
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
  const mathCheck = [{ id: "math_check", programId: CS, relatedDimensions: ["math_affinity"] as const }];
  const topTwo = [CS, DS];

  it("uses min + (max − min) / 3 of the attainable range, not max / 3", () => {
    // Q1 (math 0 or +0.5 ×3) and Q3 (−2…+2 ×1.5): range [−3, 4.5], threshold −0.5 (max/3 would be 1.5).
    const answers = [answer("Q1", "A"), answer("Q3", "3")];
    expect(dimensionRange(answers, "math_affinity")).toEqual({ min: -3, max: 4.5 });
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, mathCheck)).toEqual([]);

    const low = [answer("Q1", "A"), answer("Q3", "2")];
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
    const answers = [answer("Q1", "A"), answer("Q2", "A")];
    const statsCheck = [{ id: "stats", programId: CS, relatedDimensions: ["statistical_thinking"] as const }];
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, statsCheck)).toEqual([]);
  });

  it("never triggers on a dimension without attainable variation", () => {
    const answers = [answer("Q3", "1")];
    const check = [{ id: "sp", programId: CS, relatedDimensions: ["systems_process"] as const }];
    expect(dimensionRange(answers, "systems_process")).toEqual({ min: 0, max: 0 });
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, check)).toEqual([]);
  });

  it("is evaluated only for the top two programs", () => {
    const answers = [answer("Q1", "A"), answer("Q3", "1")];
    const check = [
      { id: "mis_math", programId: "management_information_systems", relatedDimensions: ["math_affinity"] as const },
    ];
    expect(evaluateRealityChecks(answers, buildCandidateVector(answers), topTwo, check)).toEqual([]);
  });

  it("never modifies fit scores or ranking", () => {
    const input = fitInput(LOW_MATH_CS);
    const withChecks = computeFit(input);
    const withoutChecks = computeFit({ ...input, realityChecks: [] } satisfies FitInput);
    expect(withChecks.realityChecks.length).toBeGreaterThan(0);
    expect({ ...withChecks, realityChecks: [] }).toEqual(withoutChecks);
  });
});

describe("input validation", () => {
  const base = fitInput([answer("Q1", "A")]);

  it("rejects fewer than two programs", () => {
    expect(() => computeFit({ ...base, programs: base.programs.slice(0, 1) })).toThrow(/two programs/);
  });

  it("rejects an answer that is not an option of its question", () => {
    expect(() => computeFit(fitInput([answer("Q1", "Z")]))).toThrow(/not an option/);
  });

  it("rejects a question answered twice", () => {
    expect(() => computeFit(fitInput([answer("Q1", "A"), answer("Q1", "B")]))).toThrow(/more than once/);
  });

  it("rejects unknown dimensions in signals", () => {
    const bad = { id: "BAD", type: "tradeoff" as const, options: [{ id: "x", signals: { likes_tech: 1 } as never }] };
    expect(() => computeFit(fitInput([{ question: bad, answerId: "x" }]))).toThrow(/unknown dimension/);
  });

  it("rejects programs with incomplete vectors", () => {
    const [cs, ds] = base.programs;
    const broken = { ...cs!, vector: { ...cs!.vector, bridge_role: Number.NaN } };
    expect(() => computeFit({ ...base, programs: [broken, ds!] })).toThrow(/bridge_role/);
  });
});
