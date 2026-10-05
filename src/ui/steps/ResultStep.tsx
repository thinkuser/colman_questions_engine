"use client";

import { useRouter } from "next/navigation";
import { ProgramList } from "@/ui/components/ProgramList";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { copy } from "@/ui/copy.he";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";
import { useStepGuard } from "@/ui/state/useStepGuard";

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

      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-slate-600">{copy.result.placeholder}</p>

      <div className="space-y-2">
        <p className="font-medium">{copy.result.compared}</p>
        <ProgramList programIds={state.selectedProgramIds} />
      </div>

      <button
        type="button"
        className="rounded-lg border border-brand px-6 py-3 font-semibold text-brand"
        onClick={handleRestart}
      >
        {copy.result.restart}
      </button>
    </section>
  );
}
