"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildV2ResultView, discoveryStep } from "@/flow";
import { useDiscoveryAnalytics } from "@/ui/analytics/useDiscoveryAnalytics";
import { ResultPage } from "@/ui/components/result/ResultPage";
import { V2_PATHS } from "@/ui/routes";
import { useDiscovery, useDiscoveryGuard } from "@/ui/state/DiscoveryProvider";
import { DiscoveryStepIndicator } from "./DiscoveryStepIndicator";
import { GenericResultPage } from "./GenericResultPage";

/**
 * V2 result. Always the engine's output for the stored projects and answers (recomputed on refresh); this step builds
 * the view model from it and wires the actions. The Tech precision result keeps the V1 result page. The advisor CTA
 * destination is configuration (NEXT_PUBLIC_ADVISOR_URL); without it the CTA is not offered.
 */
export function DiscoveryResultStep() {
  const { state, dispatch } = useDiscovery();
  const router = useRouter();
  const analytics = useDiscoveryAnalytics();
  const allowed = useDiscoveryGuard("result");
  const advisorUrl = process.env.NEXT_PUBLIC_ADVISOR_URL ?? null;

  const view = useMemo(() => {
    if (!allowed) return null;
    const step = discoveryStep(state);
    return step?.status === "complete"
      ? buildV2ResultView(step, state.selectedProjectIds, state.answers, { advisorUrl })
      : null;
  }, [allowed, state, advisorUrl]);

  useEffect(() => {
    if (view) analytics.resultViewed();
  }, [view, analytics]);

  if (!view) return null;

  const restart = () => {
    dispatch({ type: "restart" });
    router.push(V2_PATHS.select);
  };
  // Back reopens the last question; the route guard then moves the URL to /v2/questions.
  const backToQuestion = () => dispatch({ type: "go_back" });

  return (
    <section className="space-y-6">
      <DiscoveryStepIndicator current="result" />
      {view.type === "generic" ? (
        <GenericResultPage
          view={view}
          handlers={{
            onAdmissionClick: analytics.admissionClick,
            onAdvisorClick: analytics.advisorClick,
            onOfficialProgramClick: analytics.officialProgramClick,
            onSecondaryView: analytics.secondaryProgramViewed,
            onRealityCheckView: analytics.realityCheckViewed,
            onBackToQuestion: backToQuestion,
            onRestart: restart,
          }}
        />
      ) : (
        <>
          <ResultPage
            view={view.view}
            handlers={{
              onRestart: restart,
              onMirrorResponse: analytics.mirrorResponse,
              onAdmissionClick: analytics.admissionClick,
              onAdvisorClick: analytics.advisorClick,
              onSecondaryView: analytics.secondaryProgramViewed,
              onRealityCheckView: (programId) => analytics.realityCheckViewed(programId),
              onBackToQuestion: backToQuestion,
              // The V1 "focused comparison" CTA is never offered in V2 (selected programs are passed empty).
              onCompareFocused: restart,
            }}
          />
          <p className="text-sm leading-snug text-slate-500">{view.disclaimerHe}</p>
        </>
      )}
    </section>
  );
}
