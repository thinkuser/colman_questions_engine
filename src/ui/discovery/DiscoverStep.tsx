"use client";

import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { CAREER_PROJECTS, DISCOVERY_OPENING, getCareerProjectCopy } from "@/data";
import { canStartDiscovery } from "@/flow";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import { useDiscoveryAnalytics } from "@/ui/analytics/useDiscoveryAnalytics";
import { copy } from "@/ui/copy.he";
import { V2_PATHS } from "@/ui/routes";
import { useDiscovery } from "@/ui/state/DiscoveryProvider";
import { DiscoveryStepIndicator } from "./DiscoveryStepIndicator";
import { ProjectCard } from "./ProjectCard";

/**
 * V2 opening: career-project discovery. The candidate picks one or two projects; the choice only decides which
 * questions come next and scores nothing. All copy comes from structured data; no degree is chosen here.
 */
export function DiscoverStep() {
  const { state, dispatch, hydrated } = useDiscovery();
  const router = useRouter();
  const analytics = useDiscoveryAnalytics();
  const viewToken = useId();
  useEffect(() => {
    if (hydrated) analytics.discoveryViewed(viewToken);
  }, [hydrated, analytics, viewToken]);

  if (!hydrated) return null;

  const selected = state.selectedProjectIds;
  const maxed = selected.length >= MAX_SELECTED_PROJECTS;

  function handleStart() {
    dispatch({ type: "start" });
    router.push(V2_PATHS.questions);
  }

  return (
    <section className="space-y-6">
      <DiscoveryStepIndicator current="select" />
      <header className="space-y-2">
        <h1 className="text-2xl leading-snug font-bold text-colman-blue-dark sm:text-3xl">
          {DISCOVERY_OPENING.prompt}
        </h1>
        <p className="text-lg leading-snug text-slate-700">{DISCOVERY_OPENING.helper}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2" aria-label={copy.v2.discover.projectsLabel}>
        {CAREER_PROJECTS.filter((project) => project.enabled).map((project) => {
          const projectCopy = getCareerProjectCopy(project.id);
          if (!projectCopy) return null;
          const isSelected = selected.includes(project.id);
          return (
            <li key={project.id} className="flex">
              <ProjectCard
                projectId={project.id}
                project={projectCopy}
                selected={isSelected}
                blocked={maxed && !isSelected}
                onToggle={(projectId) => dispatch({ type: "toggle_project", projectId })}
              />
            </li>
          );
        })}
      </ul>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-colman-blue-dark" aria-live="polite" data-testid="selection-status">
            {maxed ? copy.v2.discover.maxReached : copy.v2.discover.selectedCount(selected.length)}
          </span>
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-xl bg-colman-blue px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-colman-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue disabled:opacity-40 disabled:shadow-none"
            disabled={!canStartDiscovery(state)}
            onClick={handleStart}
          >
            {copy.v2.discover.start}
          </button>
        </div>
        <p className="text-sm leading-snug text-slate-500">{DISCOVERY_OPENING.brandDisclaimer}</p>
      </div>
    </section>
  );
}
