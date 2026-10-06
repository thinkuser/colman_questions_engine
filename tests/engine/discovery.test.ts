import { describe, expect, it } from "vitest";
import {
  buildCandidatePool,
  MAX_SELECTED_PROJECTS,
  MIN_SELECTED_PROJECTS,
  validateProjectSelection,
  type CareerProject,
} from "@/engine";

/** Synthetic projects: the discovery logic is pure and receives project data as input. */
const PROJECTS: CareerProject[] = [
  { id: "p_tech", order: 1, enabled: true, clusterId: "tech", candidateProgramIds: ["cs", "ds", "mis"] },
  { id: "p_people", order: 2, enabled: true, clusterId: "people", candidateProgramIds: ["psy", "beh", "econpsy"] },
  { id: "p_learning", order: 3, enabled: true, clusterId: "people", candidateProgramIds: ["edu", "psy", "beh"] },
  { id: "p_off", order: 4, enabled: false, clusterId: "law", candidateProgramIds: ["law"] },
];

describe("project selection limits", () => {
  it("allows 1 to 2 projects", () => {
    expect(MIN_SELECTED_PROJECTS).toBe(1);
    expect(MAX_SELECTED_PROJECTS).toBe(2);
    expect(validateProjectSelection(["p_tech"], PROJECTS)).toEqual({ ok: true, projectIds: ["p_tech"] });
    expect(validateProjectSelection(["p_people", "p_tech"], PROJECTS)).toEqual({
      ok: true,
      projectIds: ["p_tech", "p_people"],
    });
  });

  it("rejects zero projects for a started discovery", () => {
    expect(validateProjectSelection([], PROJECTS)).toEqual({ ok: false, errors: [{ code: "none_selected" }] });
  });

  it("rejects more than two projects", () => {
    expect(validateProjectSelection(["p_tech", "p_people", "p_learning"], PROJECTS)).toEqual({
      ok: false,
      errors: [{ code: "too_many", max: 2, received: 3 }],
    });
  });

  it("rejects duplicates, unknown projects and disabled projects", () => {
    expect(validateProjectSelection(["p_tech", "p_tech"], PROJECTS)).toMatchObject({
      ok: false,
      errors: [{ code: "duplicate", projectId: "p_tech" }],
    });
    expect(validateProjectSelection(["nope"], PROJECTS)).toMatchObject({
      ok: false,
      errors: [{ code: "unknown_project", projectId: "nope" }],
    });
    expect(validateProjectSelection(["p_off"], PROJECTS)).toMatchObject({
      ok: false,
      errors: [{ code: "project_disabled", projectId: "p_off" }],
    });
  });
});

describe("candidate pool", () => {
  it("is the union of the selected projects' programs, de-duplicated, with provenance", () => {
    const pool = buildCandidatePool(["p_people", "p_learning"], PROJECTS);
    expect(pool.projectIds).toEqual(["p_people", "p_learning"]);
    expect(pool.clusterIds).toEqual(["people"]);
    expect(pool.programIds).toEqual(["psy", "beh", "econpsy", "edu"]);
    expect(pool.programSources).toEqual({
      psy: ["p_people", "p_learning"],
      beh: ["p_people", "p_learning"],
      econpsy: ["p_people"],
      edu: ["p_learning"],
    });
  });

  it("orders the pool by project display order, never by click order (array position is not a ranking)", () => {
    // THI-14 contract: pool position must not act as a hidden ranking or tie-break. Here, clicking the later project
    // first must not move its programs ahead.
    const pool = buildCandidatePool(["p_learning", "p_people"], PROJECTS);
    expect(pool.projectIds).toEqual(["p_people", "p_learning"]);
    expect(pool.programIds).toEqual(["psy", "beh", "econpsy", "edu"]);
  });

  it("does not depend on the order the candidate clicked", () => {
    expect(buildCandidatePool(["p_learning", "p_tech"], PROJECTS)).toEqual(
      buildCandidatePool(["p_tech", "p_learning"], PROJECTS),
    );
  });

  it("spans clusters for a cross-cluster selection", () => {
    const pool = buildCandidatePool(["p_tech", "p_people"], PROJECTS);
    expect(pool.clusterIds).toEqual(["tech", "people"]);
    expect(pool.programIds).toEqual(["cs", "ds", "mis", "psy", "beh", "econpsy"]);
  });

  it("generates no fit score: no numeric value and no score-like field anywhere in the pool", () => {
    const pool = buildCandidatePool(["p_tech", "p_people"], PROJECTS);
    const walk = (value: unknown, path: string): void => {
      expect(typeof value, `${path} is numeric`).not.toBe("number");
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          expect(key).not.toMatch(/score|fit|weight|points|rank/i);
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(pool, "pool");
  });

  it("refuses to build a pool from an invalid selection", () => {
    expect(() => buildCandidatePool([], PROJECTS)).toThrow(/none_selected/);
    expect(() => buildCandidatePool(["p_tech", "p_people", "p_learning"], PROJECTS)).toThrow(/too_many/);
  });
});
