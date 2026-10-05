import { describe, expect, it } from "vitest";
import { DIMENSIONS, FIT_CLASSIFICATIONS, isDimension } from "@/engine";

describe("engine dimensions", () => {
  it("matches the nine dimensions in docs/PROGRAM_MODEL.md", () => {
    expect(DIMENSIONS).toEqual([
      "software_building",
      "data_modeling",
      "business_context",
      "math_affinity",
      "coding_depth",
      "statistical_thinking",
      "systems_process",
      "bridge_role",
      "abstract_problem_solving",
    ]);
    expect(new Set(DIMENSIONS).size).toBe(DIMENSIONS.length);
  });

  it("recognises known dimensions only", () => {
    expect(isDimension("data_modeling")).toBe(true);
    expect(isDimension("likes_technology")).toBe(false);
  });
});

describe("fit classifications", () => {
  it("are qualitative classes from docs/PRODUCT_SPEC.md, including no_strong_fit", () => {
    expect(FIT_CLASSIFICATIONS).toEqual(["strong_fit", "good_fit", "consider_carefully", "no_strong_fit"]);
  });
});
