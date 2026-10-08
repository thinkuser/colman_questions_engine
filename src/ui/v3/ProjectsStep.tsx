"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CAREER_PROJECTS, DISCOVERY_OPENING, getCareerProjectCopy, V3_COPY, type CareerProjectCopy } from "@/data";
import { canStartDiscovery } from "@/flow";
import { MAX_SELECTED_PROJECTS } from "@/engine";
import { useV3Analytics } from "@/ui/analytics/v3Analytics";
import { toneStyle } from "@/ui/discovery/projectBrand";
import { V3_PATHS } from "@/ui/routes";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { ProgressHeader, StickyBar, v3Primary } from "./shared";

/**
 * A project card WITHOUT icons or logos: company name, project title, description and a selection state. The company
 * label has one fixed size/weight/position for every card (its colour is decorative only); the synthetic AI project is
 * labelled exactly "AI". At the limit a card stays fully usable: pressing it explains instead of silently doing nothing.
 */
function ProjectCardV3({
  projectId,
  project,
  selected,
  onPress,
}: {
  projectId: string;
  project: CareerProjectCopy;
  selected: boolean;
  onPress: (projectId: string) => void;
}) {
  const company = V3_COPY.companyLabels[projectId] ?? project.brandName;
  return (
    <button
      type="button"
      data-project-id={projectId}
      aria-pressed={selected}
      onClick={() => onPress(projectId)}
      style={toneStyle(projectId)}
      className={`flex min-h-28 w-full flex-col gap-2 rounded-2xl border-2 p-4 text-start transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue ${
        selected
          ? "colman-wash border-colman-blue shadow-md ring-2 ring-colman-purple/30"
          : "border-colman-border bg-white hover:border-colman-blue hover:shadow-sm"
      }`}
    >
      <span className="flex min-h-7 items-center justify-between gap-3">
        <span
          data-company-label
          className="text-base font-bold tracking-wide text-(--tone) [direction:ltr] [unicode-bidi:plaintext]"
        >
          {company}
        </span>
        {selected && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-colman-blue px-2.5 py-1 text-sm font-semibold text-white">
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {V3_COPY.discovery.selectedBadge}
          </span>
        )}
      </span>
      <span className="block text-lg leading-snug font-bold break-words text-colman-blue-dark">{project.title}</span>
      <span className="block text-base leading-snug break-words text-slate-700">{project.scenario}</span>
    </button>
  );
}

export function ProjectsStep() {
  const copy = V3_COPY.discovery;
  const { state, dispatch } = useV3();
  const router = useRouter();
  const allowed = useV3Guard("projects");
  const analytics = useV3Analytics();
  const viewToken = useId();
  const [limitShown, setLimitShown] = useState(false);

  useEffect(() => {
    if (allowed) analytics.discoveryViewed(viewToken);
  }, [allowed, analytics, viewToken]);

  if (!allowed) return null;

  const selected = state.selectedProjectIds;

  function handlePress(projectId: string) {
    const isSelected = selected.includes(projectId);
    if (!isSelected && selected.length >= MAX_SELECTED_PROJECTS) {
      // A third project is not added (the maximum stays 2); say why instead of failing silently.
      setLimitShown(true);
      return;
    }
    setLimitShown(false);
    dispatch({ type: "toggle_project", projectId });
  }

  function handleContinue() {
    dispatch({ type: "start" });
    router.push(V3_PATHS.ready);
  }

  return (
    <section className="space-y-6">
      <ProgressHeader stage={1} />
      <header className="space-y-2">
        <h1 className="text-2xl leading-snug font-extrabold text-colman-blue-dark sm:text-3xl">{copy.headline}</h1>
        <p className="text-lg leading-snug text-slate-700">{copy.support}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2" aria-label={copy.projectsLabel}>
        {CAREER_PROJECTS.filter((project) => project.enabled).map((project) => {
          const projectCopy = getCareerProjectCopy(project.id);
          if (!projectCopy) return null;
          return (
            <li key={project.id} className="flex">
              <ProjectCardV3
                projectId={project.id}
                project={projectCopy}
                selected={selected.includes(project.id)}
                onPress={handlePress}
              />
            </li>
          );
        })}
      </ul>

      <p className="text-sm leading-snug text-slate-500">{DISCOVERY_OPENING.brandDisclaimer}</p>

      <StickyBar>
        <p
          role="status"
          aria-live="polite"
          data-testid="limit-message"
          className="min-h-0 text-sm font-semibold text-red-700"
        >
          {limitShown ? copy.limit : ""}
        </p>
        <div className="flex items-center gap-4">
          <span
            className="shrink-0 text-base font-semibold text-colman-blue-dark"
            aria-live="polite"
            data-testid="selection-status"
          >
            {copy.selectedCount(selected.length)}
          </span>
          <button
            type="button"
            className={v3Primary}
            disabled={!canStartDiscovery(state)}
            onClick={handleContinue}
            data-testid="projects-continue"
          >
            {copy.next}
          </button>
        </div>
      </StickyBar>
    </section>
  );
}
