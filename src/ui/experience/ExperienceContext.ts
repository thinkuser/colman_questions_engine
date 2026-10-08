"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ExperienceCopy, LeadCopy } from "@/data";
import type { DiscoveryStrategy, JourneyAction, JourneyState } from "@/flow";
import type { useV3Analytics } from "@/ui/analytics/v3Analytics";

/**
 * The contract between the redesigned StudyMatch screens (landing, discovery, transition, questions, result) and the
 * experience that hosts them. V3 (world-led, fixed strategy) and V4 (dual entry: the candidate chooses worlds or
 * projects) each supply their own value; the screens are shared and never know which version they run in.
 *
 * Only experience-specific facts live here: routes, the "where does this journey belong" rule, analytics bindings,
 * the lead flow version and entry mode, and the copy (screen copy, lead copy and the text seam for shared content).
 * Business rules stay in the flow layer.
 */

export type ExperienceRoute = "landing" | "start" | "discover" | "ready" | "questions" | "result";
export type EntryMode = "worlds" | "projects";
export type ExperienceFlowVersion = "v3" | "v4";

export type ExperienceAnalytics = ReturnType<typeof useV3Analytics> & {
  /** V4 only: the entry-method screen was shown / a method was chosen. */
  methodViewed?: (token: string) => void;
  methodSelected?: (mode: EntryMode) => void;
};

export type ExperienceDispatch = (action: JourneyAction, options?: { silent?: boolean }) => void;

export interface ExperienceValue {
  flowVersion: ExperienceFlowVersion;
  strategy: DiscoveryStrategy;
  /** The discovery method in use. V3 is always "worlds"; V4 is null until the candidate (or a direct URL) picks one. */
  entryMode: EntryMode | null;
  state: JourneyState;
  dispatch: ExperienceDispatch;
  hydrated: boolean;
  introSeen: boolean;
  markIntroSeen: () => void;
  restartToLanding: () => void;
  isLeavingToLanding: () => boolean;
  arrivedAtLanding: () => void;
  analytics: ExperienceAnalytics;
  pathFor: (route: ExperienceRoute) => string;
  /** Where the current journey belongs. */
  target: () => ExperienceRoute;
  /** May `route` render while the journey belongs on `target`? */
  allows: (route: ExperienceRoute, target: ExperienceRoute) => boolean;
  /** Where the landing CTA leads. */
  landingNext: (inProgress: boolean) => ExperienceRoute;
  /** Copy for brand-led (projects) discovery in this experience. */
  projectsCopy: { headline: string; support: string };
  /** Screen copy (V3: the approved `V3_COPY`; V4: its gender-inclusive wording, `V4_UI_COPY`). */
  ui: ExperienceCopy;
  /**
   * Presentation seam for shared content strings (questions, worlds, projects, result meaning...): V3 renders them
   * as is (identity); V4 renders its gender-inclusive wording (`v4Text`, DEC-036). Text only: never ids or mappings.
   */
  t: (text: string) => string;
  /** Lead form copy (V3: `V2_LEAD_COPY`; V4: `V4_LEAD_COPY`). */
  leadCopy: LeadCopy;
  /** V4: discovery screens offer a way back to the entry-method screen. */
  hasEntryChoice: boolean;
  /**
   * V4 discovery pages reached directly (/v4/worlds, /v4/projects): adopt the page's mode when none is stored, or
   * switch when nothing has been chosen yet. Returns false while a redirect to the stored mode's page is pending.
   */
  ensureEntryMode: (mode: EntryMode) => boolean;
  /** V4: choose (or change) the discovery method. Changing it starts a fresh journey. */
  selectEntryMode: (mode: EntryMode) => void;
}

export const ExperienceContext = createContext<ExperienceValue | null>(null);

export function useExperience(): ExperienceValue {
  const context = useContext(ExperienceContext);
  if (!context) throw new Error("useExperience must be used inside an experience provider (V3Provider / V4Provider)");
  return context;
}

/** Redirects to the screen the journey allows. True when the route may render. */
export function useExperienceGuard(route: Exclude<ExperienceRoute, "landing">): boolean {
  const { hydrated, isLeavingToLanding, target, allows, pathFor } = useExperience();
  const router = useRouter();
  const where = target();
  const allowed = allows(route, where);
  const destination = pathFor(where);
  useEffect(() => {
    if (hydrated && !allowed && !isLeavingToLanding()) router.replace(destination);
  }, [hydrated, allowed, router, destination, isLeavingToLanding]);
  return hydrated && allowed;
}
