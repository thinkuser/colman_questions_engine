"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { V4_COPY } from "@/data";
import type { EntryMode } from "@/ui/experience/ExperienceContext";
import { useExperience, useExperienceGuard } from "@/ui/experience/ExperienceContext";
import { V4_PATHS } from "@/ui/routes";
import { ProgressHeader } from "@/ui/v3/shared";

const v4DiscoverPath = (mode: EntryMode) => (mode === "projects" ? V4_PATHS.projects : V4_PATHS.worlds);

/**
 * V4/V5: where is the candidate in the decision? Two equal options (working worlds or projects). This is NOT a question:
 * it scores nothing and is not evidence; it only selects the discovery strategy. Neither option is ranked or preferred:
 * same size, same style, worlds first only because the list must have an order.
 */
export function EntryMethodStep() {
  const { entryMode, selectEntryMode, analytics, hydrated, pathFor, discoverPathFor } = useExperience();
  const allowed = useExperienceGuard("start");
  const router = useRouter();
  const viewToken = useId();
  const copy = V4_COPY.method;

  useEffect(() => {
    if (allowed) analytics.methodViewed?.(viewToken);
  }, [allowed, analytics, viewToken]);

  if (!allowed || !hydrated) return null;

  function choose(mode: EntryMode) {
    analytics.uiClick?.({
      element_id: mode === "projects" ? "method_projects" : "method_worlds",
      element_type: "card",
      screen_id: "method",
      destination_type: "discovery",
      entry_mode: mode,
    });
    analytics.methodSelected?.(mode);
    selectEntryMode(mode);
    router.push((discoverPathFor ?? v4DiscoverPath)(mode));
  }

  const options: Array<{ mode: EntryMode; title: string; description: string; cue: string }> = [
    { mode: "worlds", ...copy.worlds },
    { mode: "projects", ...copy.projects },
  ];

  return (
    <section className="space-y-6" data-testid="v4-method">
      <ProgressHeader stage={1} />
      <header className="space-y-2">
        <h1 className="text-2xl leading-snug font-extrabold text-colman-blue-dark sm:text-3xl">{copy.headline}</h1>
        <p className="text-lg leading-snug text-slate-700">{copy.support}</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2" aria-label={copy.optionsLabel}>
        {options.map((option) => {
          const current = entryMode === option.mode;
          return (
            <li key={option.mode} className="flex">
              <button
                type="button"
                data-entry-mode={option.mode}
                aria-pressed={current}
                onClick={() => choose(option.mode)}
                className={`flex min-h-40 w-full flex-col gap-2 rounded-3xl border-2 p-5 text-start transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue ${
                  current
                    ? "colman-wash border-colman-blue shadow-md"
                    : "border-colman-border bg-white hover:border-colman-blue hover:shadow-sm"
                }`}
              >
                <span className="text-xl leading-snug font-extrabold text-colman-blue-dark" data-method-title>
                  {option.title}
                </span>
                <span className="text-base leading-snug font-semibold text-colman-purple-ink">
                  {option.description}
                </span>
                <span className="text-base leading-snug text-slate-700">{option.cue}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="min-h-11 rounded-lg px-3 text-colman-blue underline"
        onClick={() => {
          analytics.uiClick?.({
            element_id: "method_back",
            element_type: "button",
            screen_id: "method",
            destination_type: "internal",
          });
          router.push(pathFor("landing"));
        }}
      >
        {copy.back}
      </button>
    </section>
  );
}
