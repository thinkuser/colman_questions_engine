"use client";

import { useMemo } from "react";
import { JourneyTracker, type DataLayerHost, type StorageLike } from "@/analytics";
import { V3_STRATEGY } from "@/ui/v3/config";

/**
 * V3 analytics binding: a strategy-driven `JourneyTracker` reporting `flow_version: "v3"` with its own sessionStorage
 * context key, so V2 and V3 can be compared later and never share a journey id. World-led discovery emits
 * `career_world_*` events (never `career_project_*`). V2 keeps its own, unchanged `DiscoveryTracker`.
 */
export const V3_ANALYTICS_STORAGE_KEY = "colman-studymatch:analytics-v3";

let tracker: JourneyTracker | null = null;

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getV3Tracker(): JourneyTracker | null {
  if (typeof window === "undefined") return null;
  tracker ??= new JourneyTracker({
    host: window as unknown as DataLayerHost,
    strategy: V3_STRATEGY,
    flowVersion: "v3",
    storageKey: V3_ANALYTICS_STORAGE_KEY,
    storage: sessionStorageOrNull(),
    debug: process.env.NODE_ENV === "development" ? (payload) => console.debug("[analytics:v3]", payload) : undefined,
  });
  return tracker;
}

/** The only analytics surface the V3 components use: they say WHAT happened. Every call is a safe no-op on failure. */
export function useV3Analytics() {
  return useMemo(
    () => ({
      landingViewed: (token: string) => getV3Tracker()?.landingViewed(token),
      started: () => getV3Tracker()?.started(),
      discoveryViewed: (token: string) => getV3Tracker()?.discoveryViewed(token),
      questionViewed: () => getV3Tracker()?.questionViewed(),
      questionContinued: () => getV3Tracker()?.questionContinued(),
      resultViewed: () => getV3Tracker()?.resultViewed(),
      programClick: (programId: string, role: "primary" | "alternative" | "peer", position: string) =>
        getV3Tracker()?.resultProgramClick(programId, role, position),
      contactClick: (position: string) => getV3Tracker()?.resultContactClick(position),
      allProgramsClick: () => getV3Tracker()?.resultAllProgramsClick(),
      detailExpanded: (section: string) => getV3Tracker()?.resultDetailExpanded(section),
      secondaryProgramViewed: () => getV3Tracker()?.secondaryProgramViewed(),
      realityCheckViewed: (programId: string) => getV3Tracker()?.realityCheckViewed(programId),
      leadFormViewed: () => getV3Tracker()?.leadFormViewed(),
      leadFormSubmitted: () => getV3Tracker()?.leadFormSubmitted(),
      leadFormSucceeded: () => getV3Tracker()?.leadFormSucceeded(),
      leadFormFailed: (errorType: "validation" | "server" | "network") => getV3Tracker()?.leadFormFailed(errorType),
      journeyId: () => getV3Tracker()?.getJourneyId() ?? null,
    }),
    [],
  );
}
