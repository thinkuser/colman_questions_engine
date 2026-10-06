import type { ReactNode } from "react";
import type { ProgramId } from "@/engine";
import type { ResultView } from "@/flow";
import { copy } from "@/ui/copy.he";

export interface ResultActionHandlers {
  onCompareFocused: () => void;
  /** Analytics observers: report what happened, never change what happens. */
  onMirrorResponse: (value: "yes" | "no") => void;
  onAdmissionClick: () => void;
  onAdvisorClick: () => void;
  onSecondaryView: () => void;
  onRealityCheckView: (programId: ProgramId) => void;
  onRestart: () => void;
  onBackToQuestion: () => void;
}

const primary =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-center font-semibold text-white";
const secondary =
  "flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-brand px-4 py-3 text-center font-semibold text-brand";

function ExternalLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
      <span className="sr-only"> ({copy.result.opensNewTab})</span>
    </a>
  );
}

/** Action area. Admission and program links go to official pages; no eligibility logic, no lead capture (later issues). */
export function CtaSection({ view, handlers }: { view: ResultView; handlers: ResultActionHandlers }) {
  const { ctas, kind } = view;
  const compare = ctas.compareFocused ? (
    <button type="button" className={kind === "near_tie" ? primary : secondary} onClick={handlers.onCompareFocused}>
      {copy.result.compareFocused}
    </button>
  ) : (
    <button type="button" className={secondary} onClick={handlers.onRestart}>
      {copy.result.compareNew}
    </button>
  );
  return (
    <section aria-label={copy.result.ctaTitle} className="min-w-0 space-y-3 break-words">
      <h2 className="text-lg font-bold">{copy.result.ctaTitle}</h2>
      {kind === "no_strong_fit" ? (
        <>
          <button type="button" className={primary} onClick={handlers.onRestart}>
            {copy.result.exploreOthers}
          </button>
          {ctas.advisorUrl && (
            <ExternalLink href={ctas.advisorUrl} className={secondary} onClick={handlers.onAdvisorClick}>
              {ctas.advisorLabelHe}
            </ExternalLink>
          )}
        </>
      ) : (
        <>
          {kind === "near_tie" && compare}
          {ctas.admissionUrl && (
            <ExternalLink
              href={ctas.admissionUrl}
              className={kind === "near_tie" ? secondary : primary}
              onClick={handlers.onAdmissionClick}
            >
              {copy.result.admission}
            </ExternalLink>
          )}
          {kind !== "near_tie" && compare}
          {ctas.programUrl && (
            <ExternalLink href={ctas.programUrl} className={secondary}>
              {copy.result.programPage}
            </ExternalLink>
          )}
          {ctas.advisorUrl && (
            <ExternalLink href={ctas.advisorUrl} className={secondary} onClick={handlers.onAdvisorClick}>
              {ctas.advisorLabelHe}
            </ExternalLink>
          )}
        </>
      )}
    </section>
  );
}

/** Low-friction escape: the recommendation never traps the candidate. */
export function NotYouSection({ handlers }: { handlers: ResultActionHandlers }) {
  return (
    <section aria-label={copy.result.notYouTitle} className="min-w-0 space-y-3 rounded-2xl bg-slate-50 p-4 break-words">
      <h2 className="text-lg font-bold">{copy.result.notYouTitle}</h2>
      <p className="text-slate-700">{copy.result.notYouBody}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-brand underline"
          onClick={handlers.onBackToQuestion}
        >
          {copy.result.backToQuestion}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-slate-600 underline"
          onClick={handlers.onRestart}
        >
          {copy.result.restart}
        </button>
      </div>
    </section>
  );
}
