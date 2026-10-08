"use client";

import { useEffect, useMemo } from "react";
import { buildV3ResultView, journeyStep, leadContextFromResult } from "@/flow";
import { LeadForm } from "@/ui/discovery/LeadForm";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { ResultPage } from "./ResultPage";
import { ProgressHeader } from "./shared";

/**
 * V3 result: the engine's output for the stored projects and answers (recomputed on refresh), presented through the
 * V3 view model. The lead form posts to the same `/api/v2/lead` as V2, tagged `flow_version: "v3"`.
 */
export function ResultStep() {
  const { strategy, state, restartToLanding, analytics, flowVersion, entryMode, ui, t, leadCopy } = useV3();
  const allowed = useV3Guard("result");

  const view = useMemo(() => {
    if (!allowed) return null;
    const step = journeyStep(strategy, state);
    return step?.status === "complete"
      ? buildV3ResultView(step, state.selectedIds, state.answers, { strategyId: strategy.id, text: t })
      : null;
  }, [allowed, strategy, state, t]);

  useEffect(() => {
    if (view) analytics.resultViewed();
  }, [view, analytics]);

  if (!view) return null;

  return (
    <section className="space-y-6">
      <ProgressHeader stage={3} />
      <ResultPage
        flow={flowVersion}
        view={view}
        copy={ui.result}
        handlers={{
          onProgramClick: analytics.programClick,
          onContactClick: analytics.contactClick,
          onAllProgramsClick: analytics.allProgramsClick,
          onDetailExpanded: analytics.detailExpanded,
          onSecondaryView: analytics.secondaryProgramViewed,
          onRestart: restartToLanding,
        }}
        leadForm={
          <LeadForm
            flowVersion={flowVersion}
            entryMode={flowVersion === "v4" ? (entryMode ?? undefined) : undefined}
            copy={leadCopy}
            placeholders={ui.lead.placeholders}
            context={leadContextFromResult(view.base)}
            selectedProjectIds={strategy.id === "worlds" ? [] : state.selectedIds}
            selectedWorldIds={strategy.id === "worlds" ? state.selectedIds : undefined}
            comparisonId={analytics.journeyId}
            analytics={{
              onView: analytics.leadFormViewed,
              onSubmit: analytics.leadFormSubmitted,
              onSuccess: analytics.leadFormSucceeded,
              onError: analytics.leadFormFailed,
            }}
          />
        }
      />
    </section>
  );
}
