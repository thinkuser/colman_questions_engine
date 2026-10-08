"use client";

import { useEffect, useMemo } from "react";
import { resultFeedbackKey } from "@/analytics";
import { buildV3ResultView, journeyStep, leadContextFromResult } from "@/flow";
import { LeadForm } from "@/ui/discovery/LeadForm";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { ResultFeedback } from "./ResultFeedback";
import { ResultPage } from "./ResultPage";
import { ProgressHeader } from "./shared";

/**
 * V3 result: the engine's output for the stored projects and answers (recomputed on refresh), presented through the
 * V3 view model. The lead form posts to the same `/api/v2/lead` as V2, tagged `flow_version: "v3"`.
 */
export function ResultStep() {
  const {
    strategy,
    state,
    restartToLanding,
    analytics,
    flowVersion,
    entryMode,
    ui,
    t,
    leadCopy,
    outboundUrl,
    resultFeedbackCopy,
  } = useV3();
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

  // V5 pilot measurement (DEC-038): ui_click alongside the existing semantic result events. V3/V4 have no uiClick,
  // so for them these wrappers only call the existing handlers.
  const click = analytics.uiClick;

  return (
    <section className="space-y-6">
      <ProgressHeader stage={3} />
      <ResultPage
        flow={flowVersion}
        view={view}
        copy={ui.result}
        outboundUrl={outboundUrl}
        handlers={{
          onProgramClick: (programId, role, position) => {
            click?.({
              element_id: "result_program",
              element_type: "link",
              screen_id: "result",
              destination_type: "program",
              program_id: programId,
              link_role: role,
              cta_position: position,
            });
            analytics.programClick(programId, role, position);
          },
          onContactClick: (position) => {
            click?.({
              element_id: "result_contact",
              element_type: "button",
              screen_id: "result",
              destination_type: "lead_anchor",
              cta_position: position,
            });
            analytics.contactClick(position);
          },
          onAllProgramsClick: () => {
            click?.({
              element_id: "result_all_programs",
              element_type: "link",
              screen_id: "result",
              destination_type: "all_programs",
            });
            analytics.allProgramsClick();
          },
          onDetailExpanded: analytics.detailExpanded,
          onDetailToggle: (section) =>
            click?.({
              element_id: "result_detail_expand",
              element_type: "detail_toggle",
              screen_id: "result",
              detail_section: section,
            }),
          onSecondaryView: analytics.secondaryProgramViewed,
          // reality_check_view: wired with the V5 measurement layer only (V3/V4 payloads stay as they were).
          onRealityView: click ? analytics.realityCheckViewed : undefined,
          onRestart: (position) => {
            click?.({
              element_id: "result_try_again",
              element_type: "button",
              screen_id: "result",
              destination_type: "restart",
              ...(position ? { cta_position: position } : {}),
            });
            restartToLanding();
          },
        }}
        feedback={
          resultFeedbackCopy && analytics.feedbackViewed && analytics.feedbackSubmitted ? (
            <ResultFeedback
              key={resultFeedbackKey(analytics.journeyId(), state.selectedIds, state.answers)}
              kind={view.kind}
              resultKey={resultFeedbackKey(analytics.journeyId(), state.selectedIds, state.answers)}
              copy={resultFeedbackCopy}
              onView={analytics.feedbackViewed}
              onSubmit={analytics.feedbackSubmitted}
              onUiClick={click}
            />
          ) : undefined
        }
        leadForm={
          <LeadForm
            flowVersion={flowVersion}
            entryMode={flowVersion !== "v3" ? (entryMode ?? undefined) : undefined}
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
              onSubmitClick: click
                ? () => click({ element_id: "lead_submit", element_type: "button", screen_id: "lead" })
                : undefined,
            }}
          />
        }
      />
    </section>
  );
}
