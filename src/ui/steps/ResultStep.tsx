"use client";

import { useRouter } from "next/navigation";
import { getQuestionCopyHe } from "@/data";
import { ProgramList } from "@/ui/components/ProgramList";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { copy } from "@/ui/copy.he";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";
import { useStepGuard } from "@/ui/state/useStepGuard";

/**
 * Temporary completion screen (THI-9): proves the select, questions, complete flow works end to end.
 * The real recommendation experience is THI-10. No scores, rankings or percentages are shown here.
 */
export function ResultStep() {
  const { state, dispatch } = useComparison();
  const router = useRouter();
  const allowed = useStepGuard("result");

  if (!allowed) {
    return null;
  }

  function handleRestart() {
    dispatch({ type: "restart" });
    router.push(STEP_PATHS.select);
  }

  return (
    <section className="space-y-6">
      <StepIndicator current="result" />
      <h1 className="text-2xl font-bold">{copy.result.heading}</h1>
      <p className="text-slate-600">{copy.result.placeholder}</p>

      <div className="space-y-2">
        <p className="font-medium">{copy.result.compared}</p>
        <ProgramList programIds={state.selectedProgramIds} />
      </div>

      <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4" data-testid="dev-summary">
        <h2 className="font-semibold">{copy.result.summaryHeading}</h2>
        <p className="text-sm text-slate-600">{copy.result.answeredCount(state.answers.length)}</p>
        <ol className="space-y-3 text-sm">
          {state.answers.map(({ questionId, answerId }) => {
            const questionCopy = getQuestionCopyHe(questionId);
            const chosen = questionCopy.options.find((option) => option.id === answerId);
            return (
              <li key={questionId}>
                <p className="text-slate-600">{questionCopy.prompt}</p>
                <p className="font-medium">{chosen?.label}</p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-brand underline"
          onClick={() => dispatch({ type: "go_back" })}
        >
          {copy.result.back}
        </button>
        <button
          type="button"
          className="min-h-12 rounded-xl border-2 border-brand px-6 py-3 font-semibold text-brand"
          onClick={handleRestart}
        >
          {copy.result.restart}
        </button>
      </div>
    </section>
  );
}
