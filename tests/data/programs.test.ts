import { describe, expect, it } from "vitest";
import { getProgramSummary, PILOT_PROGRAMS } from "@/data";

describe("pilot program catalog", () => {
  it("contains exactly the three V1 pilot programs (DEC-013)", () => {
    expect(PILOT_PROGRAMS.map((program) => program.id)).toEqual([
      "computer_science",
      "data_science",
      "management_information_systems",
    ]);
  });

  it("provides a Hebrew display name for every program", () => {
    for (const program of PILOT_PROGRAMS) {
      expect(program.nameHe).toMatch(/[֐-׿]/);
    }
  });

  it("looks programs up by stable id", () => {
    expect(getProgramSummary("data_science")?.nameEn).toBe("Data Science");
    expect(getProgramSummary("unknown")).toBeUndefined();
  });
});
