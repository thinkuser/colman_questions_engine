import type { ReactNode } from "react";
import type { ResultView } from "@/flow";
import {
  ResultHero,
  EvidenceSection,
  MirrorSection,
  TradeoffSection,
  SecondarySection,
  AlternativesSection,
} from "./ResultSections";
import {
  CareersSection,
  LearnSection,
  RealityChecksSection,
  RealWorldSection,
  WhyColmanSection,
} from "./ProgramSections";
import { ViewOnce } from "@/ui/components/ViewOnce";
import { CtaSection, NotYouSection, type ResultActionHandlers } from "./ResultActions";

/**
 * The candidate-facing result, assembled from a ResultView. Pure presentation (no hooks of its own beyond the
 * mirror's local feedback state), so it can be rendered to static markup in tests for every result kind.
 *
 * Order: answer first (hero), then why, the mirror, the real decision, what it means in practice, warnings,
 * the other option, why COLMAN (only after the fit explanation), actions, and an escape hatch.
 */
export function ResultPage({
  view,
  handlers,
  leadSlot,
}: {
  view: ResultView;
  handlers: ResultActionHandlers;
  /** Optional conversion block rendered after the actions and before the escape hatch (used by V2 only). */
  leadSlot?: ReactNode;
}) {
  return (
    <div className="space-y-5" data-result-kind={view.kind}>
      <ResultHero view={view} />
      <EvidenceSection view={view} />
      <MirrorSection view={view} onResponse={handlers.onMirrorResponse} />
      <AlternativesSection view={view} />
      <TradeoffSection view={view} />
      <LearnSection view={view} />
      <RealWorldSection view={view} />
      <CareersSection view={view} />
      <RealityChecksSection view={view} onCheckView={handlers.onRealityCheckView} />
      {view.kind !== "no_strong_fit" && (
        <ViewOnce onView={handlers.onSecondaryView}>
          <SecondarySection view={view} />
        </ViewOnce>
      )}
      <WhyColmanSection view={view} />
      <CtaSection view={view} handlers={handlers} />
      {leadSlot}
      <NotYouSection handlers={handlers} />
    </div>
  );
}
