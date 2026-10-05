import { describe, expect, it } from "vitest";
import {
  buildCandidateVector,
  classifyFit,
  DIMENSIONS,
  FIT_THRESHOLDS,
  idealFit,
  mathToleranceSignal,
  NEAR_TIE_MAX_GAP,
  QUESTION_TYPE_WEIGHTS,
  rawFit,
  scorePrograms,
  type AnsweredQuestion,
  type ProgramInput,
  type ProgramVector,
  type QuestionDefinition,
} from "@/engine";

/** Hand-checkable toy programs: all dimensions 1 except one emphasised dimension at 5. */
const vector = (emphasis: (typeof DIMENSIONS)[number]): ProgramVector =>
  Object.fromEntries(DIMENSIONS.map((d) => [d, d === emphasis ? 5 : 1])) as ProgramVector;
const BUILDER: ProgramInput = { id: "builder", vector: vector("software_building") };
const MODELER: ProgramInput = { id: "modeler", vector: vector("data_modeling") };

const X: QuestionDefinition = {
  id: "X",
  type: "tradeoff",
  options: [
    { id: "build", signals: { software_building: 1 } },
    { id: "model", signals: { data_modeling: 1 } },
  ],
};
/** Negative-only question: every option lowers fit for both programs. */
const Y: QuestionDefinition = {
  id: "Y",
  type: "preference",
  options: [
    { id: "not_build", signals: { software_building: -1 } },
    { id: "not_model", signals: { data_modeling: -1 } },
  ],
};
const a = (question: QuestionDefinition, answerId: string): AnsweredQuestion => ({ question, answerId });

describe("documented constants", () => {
  it("uses the weight classes from docs/QUESTION_ENGINE.md", () => {
    expect(QUESTION_TYPE_WEIGHTS).toEqual({
      scenario: 3,
      tradeoff: 3,
      preference: 2,
      self_rating: 1.5,
      career_label: 1,
    });
  });

  it("exposes the PROPOSED DEC-018 thresholds as named constants", () => {
    expect(FIT_THRESHOLDS).toEqual({ strong_fit: 0.8, good_fit: 0.65, consider_carefully: 0.5 });
    expect(NEAR_TIE_MAX_GAP).toBe(0.05);
  });

  it("maps math tolerance 1–5 to −2…+2 (DEC-020) and rejects other values", () => {
    expect([1, 2, 3, 4, 5].map(mathToleranceSignal)).toEqual([-2, -1, 0, 1, 2]);
    expect(() => mathToleranceSignal(0)).toThrow();
    expect(() => mathToleranceSignal(3.5)).toThrow();
  });
});

describe("candidate vector", () => {
  it("accumulates question weight × chosen-option signal per dimension", () => {
    const candidate = buildCandidateVector([a(X, "build"), a(Y, "not_model")]);
    expect(candidate.software_building).toBe(3); // tradeoff 3 × 1
    expect(candidate.data_modeling).toBe(-2); // preference 2 × −1
    expect(candidate.math_affinity).toBe(0);
  });

  it("is all zeros with no answers", () => {
    expect(Object.values(buildCandidateVector([]))).toEqual(DIMENSIONS.map(() => 0));
  });
});

describe("raw fit, attainable ideal, normalization", () => {
  it("computes raw fit as the candidate·program dot product", () => {
    const candidate = buildCandidateVector([a(X, "build")]);
    expect(rawFit(candidate, BUILDER.vector)).toBe(15); // 3 × 5
    expect(rawFit(candidate, MODELER.vector)).toBe(3); // 3 × 1
  });

  it("computes the ideal per question from the best option for each program", () => {
    expect(idealFit([a(X, "model")], BUILDER.vector)).toBe(15); // best option is "build" regardless of answer
    expect(idealFit([a(X, "model")], MODELER.vector)).toBe(15);
    expect(idealFit([a(Y, "not_build")], BUILDER.vector)).toBe(-2); // least-negative option: 2 × −1 × 1
  });

  it("normalizes against each program's own ideal and ranks by it", () => {
    const [first, second] = scorePrograms([a(X, "build")], [MODELER, BUILDER]);
    expect(first).toMatchObject({ programId: "builder", rank: 1, rawFit: 15, idealFit: 15, normalizedFit: 1 });
    expect(second).toMatchObject({ programId: "modeler", rank: 2, rawFit: 3, idealFit: 15, normalizedFit: 0.2 });
  });

  it("clamps negative ratios to 0", () => {
    // raw(builder) = 3·1 (model) + 2·(−1)·5 (not_build) = −7; ideal = 15 + (−2) = 13
    const builder = scorePrograms([a(X, "model"), a(Y, "not_build")], [BUILDER, MODELER]).find(
      (p) => p.programId === "builder",
    )!;
    expect(builder.rawFit).toBe(-7);
    expect(builder.idealFit).toBe(13);
    expect(builder.normalizedFit).toBe(0);
  });

  it("treats a non-positive ideal as no usable fit signal", () => {
    const ranking = scorePrograms([a(Y, "not_build")], [BUILDER, MODELER]);
    for (const program of ranking) {
      expect(program.hasUsableSignal).toBe(false);
      expect(program.normalizedFit).toBe(0);
      expect(program.fitClassification).toBe("no_strong_fit");
    }
  });

  it("decomposes normalized fit into dimension contributions that sum back to raw/ideal", () => {
    for (const program of scorePrograms([a(X, "build"), a(Y, "not_model")], [BUILDER, MODELER])) {
      const sum = Object.values(program.dimensionContributions).reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(program.rawFit / program.idealFit, 12);
    }
  });

  it("breaks exact ties by selection order", () => {
    const twin: ProgramInput = { id: "twin", vector: BUILDER.vector };
    expect(scorePrograms([a(X, "build")], [twin, BUILDER]).map((p) => p.programId)).toEqual(["twin", "builder"]);
    expect(scorePrograms([a(X, "build")], [BUILDER, twin]).map((p) => p.programId)).toEqual(["builder", "twin"]);
  });
});

describe("classification boundaries (PROPOSED DEC-018)", () => {
  it.each([
    [1, "strong_fit"],
    [0.8, "strong_fit"],
    [0.7999, "good_fit"],
    [0.65, "good_fit"],
    [0.6499, "consider_carefully"],
    [0.5, "consider_carefully"],
    [0.4999, "no_strong_fit"],
    [0, "no_strong_fit"],
  ] as const)("normalized fit %s → %s", (normalized, expected) => {
    expect(classifyFit(normalized)).toBe(expected);
  });

  it("is no_strong_fit without a usable signal, whatever the ratio", () => {
    expect(classifyFit(1, false)).toBe("no_strong_fit");
  });
});
