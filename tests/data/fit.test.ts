import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getFitProfile, getProgramVectors, getSource, PROGRAM_IDS } from "@/data";
import { DIMENSIONS } from "@/engine";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const PROGRAM_COLUMNS = ["computer_science", "data_science", "management_information_systems"] as const;

/** Parse the "Pilot vectors" table from docs/PROGRAM_MODEL.md so data can never drift from the doc. */
function documentedVectors(): Record<string, Record<string, number>> {
  const doc = readFileSync(`${repoRoot}docs/PROGRAM_MODEL.md`, "utf8");
  const section = doc.split("## Pilot vectors")[1]!.split("\n## ")[0]!;
  const vectors: Record<string, Record<string, number>> = Object.fromEntries(PROGRAM_COLUMNS.map((id) => [id, {}]));
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const dimension = cells[1]?.match(/^`([a-z_]+)`$/)?.[1];
    if (!dimension) continue;
    PROGRAM_COLUMNS.forEach((id, index) => {
      vectors[id]![dimension] = Number(cells[index + 2]);
    });
  }
  return vectors;
}

describe("fit profiles", () => {
  const documented = documentedVectors();

  it.each(PROGRAM_IDS)("%s vector matches docs/PROGRAM_MODEL.md exactly", (id) => {
    expect(getFitProfile(id)!.dimensions).toEqual(documented[id]);
  });

  it.each(PROGRAM_IDS)("%s vector covers exactly the documented dimensions", (id) => {
    expect(Object.keys(getFitProfile(id)!.dimensions).sort()).toEqual([...DIMENSIONS].sort());
  });

  it.each(PROGRAM_IDS)("%s is marked as editorial heuristics, not official data", (id) => {
    expect(getFitProfile(id)!.basis).toBe("editorial_heuristic");
  });

  it.each(PROGRAM_IDS)("%s reality checks cite registered sources and existing docs", (id) => {
    const profile = getFitProfile(id)!;
    for (const check of profile.reality_checks) {
      for (const sourceId of check.evidence_source_ids) {
        expect(getSource(sourceId), sourceId).toBeDefined();
      }
    }
    for (const ref of [...profile.doc_refs, ...profile.reality_checks.flatMap((check) => check.doc_refs)]) {
      expect(existsSync(`${repoRoot}${ref.split("#")[0]}`), ref).toBe(true);
    }
  });

  it("includes the documented Data Science reality check (docs/RESULT_EXPERIENCE.md)", () => {
    const summaries = getFitProfile("data_science")!.reality_checks.map((check) => check.summary_en);
    expect(summaries).toContain(
      "AI/ML are important, but the degree also requires substantial mathematics, statistics, and programming.",
    );
  });

  it("does not carry admissions data (DEC-008)", () => {
    for (const id of PROGRAM_IDS) {
      expect(getFitProfile(id)).not.toHaveProperty("admission_requirements");
      expect(getFitProfile(id)).not.toHaveProperty("rules");
    }
  });
});

describe("getProgramVectors", () => {
  it("returns copies of the vectors for the requested programs only", () => {
    const vectors = getProgramVectors(["computer_science", "data_science"]);
    expect(Object.keys(vectors)).toEqual(["computer_science", "data_science"]);
    vectors.computer_science!.math_affinity = 0;
    expect(getFitProfile("computer_science")!.dimensions.math_affinity).toBe(5);
  });

  it("throws for unknown programs", () => {
    expect(() => getProgramVectors(["unknown"])).toThrow(/unknown/);
  });
});
