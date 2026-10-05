import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OfficialFact, ProgramFacts } from "@/data";

const snapshotDir = fileURLToPath(new URL("../../src/data/content/source-snapshots/", import.meta.url));

export const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const snapshotCache = new Map<string, string>();

export function readSnapshot(sourceId: string): string {
  if (!snapshotCache.has(sourceId)) {
    snapshotCache.set(sourceId, normalize(readFileSync(`${snapshotDir}${sourceId}.txt`, "utf8")));
  }
  return snapshotCache.get(sourceId)!;
}

/** The verbatim evidence for a fact: its quote if given, otherwise the text itself. */
export const evidenceOf = (fact: OfficialFact) => fact.quote_he ?? fact.text_he;

/** Every official fact in a program record, labelled by field for readable failures. */
export function collectFacts(facts: ProgramFacts): Array<{ field: string; fact: OfficialFact }> {
  const lists: Array<[string, OfficialFact[]]> = [
    ["official_title", [facts.official_title]],
    ["faculty", [facts.faculty]],
    ["short_description", [facts.short_description]],
    ["what_you_learn", facts.what_you_learn],
    ["key_courses", facts.key_courses],
    ["career_paths", facts.career_paths],
    ["entry_level_roles", facts.entry_level_roles],
    ["future_roles", facts.future_roles],
    ["ideal_for", facts.ideal_for],
    ["why_colman", facts.why_colman],
    ["program_notes", facts.program_notes],
  ];
  return lists.flatMap(([field, items]) => items.map((fact, index) => ({ field: `${field}[${index}]`, fact })));
}
