import type { ReactNode } from "react";
import { V2_RESULT_COPY } from "@/data";
import type { DirectionView, GenericResultView, RealityView } from "@/flow";
import { ViewOnce } from "@/ui/components/ViewOnce";
import { copy } from "@/ui/copy.he";

export interface GenericResultHandlers {
  onAdmissionClick: () => void;
  onAdvisorClick: () => void;
  onOfficialProgramClick: (programId: string, role: "primary" | "alternative" | "peer") => void;
  onSecondaryView: () => void;
  onRealityCheckView: (programId: string) => void;
  onBackToQuestion: () => void;
  onRestart: () => void;
}

const primaryButton =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-center font-semibold text-white";
const secondaryButton =
  "flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-brand px-4 py-3 text-center font-semibold text-brand";

function ExternalLink({
  href,
  className,
  onClick,
  role,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  role?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-link-role={role}
      onClick={onClick}
    >
      {children}
      <span className="sr-only"> ({copy.result.opensNewTab})</span>
    </a>
  );
}

function DirectionName({ direction, as: Heading = "h2" }: { direction: DirectionView; as?: "h1" | "h2" | "h3" }) {
  return (
    <Heading className="text-xl leading-snug font-bold break-words sm:text-2xl">
      {direction.nameHe}
      {direction.qualifierHe && (
        <span className="block text-base font-semibold text-slate-600">{direction.qualifierHe}</span>
      )}
    </Heading>
  );
}

function ChosenList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((text) => (
        <li key={text} className="rounded-lg bg-slate-50 p-3 leading-snug break-words text-slate-800">
          {text}
        </li>
      ))}
    </ul>
  );
}

function Reality({ view, onView }: { view: RealityView; onView: (programId: string) => void }) {
  return (
    <ViewOnce onView={() => onView(view.programId)}>
      <section
        aria-label={view.headingHe}
        data-reality-level={view.level}
        data-program-id={view.programId}
        className="min-w-0 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 break-words"
      >
        <h2 className="text-lg font-bold">{view.headingHe}</h2>
        <p className="leading-snug text-slate-800">{view.promptHe}</p>
        <p className="leading-snug text-slate-700">
          <span className="font-semibold">{V2_RESULT_COPY.reality.answered}</span> {view.answerHe}
        </p>
        {view.noteHe && <p className="leading-snug text-slate-700">{view.noteHe}</p>}
      </section>
    </ViewOnce>
  );
}

/**
 * The generic V2 result (recommended / near tie / insufficient positive evidence). Pure presentation of a
 * `GenericResultView`: no scores, percentages or internals are rendered, a near tie is symmetric (both directions,
 * same weight), and a reality check is a calm "worth knowing" note that never disqualifies. Facts are limited to the
 * candidate's own choices, work-imagination statements and official links.
 */
