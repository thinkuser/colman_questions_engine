"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildResultView } from "@/flow";
import { useAnalytics } from "@/ui/analytics/useAnalytics";
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
  const analytics = useAnalytics();
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
          onMirrorResponse: analytics.mirrorResponse,
          onAdmissionClick: analytics.admissionClick,
          onAdvisorClick: analytics.advisorClick,
          onSecondaryView: analytics.secondaryProgramViewed,
          onRealityCheckView: analytics.realityCheckViewed,
          // Back reopens the last question; the route guard then moves the URL to /questions.
          onBackToQuestion: () => dispatch({ type: "go_back" }),
          onCompareFocused: () => {
            const pair = view.ctas.compareFocused;
            // Tracked as restart_comparison; the preselected pair is programmatic, not a candidate selection.
            dispatch({ type: "restart" });
            for (const programId of pair ?? []) {
              dispatch({ type: "toggle_program", programId }, { silent: true });
            }
            router.push(STEP_PATHS.select);
          },
        }}
      />
    </section>
  );
}
