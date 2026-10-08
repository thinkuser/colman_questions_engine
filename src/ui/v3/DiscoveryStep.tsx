"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { DISCOVERY_OPENING, V3_COPY, V3_WORLD_OPENING } from "@/data";
import { canStartJourney } from "@/flow";
import { useV3Analytics } from "@/ui/analytics/v3Analytics";
import { V3_PATHS } from "@/ui/routes";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { BrandProjectCard, WorldCard } from "./DiscoveryCards";
import { ProgressHeader, StickyBar, v3Primary } from "./shared";

/**
 * The V3 opening choice. With the world-led strategy (V3) the candidate picks 1-2 working worlds; the same screen runs
 * brand-led if the strategy is switched. The choice only routes (candidate pool + first scenarios) and scores nothing.
 * At the limit a card stays usable: pressing it explains instead of silently doing nothing; the maximum stays 2.
 */
export function DiscoveryStep() {
  const { strategy, state, dispatch } = useV3();
  const router = useRouter();
  const allowed = useV3Guard("discover");
  const analytics = useV3Analytics();
  const viewToken = useId();
  const [limitShown, setLimitShown] = useState(false);
  const worlds = strategy.id === "worlds";
  const copy = {
    headline: worlds ? V3_WORLD_OPENING.prompt : V3_COPY.discovery.headline,
    support: worlds ? V3_WORLD_OPENING.helper : V3_COPY.discovery.support,
    entriesLabel: worlds ? V3_COPY.worlds.entriesLabel : V3_COPY.discovery.projectsLabel,
    limit: worlds ? V3_COPY.worlds.limit : V3_COPY.discovery.limit,
  };

  useEffect(() => {
    if (allowed) analytics.discoveryViewed(viewToken);
  }, [allowed, analytics, viewToken]);

  if (!allowed) return null;

  const selected = state.selectedIds;

  function handlePress(entryId: string) {
    const isSelected = selected.includes(entryId);
    if (!isSelected && selected.length >= strategy.maxSelected) {
      setLimitShown(true);
      return;
    }
    setLimitShown(false);
    dispatch({ type: "toggle_entry", entryId });
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

      <ul className="grid gap-3 sm:grid-cols-2" aria-label={copy.entriesLabel} data-strategy={strategy.id}>
        {strategy.entryIds.map((entryId) => (
          <li key={entryId} className="flex">
            {worlds ? (
              <WorldCard worldId={entryId} selected={selected.includes(entryId)} onPress={handlePress} />
            ) : (
              <BrandProjectCard projectId={entryId} selected={selected.includes(entryId)} onPress={handlePress} />
            )}
          </li>
        ))}
      </ul>

      {!worlds && <p className="text-sm leading-snug text-slate-500">{DISCOVERY_OPENING.brandDisclaimer}</p>}

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
            {V3_COPY.discovery.selectedCount(selected.length)}
          </span>
          <button
            type="button"
            className={v3Primary}
            disabled={!canStartJourney(strategy, state)}
            onClick={handleContinue}
            data-testid="discover-continue"
          >
            {V3_COPY.discovery.next}
          </button>
        </div>
      </StickyBar>
    </section>
  );
}
