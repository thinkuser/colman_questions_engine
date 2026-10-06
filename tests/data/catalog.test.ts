import { describe, expect, it } from "vitest";
import {
  buildProgramCatalog,
  getCatalogProgram,
  getProgramFacts,
  getSource,
  PILOT_PROGRAMS,
  PROGRAM_IDS,
  V2_PROGRAM_CATALOG,
  V2_PROGRAM_IDS,
  type CatalogDependencies,
} from "@/data";
import raw from "@/data/content/catalog/programs.json";
import headingsFile from "@/data/content/catalog/verified_headings.json";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { normalize, readSnapshot } from "./evidence";

/** Minimal verification record: one official degree heading per checked page (no page body). */
const HeadingsFileSchema = z.strictObject({
  status_note: z.string(),
  headings: z.array(
    z.strictObject({
      program_id: z.string(),
      source_id: z.string(),
      verified_degree_heading: z.string(),
      retrieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
});
const HEADINGS = HeadingsFileSchema.parse(headingsFile).headings;
const snapshotDir = fileURLToPath(new URL("../../src/data/content/source-snapshots/", import.meta.url));
const hasSnapshot = (sourceId: string) => existsSync(`${snapshotDir}${sourceId}.txt`);

const V2_SCOPE = [
  "computer_science",
  "data_science",
  "management_information_systems",
  "business_administration",
  "economics_and_management",
  "accounting",
  "psychology",
  "behavioral_science",
  "education",
  "economics_and_psychology",
  "communication",
  "communication_and_management",
  "law",
  "interior_design",
];

const deps: CatalogDependencies = { getSource, pilotProgramIds: PROGRAM_IDS, getPilotFacts: getProgramFacts };
type CatalogFile = typeof raw;
const clone = (): CatalogFile => structuredClone(raw);
const entry = (file: CatalogFile, id: string) => file.programs.find((program) => program.program_id === id)!;

describe("V2 program catalog", () => {
  it("contains exactly the 14 programs in V2 scope, in the specified order, with unique ids", () => {
    expect(V2_PROGRAM_IDS).toEqual(V2_SCOPE);
    expect(new Set(V2_PROGRAM_IDS).size).toBe(14);
  });

  it("loads every program with a Hebrew name, an English label and at least one COLMAN source", () => {
    for (const program of V2_PROGRAM_CATALOG) {
      expect(program.nameHe).toMatch(/[֐-׿]/);
      expect(program.nameEn.length).toBeGreaterThan(0);
      expect(program.colmanSourceIds.length).toBeGreaterThan(0);
      expect(program.officialUrls[0]).toMatch(/^https:\/\/www\.colman\.ac\.il\/academics\/ba\//);
    }
  });

  it("verifies every name and alias verbatim against an official degree heading of the program's own cited pages", () => {
    for (const program of V2_PROGRAM_CATALOG) {
      const headings = HEADINGS.filter((entry) => entry.program_id === program.id).map((entry) =>
        normalize(entry.verified_degree_heading),
      );
      for (const name of [program.nameHe, ...program.aliasesHe]) {
        const heading = normalize(`תואר ראשון ב${name}`);
        expect(
          headings.some((verified) => verified.includes(heading)),
          `${program.id}: "${name}" is not in any verified degree heading`,
        ).toBe(true);
      }
    }
  });

  it("cites each source on the right content layer (COLMAN academic / Academy candidate)", () => {
    for (const program of V2_PROGRAM_CATALOG) {
      for (const id of program.colmanSourceIds) expect(new URL(getSource(id)!.url).hostname).toBe("www.colman.ac.il");
      for (const id of program.academySourceIds)
        expect(new URL(getSource(id)!.url).hostname).toBe("www.academy.org.il");
    }
  });

  it("preserves the mandatory MIS qualifier", () => {
    const mis = getCatalogProgram("management_information_systems")!;
    expect(mis.qualifierHe).toBe("דו-חוגי עם מנהל עסקים");
    expect(mis.nameHe).toBe("ניהול מערכות מידע");
  });

  it("gives Economics + Psychology the accepted double-major qualifier, keeping its name and alias", () => {
    const program = getCatalogProgram("economics_and_psychology")!;
    expect(program.qualifierHe).toBe("דו-חוגי");
    expect(program.nameHe).toBe("כלכלה ופסיכולוגיה");
    expect(program.aliasesHe).toEqual(["פסיכולוגיה וכלכלה"]);
  });

  it("sets qualifiers only where a product decision exists (MIS, Economics + Psychology)", () => {
    const qualified = V2_PROGRAM_CATALOG.filter((program) => program.qualifierHe !== null).map((program) => program.id);
    expect(qualified).toEqual(["management_information_systems", "economics_and_psychology"]);
  });

  it("keeps the V1 pilot identity identical to the V1 facts layer", () => {
    for (const pilot of PILOT_PROGRAMS) {
      const program = getCatalogProgram(pilot.id)!;
      expect(program.factsStatus).toBe("verified_v1_pilot");
      expect({
        id: program.id,
        nameHe: program.nameHe,
        nameEn: program.nameEn,
        qualifierHe: program.qualifierHe,
      }).toEqual(pilot);
    }
    expect(
      V2_PROGRAM_CATALOG.filter((program) => program.factsStatus === "verified_v1_pilot").map((p) => p.id),
    ).toEqual([...PROGRAM_IDS]);
  });

  it("adds no academic facts for the new programs (identity and provenance only)", () => {
    for (const program of V2_PROGRAM_CATALOG.filter((p) => !PROGRAM_IDS.includes(p.id))) {
      expect(program.factsStatus).toBe("pending_curation");
      expect(getProgramFacts(program.id)).toBeUndefined();
    }
  });

  it("does not change the V1 pilot program set", () => {
    expect(PROGRAM_IDS).toEqual(["computer_science", "data_science", "management_information_systems"]);
    expect(PILOT_PROGRAMS.map((program) => program.id)).toEqual(PROGRAM_IDS);
  });
});

describe("name verification record", () => {
  it("holds only short degree headings (no page body, curriculum, admissions or marketing copy)", () => {
    for (const entry of HEADINGS) {
      expect(entry.verified_degree_heading, entry.source_id).toMatch(/^(לימודי )?תואר ראשון ב/);
      expect(entry.verified_degree_heading.length, entry.source_id).toBeLessThanOrEqual(90);
      expect(entry.verified_degree_heading).not.toMatch(/[\r\n]/);
    }
    expect(new Set(HEADINGS.map((e) => `${e.source_id}|${e.verified_degree_heading}`)).size).toBe(HEADINGS.length);
  });

  it("only cites registered sources that the program itself cites, with the source's retrieval date", () => {
    for (const entry of HEADINGS) {
      const program = getCatalogProgram(entry.program_id);
      expect(program, entry.program_id).toBeDefined();
      expect([...program!.colmanSourceIds, ...program!.academySourceIds]).toContain(entry.source_id);
      expect(entry.retrieved_at).toBe(getSource(entry.source_id)!.retrieved_at);
    }
  });

  it("checks every cited page that has no committed full-page snapshot", () => {
    for (const program of V2_PROGRAM_CATALOG) {
      for (const sourceId of [...program.colmanSourceIds, ...program.academySourceIds]) {
        if (hasSnapshot(sourceId)) continue;
        expect(
          HEADINGS.some((entry) => entry.program_id === program.id && entry.source_id === sourceId),
          `${program.id}: ${sourceId} has neither a snapshot nor a verified heading`,
        ).toBe(true);
      }
    }
  });

  it("matches the committed V1 snapshots verbatim where one exists", () => {
    const withSnapshot = HEADINGS.filter((entry) => hasSnapshot(entry.source_id));
    expect(withSnapshot.length).toBeGreaterThan(0);
    for (const entry of withSnapshot) {
      expect(readSnapshot(entry.source_id).includes(normalize(entry.verified_degree_heading)), entry.source_id).toBe(
        true,
      );
    }
  });

  it("does not commit full-page snapshots for identity-only sources", () => {
    const factSources = new Set([
      "colman_cs_program_page",
      "colman_ds_program_page",
      "colman_mis_program_page",
      "academy_admission_page",
    ]);
    for (const program of V2_PROGRAM_CATALOG) {
      for (const sourceId of [...program.colmanSourceIds, ...program.academySourceIds]) {
        if (!factSources.has(sourceId)) expect(hasSnapshot(sourceId), sourceId).toBe(false);
      }
    }
  });
});

describe("catalog validation", () => {
  it("accepts the shipped file", () => {
    expect(() => buildProgramCatalog(raw, deps)).not.toThrow();
  });

  it("rejects duplicate program ids", () => {
    const file = clone();
    file.programs.push({ ...file.programs[3]! });
    expect(() => buildProgramCatalog(file, deps)).toThrow(/duplicate program ids/);
  });

  it("rejects an alias that repeats the name, and a qualifier that repeats a name", () => {
    const alias = clone();
    entry(alias, "law").program_name_aliases_he = ["משפטים"];
    expect(() => buildProgramCatalog(alias, deps)).toThrow(/alias repeats/);

    const qualifier = clone();
    (entry(qualifier, "law") as { program_qualifier_he: string | null }).program_qualifier_he = "משפטים";
    expect(() => buildProgramCatalog(qualifier, deps)).toThrow(/qualifier must add information/);
  });

  it("rejects an empty name, alias or qualifier", () => {
    const name = clone();
    entry(name, "law").program_name_he = " ";
    expect(() => buildProgramCatalog(name, deps)).toThrow();

    const alias = clone();
    entry(alias, "law").program_name_aliases_he = [""];
    expect(() => buildProgramCatalog(alias, deps)).toThrow();

    const qualifier = clone();
    (entry(qualifier, "law") as { program_qualifier_he: string | null }).program_qualifier_he = "";
    expect(() => buildProgramCatalog(qualifier, deps)).toThrow();
  });

  it("rejects a dropped or changed MIS qualifier (it must match the V1 facts)", () => {
    const dropped = clone();
    (entry(dropped, "management_information_systems") as { program_qualifier_he: string | null }).program_qualifier_he =
      null;
    expect(() => buildProgramCatalog(dropped, deps)).toThrow(/qualifier differs from V1 facts/);
  });

  it("rejects a missing V1 pilot program or a V1 name change", () => {
    const missing = clone();
    missing.programs = missing.programs.filter((program) => program.program_id !== "data_science");
    expect(() => buildProgramCatalog(missing, deps)).toThrow(/V1 pilot program "data_science" is missing/);

    const renamed = clone();
    entry(renamed, "data_science").program_name_he = "מדעי הנתונים";
    entry(renamed, "data_science").program_name_aliases_he = [];
    expect(() => buildProgramCatalog(renamed, deps)).toThrow(/name differs from V1 facts/);
  });

  it("rejects unknown sources, sources on the wrong layer, and programs without a COLMAN source", () => {
    const unknown = clone();
    entry(unknown, "law").sources.colman = ["nope"];
    expect(() => buildProgramCatalog(unknown, deps)).toThrow(/unknown source "nope"/);

    const wrongLayer = clone();
    entry(wrongLayer, "accounting").sources.colman = ["academy_accounting_page"];
    expect(() => buildProgramCatalog(wrongLayer, deps)).toThrow(/not on the colman layer/);

    const noColman = clone();
    entry(noColman, "law").sources.colman = [];
    expect(() => buildProgramCatalog(noColman, deps)).toThrow();
  });

  it("rejects marking a new program as verified V1 facts, or a pilot program as pending", () => {
    const wrong = clone();
    entry(wrong, "law").facts_status = "verified_v1_pilot";
    expect(() => buildProgramCatalog(wrong, deps)).toThrow(/facts_status/);
  });

  it("rejects unexpected fields (no scores, weights or logos in the catalog)", () => {
    const file = clone();
    (entry(file, "law") as Record<string, unknown>)["fit_score"] = 3;
    expect(() => buildProgramCatalog(file, deps)).toThrow();
  });
});
