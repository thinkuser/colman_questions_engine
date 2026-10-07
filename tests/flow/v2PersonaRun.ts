import { buildV2ResultView, discoveryReducer, discoveryStep, initialDiscoveryState, type DiscoveryState } from "@/flow";
import { personaChoice, type V2Persona } from "./v2Personas";

/** Engine-level run of every acceptance persona (the same data drives the browser suite). */
export function runPersona(persona: V2Persona) {
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
