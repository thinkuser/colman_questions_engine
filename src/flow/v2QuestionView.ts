import { getCatalogProgram, getQuestionCopyHe, getV2QuestionCopy, NEUTRAL_OPTION_HE, V2_RESULT_COPY } from "@/data";
import type { V2Step } from "@/engine";

/**
 * What the question screen shows for the engine's next step (THI-16). Authored V2 questions, generated 2-/3-way
 * focus questions and V1 precision questions all become the same candidate-facing shape, so one reusable question
 * UI renders them. The candidate-facing fields (prompt, option labels) never contain question kinds, program ids,
 * weights or scores. The `analytics` block is metadata for the tracker only and is never rendered.
 */

export interface V2QuestionOption {
  id: string;
  label: string;
  isNeutral: boolean;
}

export type V2QuestionKind = "scenario" | "focus" | "tiebreaker" | "reality_check";

export interface V2QuestionView {
  id: string;
  prompt: string;
  options: V2QuestionOption[];
  analytics: {
    mode: "generic" | "precision";
    /** Absent for V1 precision questions, which keep their own `question_type` vocabulary. */
    kind: V2QuestionKind | null;
    isGeneratedFocus: boolean;
    /** Number of programs a generated focus question compares (2 or 3); null otherwise. */
    focusProgramCount: number | null;
  };
}

const NEUTRAL_OPTION_ID = "neither";

export function buildV2QuestionView(step: Extract<V2Step, { status: "ask" }>): V2QuestionView {
  if (step.mode === "precision") {
    const copy = getQuestionCopyHe(step.question.id);
    return {
      id: step.question.id,
      prompt: copy.prompt,
      options: copy.options.map((option) => ({ ...option, isNeutral: option.id === NEUTRAL_OPTION_ID })),
      analytics: { mode: "precision", kind: null, isGeneratedFocus: false, focusProgramCount: null },
    };
  }

  const asked = step.question;
  if (asked.source === "generic_focus") {
    const question = asked.question;
    return {
      id: question.id,
      prompt: V2_RESULT_COPY.generatedFocusPrompt,
      options: question.options.map((option) => {
        const programId = option.programIds[0];
        const statement = programId ? getCatalogProgram(programId)?.workStatementsHe[question.statementIndex] : null;
        return programId
          ? { id: option.id, label: statement ?? "", isNeutral: false }
          : { id: option.id, label: NEUTRAL_OPTION_HE, isNeutral: true };
      }),
      analytics: {
        mode: "generic",
        kind: "focus",
        isGeneratedFocus: true,
        focusProgramCount: question.programIds.length,
      },
    };
  }

  const question = asked.question;
  const copy = getV2QuestionCopy(question.id);
  if (!copy) throw new Error(`No Hebrew copy for V2 question "${question.id}"`);
  return {
    id: question.id,
    prompt: copy.prompt,
    options: question.options.map((option) => {
      const label = copy.options.find((candidate) => candidate.id === option.id)?.label;
      if (!label) throw new Error(`No Hebrew copy for V2 option "${question.id}/${option.id}"`);
      return {
        id: option.id,
        label,
        isNeutral: option.realityLevel === null && option.programIds.length === 0,
      };
    }),
    analytics: {
      mode: "generic",
      kind: question.kind,
      isGeneratedFocus: false,
      focusProgramCount: null,
    },
  };
}
