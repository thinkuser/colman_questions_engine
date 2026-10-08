"use client";

import { useMemo } from "react";
import { JourneyTracker, trackEvent, type DataLayerHost, type StorageLike } from "@/analytics";
import { strategyForEntryMode, type V4EntryMode } from "@/flow";
import type { ExperienceAnalytics } from "@/ui/experience/ExperienceContext";

/**
 * V4 analytics binding (DEC-035). One strategy-driven `JourneyTracker` per entry mode, each stamping
 * `flow_version: "v4"` AND `entry_mode` on every event (so every V4 funnel step can be compared by entry mode), with
 * its own sessionStorage context. World mode emits `career_world_*`, project mode `career_project_*`. Events before a
 * mode exists (landing, the method screen) go straight to the dataLayer with `flow_version: "v4"`.
 * V2 and V3 bindings are untouched. No personal data.
 */

const trackers = new Map<V4EntryMode, JourneyTracker>();
const fired = new Set<string>();

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const v4AnalyticsKey = (mode: V4EntryMode) => `colman-studymatch:analytics-v4:${mode}`;

export function getV4Tracker(mode: V4EntryMode | null): JourneyTracker | null {
  if (typeof window === "undefined" || mode === null) return null;
  let tracker = trackers.get(mode);
  if (!tracker) {
    tracker = new JourneyTracker({
      host: window as unknown as DataLayerHost,
      strategy: strategyForEntryMode(mode),
      flowVersion: "v4",
      storageKey: v4AnalyticsKey(mode),
      storage: sessionStorageOrNull(),
      baseParams: { entry_mode: mode },
      debug: process.env.NODE_ENV === "development" ? (payload) => console.debug("[analytics:v4]", payload) : undefined,
    });
    trackers.set(mode, tracker);
  }
  return tracker;
}

/** An event that belongs to no journey yet (landing, method screen). */
function emitV4(event: Parameters<typeof trackEvent>[0], params: Parameters<typeof trackEvent>[1]): void {
  try {
    if (typeof window === "undefined") return;
    trackEvent(event, { flow_version: "v4", ...params }, window as unknown as DataLayerHost);
  } catch {
    // Analytics must never affect the product.
  }
}

function once(key: string): boolean {
  if (fired.has(key)) return false;
  fired.add(key);
  return true;
}

export function useV4Analytics(mode: V4EntryMode | null): ExperienceAnalytics {
  return useMemo(() => {
    const t = () => getV4Tracker(mode);
    const modeParam = mode ? { entry_mode: mode } : {};
    return {
      landingViewed: (token: string) => {
        if (once(`landing:${token}`)) emitV4("studymatch_landing_view", modeParam);
      },
      started: () => emitV4("studymatch_start", modeParam),
      methodViewed: (token: string) => {
        if (once(`method:${token}`)) emitV4("discovery_method_view", modeParam);
      },
      methodSelected: (selected: V4EntryMode) => emitV4("discovery_method_selected", { entry_mode: selected }),
      discoveryViewed: (token: string) => t()?.discoveryViewed(token),
      questionViewed: () => t()?.questionViewed(),
      questionContinued: () => t()?.questionContinued(),
      resultViewed: () => t()?.resultViewed(),
      programClick: (programId: string, role: "primary" | "alternative" | "peer", position: string) =>
        t()?.resultProgramClick(programId, role, position),
      contactClick: (position: string) => t()?.resultContactClick(position),
      allProgramsClick: () => t()?.resultAllProgramsClick(),
      detailExpanded: (section: string) => t()?.resultDetailExpanded(section),
      secondaryProgramViewed: () => t()?.secondaryProgramViewed(),
      realityCheckViewed: (programId: string) => t()?.realityCheckViewed(programId),
      leadFormViewed: () => t()?.leadFormViewed(),
      leadFormSubmitted: () => t()?.leadFormSubmitted(),
      leadFormSucceeded: () => t()?.leadFormSucceeded(),
      leadFormFailed: (errorType: "validation" | "server" | "network") => t()?.leadFormFailed(errorType),
      journeyId: () => t()?.getJourneyId() ?? null,
    };
  }, [mode]);
}
