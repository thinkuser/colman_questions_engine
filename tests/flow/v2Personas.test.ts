import { describe, expect, it } from "vitest";
import { buildV2ResultView, discoveryReducer, discoveryStep, initialDiscoveryState, type DiscoveryState } from "@/flow";
import { personaChoice, V2_PERSONAS, type V2Persona } from "./v2Personas";

/** Engine-level run of every acceptance persona (the same data drives the browser suite). */
function runPersona(persona: V2Persona) {
  let state: DiscoveryState = persona.projects.reduce(
    (current, projectId) => discoveryReducer(current, { type: "toggle_project", projectId }),
    initialDiscoveryState,
  );
  state = discoveryReducer(state, { type: "start" });
  const asked: string[] = [];
  const modes: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const step = discoveryStep(state);
    if (step?.status === "needs_focus_content") throw new Error(`${persona.id}: content gap`);
    if (step?.status !== "ask") break;
    const question = step.mode === "precision" ? step.question : step.question.question;
    const choice = personaChoice(
      persona,
      question.id,
      question.options.map((option) => option.id),
    );
    asked.push(question.id);
    modes.push(
      step.mode === "precision" ? "precision" : step.question.source === "generic_focus" ? "generated" : "authored",
    );
    state = discoveryReducer(state, { type: "record_answer", answer: { questionId: question.id, answerId: choice } });
  }
  const end = discoveryStep(state);
  if (end?.status !== "complete") throw new Error(`${persona.id}: did not complete`);
  return { state, asked, modes, view: buildV2ResultView(end, state.selectedProjectIds, state.answers) };
}

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