export function GenericResultPage({ view, handlers }: { view: GenericResultView; handlers: GenericResultHandlers }) {
  const { directions } = view;
  const [primary, secondary] = directions;
  const copyV = V2_RESULT_COPY;

  return (
    <div className="space-y-5" data-result-kind={view.kind} data-result-flow="v2">
      {/* Hero */}
      <header className="space-y-3 rounded-2xl bg-brand/5 p-5">
        {view.kind === "recommended" && primary && (
          <>
            <p className="text-sm font-semibold text-brand">{view.eyebrowHe}</p>
            <DirectionName direction={primary} as="h1" />
          </>
        )}
        {view.kind === "near_tie" && (
          <>
            <h1 className="text-xl leading-snug font-bold sm:text-2xl">{view.eyebrowHe}</h1>
            <p className="text-slate-700">{view.bodyHe}</p>
          </>
        )}
        {view.kind === "insufficient_positive_evidence" && (
          <>
            <h1 className="text-xl leading-snug font-bold sm:text-2xl">{view.headingHe}</h1>
            <p className="text-slate-700">{view.bodyHe}</p>
          </>
        )}
      </header>

      {/* Why / what pulled */}
      {view.kind === "recommended" && primary && (
        <section aria-label={copyV.recommended.whyTitle} className="min-w-0 space-y-3 break-words">
          <h2 className="text-lg font-bold">{copyV.recommended.whyTitle}</h2>
          {view.patternHe && <p className="text-slate-700">{view.patternHe}</p>}
          <p className="text-sm font-semibold text-slate-600">{copyV.recommended.chosenLead}</p>
          <ChosenList items={primary.chosenHe} />
        </section>
      )}

      {view.kind === "near_tie" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {directions.map((direction) => (
            <section
              key={direction.programId}
              data-direction-id={direction.programId}
              aria-label={direction.nameHe}
              className="min-w-0 space-y-3 rounded-2xl border-2 border-slate-200 p-4 break-words"
            >
              <DirectionName direction={direction} />
              <p className="text-sm font-semibold text-slate-600">{copyV.nearTie.pulledTitle}</p>
              <ChosenList items={direction.chosenHe} />
            </section>
          ))}
        </div>
      )}

      {view.kind === "insufficient_positive_evidence" && primary && (
        <section
          aria-label={copyV.insufficient.weakTitle}
          data-direction-id={primary.programId}
          className="min-w-0 space-y-3 break-words"
        >
          <h2 className="text-lg font-bold">{copyV.insufficient.weakTitle}</h2>
          <p className="text-slate-700">{copyV.insufficient.weakBody}</p>
          <DirectionName direction={primary} as="h3" />
          <ChosenList items={primary.chosenHe} />
        </section>
      )}

      {/* Main decision */}
      {view.mainDecision && (
        <section aria-label={view.mainDecision.titleHe} className="min-w-0 space-y-2 break-words">
          <h2 className="text-lg font-bold">{view.mainDecision.titleHe}</h2>
          <p className="leading-relaxed text-slate-800">{view.mainDecision.textHe}</p>
        </section>
      )}

      {/* Secondary direction (recommended only) */}
      {view.kind === "recommended" && secondary && (
        <ViewOnce onView={handlers.onSecondaryView}>
          <section
            aria-label={copyV.recommended.secondaryTitle}
            data-direction-id={secondary.programId}
            className="min-w-0 space-y-3 rounded-2xl bg-slate-50 p-4 break-words"
          >
            <h2 className="text-lg font-bold">{copyV.recommended.secondaryTitle}</h2>
            <DirectionName direction={secondary} as="h3" />
            <p className="text-slate-700">{copyV.recommended.secondaryBody}</p>
            <ChosenList items={secondary.chosenHe} />
          </section>
        </ViewOnce>
      )}

      {/* Reality checks */}
      {view.realityChecks.map((reality) => (
        <Reality key={reality.programId} view={reality} onView={handlers.onRealityCheckView} />
      ))}

      {/* Explore + actions */}
      <section aria-label={copyV.explore.title} className="min-w-0 space-y-3 break-words">
        <h2 className="text-lg font-bold">{copyV.explore.title}</h2>
        {directions.map((direction, index) =>
          direction.programUrl ? (
            <ExternalLink
              key={direction.programId}
              href={direction.programUrl}
              role={view.kind === "near_tie" ? "peer" : index === 0 ? "primary" : "alternative"}
              className={index === 0 && view.kind !== "near_tie" ? primaryButton : secondaryButton}
              onClick={() =>
                handlers.onOfficialProgramClick(
                  direction.programId,
                  view.kind === "near_tie" ? "peer" : index === 0 ? "primary" : "alternative",
                )
              }
            >
              {copyV.explore.programPage(direction.displayNameHe)}
            </ExternalLink>
          ) : null,
        )}
        {view.kind === "insufficient_positive_evidence" && (
          <button type="button" className={primaryButton} onClick={handlers.onRestart}>
            {copyV.insufficient.restartPrimary}
          </button>
        )}
        {view.ctas.admissionUrl && (
          <ExternalLink href={view.ctas.admissionUrl} className={secondaryButton} onClick={handlers.onAdmissionClick}>
            {copyV.actions.admission}
          </ExternalLink>
        )}
        {view.ctas.advisorUrl && (
          <ExternalLink href={view.ctas.advisorUrl} className={secondaryButton} onClick={handlers.onAdvisorClick}>
            {view.ctas.advisorLabelHe}
          </ExternalLink>
        )}
        {view.limitedFacts && <p className="text-sm text-slate-600">{copyV.explore.factsNote}</p>}
      </section>

      {/* Escape hatch */}
      <section
        aria-label={copyV.actions.notYouTitle}
        className="min-w-0 space-y-3 rounded-2xl bg-slate-50 p-4 break-words"
      >
        <h2 className="text-lg font-bold">{copyV.actions.notYouTitle}</h2>
        <p className="text-slate-700">{copyV.actions.notYouBody}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-brand underline"
            onClick={handlers.onBackToQuestion}
          >
            {copyV.actions.backToQuestion}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-slate-600 underline"
            onClick={handlers.onRestart}
          >
            {copyV.actions.restart}
          </button>
        </div>
      </section>

      <p className="text-sm leading-snug text-slate-500">{view.disclaimerHe}</p>
    </div>
  );
}
