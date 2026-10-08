import { describe, expect, it } from "vitest";
import { runPersona } from "./v2PersonaRun";
import { V2_PERSONAS } from "./v2Personas";

describe("V2 acceptance personas (engine level)", () => {
  it.each(V2_PERSONAS.map((persona) => [persona.id, persona] as const))("%s", (_id, persona) => {
    const { asked, modes, view } = runPersona(persona);
    if (persona.expect.kind === "precision") {
      expect(view.type).toBe("precision");
      if (view.type === "precision") expect(view.view.top.id).toBe(persona.expect.programs[0]);
      expect(modes).toContain("precision");
    } else {
      expect(view.type).toBe("generic");
      if (view.type === "generic") {
        expect(view.kind).toBe(persona.expect.kind);
        expect(view.directions.map((direction) => direction.programId)).toEqual(persona.expect.programs);
      }
    }
    expect(asked.filter((id) => /^(BR|PR|CR)\d|^L4$|^D4$/.test(id))).toEqual(persona.expect.realityChecks);
    // The Spotify question is never asked twice, and V1's Q1 is never asked when T1 already was.
    expect(asked.filter((id) => id === "Q1").length + asked.filter((id) => id === "T1").length).toBeLessThanOrEqual(1);
  });

  it("measures the journey length of every persona (candidate answers)", () => {
    const rows = V2_PERSONAS.map((persona) => {
      const { asked, modes, view } = runPersona(persona);
      const reality = asked.filter((id) => persona.expect.realityChecks.includes(id)).length;
      const precision = modes.filter((mode) => mode === "precision").length;
      const generic = asked.length - precision - reality;
      return {
        id: persona.id,
        projects: persona.projects.length,
        generic,
        precision,
        reality,
        total: asked.length,
        kind: view.analytics.resultKind,
      };
    });
    if (process.env.CALIBRATION_REPORT === "1") console.table(rows);
    // Journeys above 8 answers are product-review items, not failures: only the known Tech cross-cluster ones may exceed it.
    const long = rows.filter((row) => row.total > 8).map((row) => row.id);
    expect(long).toEqual(["tech_cross_cluster_longest"]);
    expect(rows.find((row) => row.id === "focused_tech")!.total).toBe(5);
  });
});
