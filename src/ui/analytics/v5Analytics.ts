"use client";

import { useMemo } from "react";
import {
  JourneyTracker,
  parseUtm,
  trackEvent,
  type DataLayerHost,
  type ResultFeedbackAnswers,
  type StorageLike,
  type UiClickParams,
} from "@/analytics";
import { strategyForV5EntryMode, type V5EntryMode } from "@/flow";
import type { ExperienceAnalytics } from "@/ui/experience/ExperienceContext";

/**
 * V5 analytics binding (DEC-037). One strategy-driven `JourneyTracker` per entry mode, each stamping
 * `flow_version: "v5"` AND `entry_mode` on every event, with its own sessionStorage context. World mode emits
 * `career_world_*` (WORLD_STRATEGY); project mode emits `career_project_*` with the V5 project ids (PROJECT_STRATEGY).
 * Events before a mode exists (landing, the method screen) go straight to the dataLayer with `flow_version: "v5"`.
 * `discovery_method_selected` fires only when the candidate actually chooses on the method screen: a direct
 * /v5/worlds or /v5/projects visit (externally assigned mode) never fabricates it. V2/V3/V4 bindings are untouched.
 * No personal data.
 *
 * Pilot measurement (DEC-038), V5 only: `ui_click` on every candidate control (in addition to the semantic events)
 * and the pilot feedback events (`result_feedback_view`, `result_feedback_submit`).
 */

const trackers = new Map<V5EntryMode, JourneyTracker>();

/**
 * INBOUND acquisition context (how the candidate reached StudyMatch): the query string of the first V5 page of this
 * visit. A self-selected candidate lands on /v5?utm_...; the journey tracker only exists once a method is chosen (on
 * /v5/start, whose URL has no query), so the entry query is remembered here and used for the tracker and for the
 * pre-journey events. Not to be confused with the fixed OUTBOUND UTMs (outboundUtm.ts).
 */
let entrySearch: string | null = null;

/** Remember the entry query string once per visit (the first V5 page). */
export function rememberV5EntrySearch(search: string): void {
  if (entrySearch === null) entrySearch = search;
}

export function v5EntrySearch(fallback: string): string {
  return entrySearch && Object.keys(parseUtm(entrySearch)).length > 0 ? entrySearch : fallback;
}
const fired = new Set<string>();

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const v5AnalyticsKey = (mode: V5EntryMode) => `colman-studymatch:analytics-v5:${mode}`;

export function getV5Tracker(mode: V5EntryMode | null): JourneyTracker | null {
  if (typeof window === "undefined" || mode === null) return null;
  let tracker = trackers.get(mode);
  if (!tracker) {
    tracker = new JourneyTracker({
      host: window as unknown as DataLayerHost,
      strategy: strategyForV5EntryMode(mode),
      flowVersion: "v5",
      storageKey: v5AnalyticsKey(mode),
      storage: sessionStorageOrNull(),
      baseParams: { entry_mode: mode },
      debug: process.env.NODE_ENV === "development" ? (payload) => console.debug("[analytics:v5]", payload) : undefined,
    });
    trackers.set(mode, tracker);
  }
  return tracker;
}

/** An event that belongs to no journey yet (landing, method screen). */
function emitV5(event: Parameters<typeof trackEvent>[0], params: Parameters<typeof trackEvent>[1]): void {
  try {
    if (typeof window === "undefined") return;
    const utm = parseUtm(v5EntrySearch(window.location.search));
    trackEvent(event, { flow_version: "v5", ...utm, ...params }, window as unknown as DataLayerHost);
  } catch {
    // Analytics must never affect the product.
  }
}

function once(key: string): boolean {
  if (fired.has(key)) return false;
  fired.add(key);
  return true;
}

export function useV5Analytics(mode: V5EntryMode | null): ExperienceAnalytics {
  return useMemo(() => {
    const t = () => getV5Tracker(mode);
    const modeParam = mode ? { entry_mode: mode } : {};
    return {
      landingViewed: (token: string) => {
        if (once(`landing:${token}`)) emitV5("studymatch_landing_view", modeParam);
      },
      started: () => emitV5("studymatch_start", modeParam),
      methodViewed: (token: string) => {
        if (once(`method:${token}`)) emitV5("discovery_method_view", modeParam);
      },
      methodSelected: (selected: V5EntryMode) => emitV5("discovery_method_selected", { entry_mode: selected }),
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
      uiClick: (params: UiClickParams) => {
        const tracker = t();
        // Before a mode exists (landing, method screen) there is no journey: flow version (+ known mode) only.
        if (tracker) tracker.uiClick(params);
        else emitV5("ui_click", { ...modeParam, ...params });
      },
      feedbackViewed: () => t()?.resultFeedbackViewed(),
      feedbackSubmitted: (answers: ResultFeedbackAnswers) => t()?.resultFeedbackSubmitted(answers),
    };
  }, [mode]);
}
