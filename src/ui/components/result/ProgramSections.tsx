import type { ReactNode } from "react";
import type { ResultView } from "@/flow";
import { ProgramName } from "@/ui/components/ProgramName";
import type { ProgramId } from "@/engine";
import { ViewOnce } from "@/ui/components/ViewOnce";
import { copy } from "@/ui/copy.he";

/**
 * Sections about the recommended program and the warnings that go with the decision. Content comes from the
 * structured program data and result copy through the ResultView; official facts are shown verbatim.
 */

function Card({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 break-words"
    >
      {children}
    </section>
  );
}

export function LearnSection({ view }: { view: ResultView }) {
  const content = view.topContent;
  if (!content || content.learnThemes.length === 0) return null;
  return (
    <Card label={copy.result.learnTitle}>
      <h2 className="text-lg font-bold">{copy.result.learnTitle}</h2>
      <ul className="space-y-4">
        {content.learnThemes.map((theme) => (
          <li key={theme.titleHe} className="space-y-2">
            <h3 className="font-semibold text-brand">{theme.titleHe}</h3>
            {theme.facts.map((fact) => (
              <p key={fact} className="text-slate-700">
                {fact}
              </p>
            ))}
            {theme.courses.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {theme.courses.map((course) => (
                  <li key={course} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                    {course}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{copy.result.learnNote}</p>
    </Card>
  );
}

export function RealWorldSection({ view }: { view: ResultView }) {
  const content = view.topContent;
  if (!content) return null;
  return (
    <Card label={copy.result.realWorldTitle}>
      <h2 className="text-lg font-bold">{copy.result.realWorldTitle}</h2>
      <p>
        <span className="font-semibold">{copy.result.realWorldChallenge} </span>
        {content.realWorld.challengeHe}
      </p>
      <ol className="space-y-2">
        {content.realWorld.stepsHe.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
            >
              {index + 1}
            </span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function CareersSection({ view }: { view: ResultView }) {
  const careers = view.topContent?.careers ?? [];
  if (careers.length === 0) return null;
  return (
    <Card label={copy.result.careersTitle}>
      <h2 className="text-lg font-bold">{copy.result.careersTitle}</h2>
      <ul className="flex flex-wrap gap-2">
        {careers.map((career) => (
          <li key={career} className="rounded-full bg-slate-100 px-3 py-1 text-sm" dir="auto">
            {career}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{copy.result.careersNote}</p>
    </Card>
  );
}

/** Warnings, never disqualification: shown only for checks the engine triggered. */
export function RealityChecksSection({
  view,
  onCheckView,
}: {
  view: ResultView;
  onCheckView?: (programId: ProgramId) => void;
}) {
  if (view.realityChecks.length === 0) return null;
  return (
    <Card label={copy.result.realityTitle}>
      <h2 className="text-lg font-bold">{copy.result.realityTitle}</h2>
      <ul className="space-y-3">
        {view.realityChecks.map((check) => (
          <li key={check.id}>
            <ViewOnce
              data-reality-check={check.id}
              className="min-w-0 space-y-1 rounded-xl bg-amber-50 p-3"
              onView={() => onCheckView?.(check.program.id)}
            >
              <ProgramName program={check.program} className="font-semibold" />
              {check.leadLines.map((line) => (
                <p key={line}>{line}.</p>
              ))}
              <p className="text-slate-700">{check.bodyHe}</p>
            </ViewOnce>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function WhyColmanSection({ view }: { view: ResultView }) {
  const items = view.topContent?.whyColman ?? [];
  if (items.length === 0) return null;
  return (
    <Card label={copy.result.whyColmanTitle}>
      <h2 className="text-lg font-bold">{copy.result.whyColmanTitle}</h2>
      <ul className="list-disc space-y-2 ps-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}
