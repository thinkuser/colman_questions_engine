import { describe, expect, it } from "vitest";
import * as dataModule from "@/data";
import { getAdmissions, isAutomatedEligibilityAllowed } from "@/data/admissions";
import { getFitProfile, getSource, ProgramAdmissionsSchema, PROGRAM_IDS } from "@/data";
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
    expect(dataModule).not.toHaveProperty("isAutomatedEligibilityAllowed");
  });
});

describe("admissions usage status (DEC-017)", () => {
  it.each([
    ["computer_science", "usable_as_published", true],
    ["data_science", "usable_as_published", true],
    ["management_information_systems", "manual_confirmation_required", false],
  ] as const)("%s is %s (automated eligibility allowed: %s)", (id, status, allowed) => {
    const admissions = getAdmissions(id)!;
    expect(admissions.usage_status).toBe(status);
    expect(isAutomatedEligibilityAllowed(admissions)).toBe(allowed);
  });

  it("explains why manual confirmation is required, and carries last_reviewed for freshness checks", () => {
    const mis = getAdmissions("management_information_systems")!;
    expect(mis.usage_status_reason_en).toMatch(/confirm with COLMAN/i);
    expect(mis.last_reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getAdmissions("computer_science")!.usage_status_reason_en).toBeNull();
  });

  it("rejects a manual-confirmation status without a reason, and a reason on a usable status", () => {
    const usable = getAdmissions("computer_science")!;
    expect(ProgramAdmissionsSchema.safeParse(usable).success).toBe(true);
    expect(ProgramAdmissionsSchema.safeParse({ ...usable, usage_status: "manual_confirmation_required" }).success).toBe(
      false,
    );
    expect(ProgramAdmissionsSchema.safeParse({ ...usable, usage_status_reason_en: "why" }).success).toBe(false);
    expect(ProgramAdmissionsSchema.safeParse({ ...usable, usage_status: "unknown" }).success).toBe(false);
  });

  it("never reaches fit profiles (DEC-008)", () => {
    for (const id of PROGRAM_IDS) {
      expect(getFitProfile(id)).not.toHaveProperty("usage_status");
    }
  });
});
