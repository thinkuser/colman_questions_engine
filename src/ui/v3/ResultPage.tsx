"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { V3_COPY } from "@/data";
import type { V3Note, V3PairView, V3Program, V3ResultView } from "@/flow";
import { LogoMark, StickyBar, v3Primary, v3Secondary } from "./shared";

export interface V3ResultHandlers {
  onProgramClick: (programId: string, role: "primary" | "alternative" | "peer", position: string) => void;
  onContactClick: (position: string) => void;
  onAllProgramsClick: () => void;
  onDetailExpanded: (section: string) => void;
  onSecondaryView: () => void;
  onRestart: () => void;
}

const copy = V3_COPY.result;
const LEAD_ID = "v3-lead";

function ProgramLink({
  program,
  role,
  position,
  className,
  label,
  onClick,
}: {
  program: V3Program;
  role: "primary" | "alternative" | "peer";
  position: string;
  className: string;
  label: string;
  onClick: V3ResultHandlers["onProgramClick"];
}) {
  if (!program.programUrl) return null;
  return (
    <a
      href={program.programUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-link-role={role}
      data-cta-position={position}
      onClick={() => onClick(program.programId, role, position)}
    >
      {label}
      <span className="sr-only"> (נפתח בלשונית חדשה)</span>
    </a>
  );
}

function Detail({
  id,
  title,
  onOpen,
  children,
}: {
  id: string;
  title: string;
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <details
      data-detail-id={id}
      className="rounded-2xl border border-colman-border bg-white"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen(id);
      }}
    >
      <summary className="flex min-h-12 cursor-pointer items-center px-4 py-3 font-semibold text-colman-blue-dark">
        {title}
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

function Note({ note }: { note: V3Note }) {
  return (
    <section
      aria-label={note.headingHe}
      data-reality-level={note.level}
      data-program-id={note.programId ?? undefined}
      className="min-w-0 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 break-words"
    >
      <h2 className="text-base font-bold text-slate-900">{note.headingHe}</h2>
      <p className="leading-snug text-slate-800">{note.textHe}</p>
    </section>
  );
}

function PairBlock({ pair }: { pair: V3PairView }) {
  return (
    <section
      aria-label={copy.differenceTitle}
      data-testid="pair-difference"
      data-pair-curated={pair.curated}
      className="min-w-0 space-y-4"
    >
      <h2 className="text-lg font-bold text-colman-blue-dark">{copy.differenceTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {pair.programs.map((program, index) => (
          <div
            key={program.programId}
            data-direction-id={program.programId}
            className="min-w-0 space-y-2 rounded-2xl border-2 border-colman-border bg-white p-4 break-words"
          >
            <h3 className="text-lg font-bold text-colman-blue-dark">{program.displayNameHe}</h3>
            <ul className="list-disc space-y-1 ps-5 leading-snug text-slate-800">
              {pair.bullets[index]?.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {pair.guidance.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-colman-surface p-4" data-testid="pair-guidance">
          <h3 className="font-bold text-colman-blue-dark">{copy.guidanceTitle}</h3>
          <ul className="space-y-1 leading-snug text-slate-800">
            {pair.guidance.map((entry) => (
              <li key={entry.programId}>
                {entry.ifHe} ← <span className="font-semibold">{entry.programNameHe}</span>.
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The V3 result. The top answers three questions at once: what is my result (hero), why (short, in meaning not echo),
 * and what next (two actions, right away). The page then shifts from "your result" to "what this means at COLMAN" (a
 * distinct branded section with the official logo), keeps detail collapsed, offers an easy way out, and ends with the
 * lead form and the link to all programs. Presentation only: it renders a `V3ResultView` and reports what happened.
 */
export function ResultPage({
  view,
  handlers,
  leadForm,
}: {
  view: V3ResultView;
  handlers: V3ResultHandlers;
  leadForm: ReactNode;
}) {
  const [primary, second] = view.programs;
  const leadRef = useRef<HTMLDivElement>(null);
  const [leadVisible, setLeadVisible] = useState(false);

  // The sticky contact button steps aside while the form itself is on screen.
  useEffect(() => {
    const el = leadRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setLeadVisible(Boolean(entry?.isIntersecting)), {
      threshold: 0.15,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function goToLead(position: string) {
    handlers.onContactClick(position);
    const el = leadRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  const importantNotes = view.notes.filter((note) => note.important);
  const moreNotes = view.notes.filter((note) => !note.important);
  const showColman = view.kind !== "insufficient_positive_evidence" && view.programs.length > 0;
  const colmanPrograms = view.kind === "recommended" ? [view.programs[0]!] : view.programs;

  return (
    <div className="space-y-6" data-result-flow="v3" data-result-kind={view.kind} data-result-source={view.source}>
      {/* 1. Hero: the result */}
      <header className="colman-wash space-y-3 rounded-3xl border border-colman-border p-6" data-testid="result-hero">
        {view.kind === "recommended" && primary && (
          <>
            <p className="text-sm font-bold text-colman-purple-ink">{copy.recommendedLabel}</p>
            <h1
              className="text-3xl leading-tight font-extrabold break-words text-colman-blue-dark sm:text-4xl"
              data-testid="result-program-name"
            >
              {primary.nameHe}
            </h1>
            {primary.qualifierHe && <p className="text-base font-semibold text-slate-700">{primary.qualifierHe}</p>}
            <p className="text-lg leading-snug text-slate-800">{primary.summaryHe}</p>
          </>
        )}
        {view.kind === "near_tie" && (
          <>
            <h1 className="text-2xl leading-snug font-extrabold text-colman-blue-dark sm:text-3xl">
              {copy.nearTieHeading}
            </h1>
            <p className="text-lg leading-snug text-slate-800">{copy.nearTieBody}</p>
          </>
        )}
        {view.kind === "insufficient_positive_evidence" && (
          <>
            <h1 className="text-2xl leading-snug font-extrabold text-colman-blue-dark sm:text-3xl">
              {copy.insufficientHeading}
            </h1>
            <p className="text-lg leading-snug text-slate-800">{copy.insufficientBody}</p>
          </>
        )}
      </header>

      {/* 2. Immediate actions: the official program, and contact */}
      <div className="space-y-3" data-testid="hero-actions">
        {view.kind === "recommended" && primary && (
          <ProgramLink
            program={primary}
            role="primary"
            position="hero"
            className={v3Primary}
            label={copy.programCta}
            onClick={handlers.onProgramClick}
          />
        )}
        {view.kind === "near_tie" &&
          view.programs.map((program) => (
            <ProgramLink
              key={program.programId}
              program={program}
              role="peer"
              position="hero"
              className={v3Primary}
              label={copy.programCtaFor(program.displayNameHe)}
              onClick={handlers.onProgramClick}
            />
          ))}
        {view.kind === "insufficient_positive_evidence" && (
          <button type="button" className={v3Primary} data-testid="hero-try-again" onClick={handlers.onRestart}>
            {copy.tryAgain}
          </button>
        )}
        <button
          type="button"
          className={v3Secondary}
          data-testid="hero-contact"
          data-cta-position="hero"
          onClick={() => goToLead("hero")}
        >
          {copy.contactCta}
        </button>
      </div>

      {/* 3. Short why (meaning, not an echo of the choices) */}
      {view.kind === "recommended" && primary && (
        <section aria-label={copy.whyTitle} className="min-w-0 space-y-3" data-testid="why">
          <h2 className="text-lg font-bold text-colman-blue-dark">{copy.whyTitle}</h2>
          <ul className="space-y-2">
            {primary.whyHe.map((line) => (
              <li key={line} className="flex items-start gap-3 leading-snug text-slate-800">
                <svg
                  viewBox="0 0 16 16"
                  className="mt-1 size-5 shrink-0 text-colman-blue"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* An important warning is never collapsed (calm, never disqualifying) */}
      {importantNotes.map((note, index) => (
        <Note key={`${note.programId}-${index}`} note={note} />
      ))}

      {/* 4. Comparison / secondary */}
      {view.kind === "near_tie" && view.pair && <PairBlock pair={view.pair} />}

      {view.kind === "recommended" && second && (
        <section
          aria-label={copy.secondaryTitle}
          data-direction-id={second.programId}
          data-testid="secondary"
          className="min-w-0 space-y-2 rounded-2xl bg-colman-surface p-4 break-words"
        >
          <SecondaryView onView={handlers.onSecondaryView} />
          <h2 className="text-lg font-bold text-colman-blue-dark">{copy.secondaryTitle}</h2>
          <h3 className="font-bold text-slate-900">{second.displayNameHe}</h3>
          <p className="leading-snug text-slate-700">{second.summaryHe}</p>
          <ProgramLink
            program={second}
            role="alternative"
            position="secondary"
            className="inline-flex min-h-11 items-center font-semibold text-colman-blue underline"
            label={copy.programCtaFor(second.displayNameHe)}
            onClick={handlers.onProgramClick}
          />
        </section>
      )}

      {view.kind === "insufficient_positive_evidence" && primary && (
        <section
          aria-label={copy.weakLabel}
          data-direction-id={primary.programId}
          className="min-w-0 space-y-2 rounded-2xl bg-colman-surface p-4 break-words"
        >
          <h2 className="text-lg font-bold text-colman-blue-dark">{copy.weakLabel}</h2>
          <h3 className="font-bold text-slate-900">{primary.displayNameHe}</h3>
          <p className="leading-snug text-slate-700">{primary.summaryHe}</p>
          <ProgramLink
            program={primary}
            role="alternative"
            position="weak_direction"
            className="inline-flex min-h-11 items-center font-semibold text-colman-blue underline"
            label={copy.programCtaFor(primary.displayNameHe)}
            onClick={handlers.onProgramClick}
          />
        </section>
      )}

      {/* 5. What it means at COLMAN: a clear phase shift, with the official logo */}
      {showColman && (
        <section
          aria-label={copy.colmanTitle}
          data-testid="colman-section"
          className="colman-dark-surface rounded-3xl p-6 text-white"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-white p-1.5">
                <LogoMark size={48} />
              </span>
              <p className="text-lg font-bold">המכללה למינהל</p>
            </div>
            <h2 className="text-2xl font-extrabold">{copy.colmanTitle}</h2>
            {colmanPrograms.map((program) => (
              <div key={program.programId} className="space-y-2" data-colman-program={program.programId}>
                {colmanPrograms.length > 1 && <h3 className="text-lg font-bold">{program.displayNameHe}</h3>}
                <p className="text-sm font-semibold text-white/90">{copy.colmanExamples}</p>
                <ul className="list-disc space-y-1 ps-5 leading-snug">
                  {program.findHe.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
            {view.limitedFacts && <p className="text-sm text-white/90">{copy.colmanFactsNote}</p>}
            <div className="space-y-3 pt-1">
              {colmanPrograms.map((program) => (
                <ProgramLink
                  key={program.programId}
                  program={program}
                  role={view.kind === "near_tie" ? "peer" : "primary"}
                  position="colman_section"
                  className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-center font-semibold text-colman-blue-dark transition-colors hover:bg-colman-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  label={view.kind === "near_tie" ? copy.programCtaFor(program.displayNameHe) : copy.programCta}
                  onClick={handlers.onProgramClick}
                />
              ))}
              <button
                type="button"
                data-cta-position="colman_section"
                className="flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-white px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                onClick={() => goToLead("colman_section")}
              >
                {copy.contactCta}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 6. Optional detail, collapsed */}
      {(view.chosenHe.length > 0 || moreNotes.length > 0) && (
        <div className="space-y-3" data-testid="details">
          {view.chosenHe.length > 0 && (
            <Detail id="why_result" title={copy.detailChosenTitle} onOpen={handlers.onDetailExpanded}>
              <p className="text-sm font-semibold text-slate-600">{copy.detailChosenLead}</p>
              <ul className="space-y-2">
                {view.chosenHe.map((text) => (
                  <li key={text} className="rounded-lg bg-colman-surface p-3 leading-snug break-words text-slate-800">
                    {text}
                  </li>
                ))}
              </ul>
            </Detail>
          )}
          {moreNotes.length > 0 && (
            <Detail id="more_to_know" title={copy.detailMoreTitle} onOpen={handlers.onDetailExpanded}>
              {moreNotes.map((note, index) => (
                <Note key={`${note.programId}-${index}`} note={note} />
              ))}
            </Detail>
          )}
        </div>
      )}

      {/* 7. An easy way out, before the form */}
      <section
        aria-label={copy.notRightTitle}
        data-testid="not-right"
        className="min-w-0 space-y-2 rounded-2xl bg-colman-surface p-4 break-words"
      >
        <h2 className="text-lg font-bold text-colman-blue-dark">{copy.notRightTitle}</h2>
        <p className="text-slate-700">{copy.notRightBody}</p>
        <button
          type="button"
          className="min-h-11 rounded-lg px-1 font-semibold text-colman-blue underline"
          data-testid="try-again"
          onClick={handlers.onRestart}
        >
          {copy.tryAgain}
        </button>
      </section>

      {/* 8. The lead form */}
      <div id={LEAD_ID} ref={leadRef} data-testid="lead-anchor" className="scroll-mt-4">
        {leadForm}
      </div>

      {/* 9. All programs, then the brand disclaimer */}
      {view.allProgramsUrl && (
        <a
          href={view.allProgramsUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="all-programs"
          className="flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold text-colman-blue underline"
          onClick={handlers.onAllProgramsClick}
        >
          {copy.allPrograms}
          <span className="sr-only"> (נפתח בלשונית חדשה)</span>
        </a>
      )}
      <p className="text-sm leading-snug text-slate-500">{view.disclaimerHe}</p>

      {/* Sticky contact (mobile): steps aside while the form is visible */}
      <div className="md:hidden">
        <StickyBar className={leadVisible ? "invisible pointer-events-none" : ""} hidden={false}>
          <button
            type="button"
            className={v3Primary}
            data-testid="sticky-contact"
            data-cta-position="sticky"
            onClick={() => goToLead("sticky")}
            tabIndex={leadVisible ? -1 : 0}
          >
            {copy.contactCta}
          </button>
        </StickyBar>
      </div>
    </div>
  );
}

/** Fires once when the secondary direction scrolls into view (same semantics as V2's secondary_program_view). */
function SecondaryView({ onView }: { onView: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onView();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onView]);
  return <span ref={ref} aria-hidden="true" />;
}
