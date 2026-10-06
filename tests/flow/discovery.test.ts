import { describe, expect, it } from "vitest";
import { PROGRAM_IDS } from "@/data";
import { nextComparisonStep, restoreComparison, startDiscovery } from "@/flow";

describe("startDiscovery (V2, real project data)", () => {
  it("builds the candidate pool for one project", () => {
    const start = startDiscovery(["spotify_discover_weekly"]);
    expect(start).toEqual({
      ok: true,
      pool: {
        projectIds: ["spotify_discover_weekly"],
        clusterIds: ["tech"],
        programIds: ["computer_science", "data_science", "management_information_systems"],
        programSources: {
          computer_science: ["spotify_discover_weekly"],
          data_science: ["spotify_discover_weekly"],
          management_information_systems: ["spotify_discover_weekly"],
        },
      },
    });
  });

  it("builds a cross-cluster pool for two projects (TikTok + Nike)", () => {
    const start = startDiscovery(["nike_israel_launch", "tiktok_endless_scroll"]);
    if (!start.ok) throw new Error("expected a valid selection");
    expect(start.pool.projectIds).toEqual(["tiktok_endless_scroll", "nike_israel_launch"]);
    expect(start.pool.clusterIds).toEqual(["people", "communication"]);
    expect(start.pool.programIds).toEqual([
      "psychology",
      "behavioral_science",
      "economics_and_psychology",
      "communication",
      "communication_and_management",
      "business_administration",
    ]);
  });

  it("merges overlapping pools without duplicates (TikTok + Duolingo)", () => {
    const start = startDiscovery(["tiktok_endless_scroll", "duolingo_persistence"]);
    if (!start.ok) throw new Error("expected a valid selection");
    expect(start.pool.programIds).toEqual([
      "psychology",
      "behavioral_science",
      "economics_and_psychology",
      "education",
    ]);
    expect(start.pool.programSources["psychology"]).toEqual(["tiktok_endless_scroll", "duolingo_persistence"]);
  });

  it("rejects zero, three and unknown project selections", () => {
    expect(startDiscovery([])).toEqual({ ok: false, errors: [{ code: "none_selected" }] });
    expect(startDiscovery(["wolt_new_city", "nike_israel_launch", "apple_store_space"])).toMatchObject({
      ok: false,
      errors: [{ code: "too_many", max: 2, received: 3 }],
    });
    expect(startDiscovery(["law", "wolt_new_city"])).toMatchObject({
      ok: false,
      errors: [{ code: "unknown_project", projectId: "law" }],
    });
  });
});

describe("V1 regression baseline", () => {
  it("keeps the V1 comparison flow on the three pilot programs only", () => {
    expect(PROGRAM_IDS).toEqual(["computer_science", "data_science", "management_information_systems"]);
    const step = nextComparisonStep({ selectedProgramIds: ["computer_science", "data_science"], answers: [] });
    expect(step?.status === "ask" && step.question.id).toBe("Q1");
  });

  it("does not let V2 programs into the V1 durable state", () => {
    const raw = JSON.stringify({ version: 1, selectedProgramIds: ["law", "psychology"], answers: [] });
    expect(restoreComparison(raw)).toBeNull();
  });
});
