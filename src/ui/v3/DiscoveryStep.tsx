"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCOVERY_OPENING, V3_WORLD_OPENING, V4_COPY } from "@/data";
import { canStartJourney } from "@/flow";
import type { EntryMode } from "@/ui/experience/ExperienceContext";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { BrandProjectCard, ProjectCard, WorldCard } from "./DiscoveryCards";
import { ProgressHeader, StickyBar, v3Primary } from "./shared";

/**
 * The V3 opening choice. With the world-led strategy (V3) the candidate picks 1-2 working worlds; the same screen runs
 * brand-led if the strategy is switched. The choice only routes (candidate pool + first scenarios) and scores nothing.
 * At the limit a card stays usable: pressing it explains instead of silently doing nothing; the maximum stays 2.
 */
export function DiscoveryStep({ mode }: { mode?: EntryMode } = {}) {
  const {
    strategy,
    state,
    dispatch,
    analytics,
    pathFor,
    projectsCopy,
    hasEntryChoice,
    entryMode,
    ensureEntryMode,
    hydrated,
    ui,
    t,
  } = useV3();
  const router = useRouter();
  const guardAllowed = useV3Guard("discover");
  // V4 discovery pages (/v4/worlds, /v4/projects) carry their own mode; V3's page carries none.
  useEffect(() => {
    if (mode && hydrated) ensureEntryMode(mode);
  }, [mode, hydrated, ensureEntryMode]);
  const allowed = guardAllowed && (!mode || entryMode === mode);
  const viewToken = useId();
  const [limitShown, setLimitShown] = useState(false);
  const worlds = strategy.id === "worlds";
  const copy = {
    headline: worlds ? t(V3_WORLD_OPENING.prompt) : projectsCopy.headline,
    support: worlds ? t(V3_WORLD_OPENING.helper) : projectsCopy.support,
    entriesLabel: worlds ? ui.worlds.entriesLabel : ui.discovery.projectsLabel,
    limit: worlds ? ui.worlds.limit : ui.discovery.limit,
  };

  useEffect(() => {
    if (allowed) analytics.discoveryViewed(viewToken);
  }, [allowed, analytics, viewToken]);

  if (!allowed) return null;

  const selected = state.selectedIds;

  function handlePress(entryId: string) {
    // The click is reported even when the selection is refused (third card): ui_click, but no *_selected event.
    analytics.uiClick?.(
      worlds
        ? { element_id: "discovery_world_card", element_type: "card", screen_id: "worlds", world_id: entryId }
        : { element_id: "discovery_project_card", element_type: "card", screen_id: "projects", project_id: entryId },
    );
    const isSelected = selected.includes(entryId);
    if (!isSelected && selected.length >= strategy.maxSelected) {
      setLimitShown(true);
      return;
    }
    setLimitShown(false);
    dispatch({ type: "toggle_entry", entryId });
  }

  function handleContinue() {
    analytics.uiClick?.({
      element_id: "discovery_continue",
      element_type: "button",
      screen_id: worlds ? "worlds" : "projects",
      destination_type: "internal",
    });
    dispatch({ type: "start" });
    router.push(pathFor("ready"));
  }

  return (
    <section className="space-y-6">
      <ProgressHeader stage={1} />
      <header className="space-y-2">
        <h1 className="text-2xl leading-snug font-extrabold text-colman-blue-dark sm:text-3xl">{copy.headline}</h1>
        <p className="text-lg leading-snug text-slate-700">{copy.support}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2" aria-label={copy.entriesLabel} data-strategy={strategy.id}>
        {strategy.entryIds.map((entryId) => (
          <li key={entryId} className="flex">
            {worlds ? (
              <WorldCard worldId={entryId} selected={selected.includes(entryId)} onPress={handlePress} />
            ) : strategy.id === "projects" ? (
              <ProjectCard projectId={entryId} selected={selected.includes(entryId)} onPress={handlePress} />
            ) : (
              <BrandProjectCard projectId={entryId} selected={selected.includes(entryId)} onPress={handlePress} />
            )}
          </li>
        ))}
      </ul>

      {!worlds && <p className="text-sm leading-snug text-slate-500">{t(DISCOVERY_OPENING.brandDisclaimer)}</p>}

      {hasEntryChoice && (
        <button
          type="button"
          data-testid="back-to-method"
          className="min-h-11 rounded-lg px-3 text-colman-blue underline"
          onClick={() => {
            analytics.uiClick?.({
              element_id: "discovery_back",
              element_type: "button",
              screen_id: worlds ? "worlds" : "projects",
              destination_type: "internal",
            });
            router.push(pathFor("start"));
          }}
        >
          {V4_COPY.discovery.backToMethod}
        </button>
      )}

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
            {ui.discovery.selectedCount(selected.length)}
          </span>
          <button
            type="button"
            className={v3Primary}
            disabled={!canStartJourney(strategy, state)}
            onClick={handleContinue}
            data-testid="discover-continue"
          >
            {ui.discovery.next}
          </button>
        </div>
      </StickyBar>
    </section>
  );
}
