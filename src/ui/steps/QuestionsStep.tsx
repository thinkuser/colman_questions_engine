"use client";

import { useRouter } from "next/navigation";
import { ProgramList } from "@/ui/components/ProgramList";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { copy } from "@/ui/copy.he";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";
import { useStepGuard } from "@/ui/state/useStepGuard";

export function QuestionsStep() {
  const { state, dispatch } = useComparison();
  const router = useRouter();
  const allowed = useStepGuard("questions");

  if (!allowed) {
    return null;
  }

  function handleContinue() {
    // Skeleton: no scoring yet (THI-7). The flow completes without a computed result.
    dispatch({ type: "complete", result: null });
    router.push(STEP_PATHS.result);
  }

  return (
    <section className="space-y-6">
      <StepIndicator current="questions" />
      <h1 className="text-2xl font-bold">{copy.questions.heading}</h1>

      <div className="space-y-2">
        <p className="font-medium">{copy.questions.comparing}</p>
        <ProgramList programIds={state.selectedProgramIds} />
      </div>

      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-600">
        {copy.questions.placeholder}
      </p>

      <div className="flex justify-between gap-4">
        <button type="button" className="text-brand underline" onClick={() => router.push(STEP_PATHS.select)}>
          {copy.questions.back}
        </button>
        <button
          type="button"
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white"
          onClick={handleContinue}
        >
          {copy.questions.toResult}
        </button>
      </div>
    </section>
  );
}
