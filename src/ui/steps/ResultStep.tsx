"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildResultView } from "@/flow";
import { ResultPage } from "@/ui/components/result/ResultPage";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";
import { useStepGuard } from "@/ui/state/useStepGuard";

/**
 * Candidate-facing result (THI-10). The result is always the engine's output for the stored answers (recomputed on
 * refresh); this step only builds the view model from it and wires the actions to the flow.
 * The advisor CTA destination is configuration (NEXT_PUBLIC_ADVISOR_URL); without it the CTA is not offered.
 */
export function ResultStep() {
  const { state, dispatch } = useComparison();
  const router = useRouter();
  const allowed = useStepGuard("result");
  const { result, answers, selectedProgramIds } = state;
  const advisorUrl = process.env.NEXT_PUBLIC_ADVISOR_URL ?? null;
  const view = useMemo(
    () => (allowed && result ? buildResultView(result, answers, selectedProgramIds, { advisorUrl }) : null),
    [allowed, result, answers, selectedProgramIds, advisorUrl],
  );

  if (!view) {
    return null;
  }

  const restart = () => {
    dispatch({ type: "restart" });
    router.push(STEP_PATHS.select);
  };

  return (
    <section className="space-y-6">
      <StepIndicator current="result" />
      <ResultPage
        view={view}
        handlers={{
          onRestart: restart,
          // Back reopens the last question; the route guard then moves the URL to /questions.
          onBackToQuestion: () => dispatch({ type: "go_back" }),
          onCompareFocused: () => {
            const pair = view.ctas.compareFocused;
            dispatch({ type: "restart" });
            for (const programId of pair ?? []) {
              dispatch({ type: "toggle_program", programId });
            }
            router.push(STEP_PATHS.select);
          },
        }}
      />
    </section>
  );
}
