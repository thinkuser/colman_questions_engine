"use client";

import { useState, type ReactNode } from "react";
import type { ResultView } from "@/flow";
import { ProgramName } from "@/ui/components/ProgramName";
import { copy } from "@/ui/copy.he";

/**
 * Result sections that explain the recommendation. They render a ResultView and nothing else: no scoring, no
 * routing, no program-specific copy. Mobile-first stacked cards; `min-w-0` / `break-words` keep long Hebrew text
 * and the MIS qualifier from overflowing at 320px.
 */

function Card({ children, emphasis = false, label }: { children: ReactNode; emphasis?: boolean; label?: string }) {
  return (
    <section
      aria-label={label}
      className={`min-w-0 space-y-3 rounded-2xl border p-4 break-words ${
        emphasis ? "border-2 border-brand bg-brand/5" : "border-slate-200 bg-white"
      }`}
    >
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>;
}

export function ResultHero({ view }: { view: ResultView }) {
  const { hero, kind, top, second } = view;
  if (kind === "no_strong_fit") {
    return (
      <header className="space-y-3" data-result-kind={kind}>
        <h1 className="text-2xl leading-snug font-bold">{hero.headingHe}</h1>
        <p className="text-slate-700">{hero.bodyHe}</p>
      </header>
    );
  }
  if (kind === "near_tie") {
    return (
      <header className="space-y-4" data-result-kind={kind}>
        <div className="space-y-2">
          <h1 className="text-2xl leading-snug font-bold">{hero.headingHe}</h1>
          <p className="text-slate-700">{hero.bodyHe}</p>
        </div>
        <div className="grid gap-3">
          {[
            { program: top, tag: copy.result.nearTieTopTag },
            { program: second, tag: copy.result.nearTieSecondTag },
          ].map(({ program, tag }) => (
            <div key={program.id} className="min-w-0 rounded-2xl border-2 border-brand bg-brand/5 p-4 break-words">
              <p className="text-sm font-semibold text-brand">{tag}</p>
              <ProgramName program={program} className="text-xl font-bold" />
            </div>
          ))}
        </div>
      </header>
    );
  }
  return (
    <header className="space-y-3 rounded-2xl bg-brand/5 p-5 break-words" data-result-kind={kind}>
      <p className="text-sm font-semibold text-brand">{hero.eyebrowHe}</p>
      <h1 className="text-3xl leading-tight font-bold">
        <ProgramName program={top} />
      </h1>
      {view.topContent && <p className="text-slate-700">{view.topContent.positioningHe}</p>}
      {hero.fitNoteHe && <p className="text-sm text-slate-600">{hero.fitNoteHe}</p>}
    </header>
  );
}

export function EvidenceSection({ view }: { view: ResultView }) {
  if (view.evidence.length === 0) return null;
  return (
    <Card label={copy.result.whyTitle}>
      <SectionTitle>{copy.result.whyTitle}</SectionTitle>
      <ul className="space-y-2">
        {view.evidence.map((item) => (
          <li
            key={`${item.questionId}/${item.answerId}`}
            data-evidence-kind={item.kind}
            className={`border-s-4 ps-3 ${
              item.kind === "mixed"
                ? "border-amber-400"
                : item.kind === "supports"
                  ? "border-brand"
                  : "border-slate-300"
            }`}
          >
            {item.kind === "mixed" && <span className="font-semibold">{copy.result.evidenceMixedLabel}: </span>}
            {item.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Reflection of the result, not a score. The response stays local to the page and never changes the result. */
export function MirrorSection({ view }: { view: ResultView }) {
  const [response, setResponse] = useState<"yes" | "no" | null>(null);
  return (
    <Card label={copy.result.mirrorTitle}>
      <SectionTitle>{copy.result.mirrorTitle}</SectionTitle>
      <p className="text-lg leading-relaxed">{view.mirrorHe}</p>
      {response === null ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-semibold text-white"
            onClick={() => setResponse("yes")}
          >
            {copy.result.mirrorYes}
          </button>
          <button
            type="button"
            className="min-h-12 flex-1 rounded-xl border-2 border-brand px-4 font-semibold text-brand"
            onClick={() => setResponse("no")}
          >
            {copy.result.mirrorNo}
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-600" role="status">
          {response === "yes" ? copy.result.mirrorYesThanks : copy.result.mirrorNoThanks}
        </p>
      )}
    </Card>
  );
}

export function TradeoffSection({ view }: { view: ResultView }) {
  const tradeoff = view.tradeoff;
  if (!tradeoff) return null;
  return (
    <Card label={copy.result.tradeoffTitle} emphasis={view.kind === "near_tie"}>
      <SectionTitle>{copy.result.tradeoffTitle}</SectionTitle>
      {tradeoff.axisHe && <p className="font-semibold">{tradeoff.axisHe}</p>}
      <div className="grid gap-2">
        {[
          { program: view.top, side: tradeoff.topSideHe },
          { program: view.second, side: tradeoff.secondSideHe },
        ].map(({ program, side }) => (
          <div key={program.id} className="min-w-0 rounded-xl bg-slate-50 p-3">
            <ProgramName program={program} className="font-semibold" />
            <p className="mt-1 text-slate-700">{side}</p>
          </div>
        ))}
      </div>
      {tradeoff.decidedByHe.length > 0 && (
        <p>
          <span className="font-semibold">{copy.result.decidedBy} </span>
          {tradeoff.decidedByHe.join("; ")}.
        </p>
      )}
      {tradeoff.counterHe && (
        <p>
          <span className="font-semibold">{copy.result.counter} </span>
          {tradeoff.counterHe}.
        </p>
      )}
      {tradeoff.sharedFirstYearNote && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <span className="font-semibold">{copy.result.sharedYearTitle} </span>
          {tradeoff.sharedFirstYearNote}
        </p>
      )}
    </Card>
  );
}

export function SecondarySection({ view }: { view: ResultView }) {
  const { secondary, tradeoff, kind } = view;
  if (kind === "no_strong_fit") return null;
  return (
    <Card label={copy.result.secondaryTitle} emphasis={kind === "near_tie"}>
      <SectionTitle>{copy.result.secondaryTitle}</SectionTitle>
      <ProgramName program={secondary.program} className="text-lg font-semibold" />
      <p className="text-slate-700">{secondary.positioningHe}</p>
      {secondary.whyItFitsHe.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold">{copy.result.secondaryFits}</p>
          <ul className="list-disc space-y-1 ps-5">
            {secondary.whyItFitsHe.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}
      {tradeoff?.axisHe && (
        <p>
          <span className="font-semibold">{copy.result.secondaryDifference} </span>
          {tradeoff.axisHe}.
        </p>
      )}
    </Card>
  );
}

/** No-strong-fit variant: the two closer options, softly, never called a recommendation. */
export function AlternativesSection({ view }: { view: ResultView }) {
  if (view.kind !== "no_strong_fit" || !view.noFit) return null;
  return (
    <Card label={copy.result.alternativesTitle}>
      <SectionTitle>{copy.result.alternativesTitle}</SectionTitle>
      <p className="text-slate-700">{view.noFit.alternativesHe}</p>
      <ul className="space-y-2">
        {[view.top, view.second].map((program) => (
          <li key={program.id} className="min-w-0 rounded-xl bg-slate-50 p-3">
            <ProgramName program={program} className="font-semibold" />
          </li>
        ))}
      </ul>
      <p className="text-slate-700">{view.noFit.exploreHe}</p>
    </Card>
  );
}
