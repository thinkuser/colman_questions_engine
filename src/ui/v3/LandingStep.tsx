"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { useV3 } from "@/ui/state/V3Provider";
import { LogoMark, v3Primary } from "./shared";

/**
 * The V3 front door. The candidate sees what this is, how long it takes and what they get before any project card.
 * A returning candidate with a journey in progress continues where they stopped (or starts over): V3 state is its own,
 * so this never touches a V2 journey.
 */
export function LandingStep() {
  const { state, dispatch, hydrated, arrivedAtLanding, analytics, pathFor, landingNext, ui, t } = useV3();
  const copy = ui.landing;
  const router = useRouter();
  const viewToken = useId();
  // The landing page is where an intentional "restart" ends up: from here the guards apply again.
  useEffect(() => {
    arrivedAtLanding();
  }, [arrivedAtLanding]);
  useEffect(() => {
    if (hydrated) analytics.landingViewed(viewToken);
  }, [hydrated, analytics, viewToken]);

  const inProgress = hydrated && (state.selectedIds.length > 0 || state.answers.length > 0);

  function handleStart() {
    analytics.uiClick?.({
      element_id: "landing_start",
      element_type: "button",
      screen_id: "landing",
      destination_type: "internal",
    });
    analytics.started();
    router.push(pathFor(landingNext(inProgress)));
  }

  return (
    <section className="space-y-8 pt-2" data-testid="v3-landing">
      <div className="flex justify-center">
        <LogoMark size={72} />
      </div>
      <header className="space-y-3 text-center">
        <h1 className="text-3xl leading-tight font-extrabold text-colman-blue-dark sm:text-4xl">{copy.headline}</h1>
        <p className="text-lg leading-snug text-slate-700">{copy.support}</p>
      </header>

      <ul className="colman-wash space-y-3 rounded-2xl border border-colman-border p-5" aria-label={t("מה מחכה לכם")}>
        {copy.expectations.map((line) => (
          <li key={line} className="flex items-start gap-3 text-base leading-snug font-medium text-colman-blue-dark">
            <svg
              viewBox="0 0 16 16"
              className="mt-0.5 size-5 shrink-0 text-colman-blue"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {line}
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        <button
          type="button"
          className={v3Primary}
          onClick={handleStart}
          disabled={!hydrated}
          data-testid="landing-cta"
        >
          {inProgress ? copy.resume : copy.cta}
        </button>
        <p className="text-center text-sm text-slate-600">{copy.note}</p>
        {inProgress && (
          <button
            type="button"
            className="mx-auto flex min-h-11 items-center rounded-lg px-3 text-slate-600 underline"
            onClick={() => {
              analytics.uiClick?.({
                element_id: "landing_start_over",
                element_type: "button",
                screen_id: "landing",
                destination_type: "restart",
              });
              dispatch({ type: "restart" });
            }}
          >
            {copy.startOver}
          </button>
        )}
      </div>
    </section>
  );
}
