import { getWorldQuestionCopy } from "@/data";
import type { V2Step } from "@/engine";
import { buildV2QuestionView, type V2QuestionKind, type V2QuestionView } from "./v2QuestionView";

/**
 * Question view for the V3 experience. World questions (each world's opening scenario and the People/HR follow-ups)
 * carry their own copy; every other question (borrowed V2 focus questions, generated focus questions, reality checks,
 * V1 Tech precision questions) is rendered exactly as V2 renders it.
 *
 * `text` is the experience's presentation seam for the candidate-facing strings (V3: identity; V4: its
 * gender-inclusive wording, DEC-036). It never touches ids, option order or mappings.
 */
export function buildV3QuestionView(
  step: Extract<V2Step, { status: "ask" }>,
  text: (he: string) => string = (he) => he,
): V2QuestionView {
  const view = baseQuestionView(step);
  return {
    ...view,
    prompt: text(view.prompt),
    options: view.options.map((option) => ({ ...option, label: text(option.label) })),
  };
}

function baseQuestionView(step: Extract<V2Step, { status: "ask" }>): V2QuestionView {
  if (step.mode === "generic" && step.question.source === "cluster") {
    const question = step.question.question;
    const copy = getWorldQuestionCopy(question.id);
    if (copy) {
      return {
        id: question.id,
        prompt: copy.prompt,
        options: question.options.map((option) => {
          const label = copy.options.find((candidate) => candidate.id === option.id)?.label;
          if (!label) throw new Error(`No Hebrew copy for V3 option "${question.id}/${option.id}"`);
          return { id: option.id, label, isNeutral: option.realityLevel === null && option.programIds.length === 0 };
        }),
        analytics: {
          mode: "generic",
          kind: question.kind as V2QuestionKind,
          isGeneratedFocus: false,
          focusProgramCount: null,
        },
      };
    }
  }
  return buildV2QuestionView(step);
}
