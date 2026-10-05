import { describe, expect, it } from "vitest";
import * as dataModule from "@/data";
import { getAdmissions } from "@/data/admissions";
import { getSource, PROGRAM_IDS } from "@/data";
import { normalize, readSnapshot } from "./evidence";

describe("admissions", () => {
  it.each(PROGRAM_IDS)("%s rules are copied verbatim from each cited source", (id) => {
    const admissions = getAdmissions(id)!;
    expect(admissions.rules.length).toBeGreaterThan(0);
    for (const [index, rule] of admissions.rules.entries()) {
      for (const sourceId of rule.source_ids) {
        expect(readSnapshot(sourceId).includes(normalize(rule.text_he)), `rules[${index}] not in ${sourceId}`).toBe(
          true,
        );
      }
    }
  });

  it.each(PROGRAM_IDS)("%s corroborating sources are registered", (id) => {
    for (const sourceId of getAdmissions(id)!.corroborating_source_ids) {
      expect(getSource(sourceId), sourceId).toBeDefined();
    }
  });

  it("is not exposed through the main data module (DEC-008)", () => {
    expect(dataModule).not.toHaveProperty("getAdmissions");
  });
});
