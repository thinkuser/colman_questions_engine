import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getFitProfile,
  getProgramFacts,
  getProgramSummary,
  getSource,
  listProgramFacts,
  PILOT_PROGRAMS,
  PROGRAM_IDS,
} from "@/data";
import { collectFacts, evidenceOf, normalize, readSnapshot } from "./evidence";

const contentDir = fileURLToPath(new URL("../../src/data/content/", import.meta.url));
const idsIn = (layer: string) =>
  readdirSync(`${contentDir}${layer}`)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();

describe("pilot program catalog", () => {
  it("contains exactly the three V1 pilot programs (DEC-013)", () => {
    expect(PROGRAM_IDS).toEqual(["computer_science", "data_science", "management_information_systems"]);
    expect(PILOT_PROGRAMS.map((program) => program.id)).toEqual(PROGRAM_IDS);
  });

  it("has facts, fit, and admissions files for every program — and nothing else", () => {
    const expected = [...PROGRAM_IDS].sort();
    expect(idsIn("facts")).toEqual(expected);
    expect(idsIn("fit")).toEqual(expected);
    expect(idsIn("admissions")).toEqual(expected);
  });

  it("derives selection summaries from the structured facts", () => {
    expect(getProgramSummary("data_science")).toEqual({
      id: "data_science",
      nameHe: getProgramFacts("data_science")!.program_name_he,
      nameEn: "Data Science",
      qualifierHe: null,
    });
    expect(getProgramSummary("unknown")).toBeUndefined();
  });
});

describe("candidate-facing names (DEC-015)", () => {
  it.each([
    ["computer_science", "מדעי המחשב", null],
    ["data_science", "מדע הנתונים", null],
    ["management_information_systems", "ניהול מערכות מידע", "דו-חוגי עם מנהל עסקים"],
  ])("%s is shown as %s with qualifier %s", (id, name, qualifier) => {
    expect(getProgramSummary(id)).toMatchObject({ nameHe: name, qualifierHe: qualifier });
  });

  it("preserves the official Data Science page-title wording as an alias", () => {
    expect(getProgramFacts("data_science")!.program_name_aliases_he).toContain("מדעי הנתונים");
  });

  it("backs the MIS qualifier with the sourced double-major note", () => {
    const topics = getProgramFacts("management_information_systems")!.program_notes.map((note) => note.topic);
    expect(topics).toContain("double_major_with_business_administration");
  });
});

describe("CS/DS shared first year (DEC-016)", () => {
  it.each(["computer_science", "data_science"])("%s keeps the sourced shared_first_year note", (id) => {
    expect(getProgramFacts(id)!.program_notes.some((note) => note.topic === "shared_first_year")).toBe(true);
  });

  it("is explanatory only: it lives in facts, never in fit profiles", () => {
    for (const id of PROGRAM_IDS) {
      expect(JSON.stringify(getFitProfile(id))).not.toContain("shared_first_year");
    }
  });
});

describe.each(listProgramFacts())("official facts: $program_id", (facts) => {
  const page = readSnapshot(facts.source_ids[0]!);

  it("cites only registered sources, and the record lists every source its facts use", () => {
    const cited = new Set(collectFacts(facts).flatMap(({ fact }) => fact.source_ids));
    for (const id of [...cited, ...facts.source_ids]) {
      expect(getSource(id), `unknown source "${id}"`).toBeDefined();
    }
    expect([...cited].every((id) => facts.source_ids.includes(id))).toBe(true);
  });

  it("lists the registered page URLs as official URLs", () => {
    const urls = facts.source_ids.map((id) => getSource(id)!.url);
    expect(facts.official_urls).toEqual(urls);
  });

  it("uses a display name and aliases that appear verbatim on the program page", () => {
    for (const name of [facts.program_name_he, ...facts.program_name_aliases_he]) {
      expect(page.includes(normalize(name)), name).toBe(true);
    }
  });

  it("copies every fact verbatim from each cited source snapshot", () => {
    for (const { field, fact } of collectFacts(facts)) {
      for (const sourceId of fact.source_ids) {
        expect(readSnapshot(sourceId).includes(normalize(evidenceOf(fact))), `${field} not found in ${sourceId}`).toBe(
          true,
        );
      }
    }
  });

  it("has the core content fields populated", () => {
    expect(facts.what_you_learn.length).toBeGreaterThan(0);
    expect(facts.key_courses.length).toBeGreaterThan(0);
    expect(facts.career_paths.length).toBeGreaterThan(0);
  });

  it("does not carry admissions or fit data", () => {
    expect(facts).not.toHaveProperty("admission_requirements");
    expect(facts).not.toHaveProperty("dimensions");
    expect(facts).not.toHaveProperty("reality_checks");
  });
});
