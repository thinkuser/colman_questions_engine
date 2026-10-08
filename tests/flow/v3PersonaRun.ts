import {
  buildV3ResultView,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  WORLD_STRATEGY,
  type JourneyState,
} from "@/flow";
import { v3PersonaChoice, type V3Persona } from "./v3Personas";

/** Engine-level run of a V3 world persona through the real journey reducer and world strategy. */
export function runV3Persona(persona: V3Persona) {
  let state: JourneyState = persona.worlds.reduce(
    (current, entryId) => journeyReducer(WORLD_STRATEGY, current, { type: "toggle_entry", entryId }),
    initialJourneyState,
  );
  state = journeyReducer(WORLD_STRATEGY, state, { type: "start" });
  const asked: string[] = [];
  const modes: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const step = journeyStep(WORLD_STRATEGY, state);
    if (step?.status === "needs_focus_content") throw new Error(`${persona.id}: content gap`);
    if (step?.status !== "ask") break;
    const question = step.mode === "precision" ? step.question : step.question.question;
    const choice = v3PersonaChoice(
      persona,
      question.id,
      question.options.map((option) => option.id),
    );
    asked.push(question.id);
    modes.push(step.mode);
    state = journeyReducer(WORLD_STRATEGY, state, {
      type: "record_answer",
      answer: { questionId: question.id, answerId: choice },
    });
  }
  const end = journeyStep(WORLD_STRATEGY, state);
  if (end?.status !== "complete") throw new Error(`${persona.id}: did not complete`);
  return { state, step: end, asked, modes, view: buildV3ResultView(end, state.selectedIds, state.answers) };
}
