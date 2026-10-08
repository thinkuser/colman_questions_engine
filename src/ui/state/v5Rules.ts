import { journeyRoute, strategyForV5EntryMode, type JourneyState, type V5EntryMode } from "@/flow";
import type { ExperienceRoute } from "@/ui/experience/ExperienceContext";
import { v4Allows } from "./v4Rules";

/**
 * V5 routing rules (pure, unit-tested). Same back behaviour as V4: result -> last question, first question -> the
 * chosen discovery screen, discovery -> the method screen, method screen -> landing. Only the strategy differs
 * (projects -> PROJECT_STRATEGY).
 */

/** Where a V5 journey belongs. No method chosen yet: the landing (the method screen is always reachable from there). */
export function v5Target(entryMode: V5EntryMode | null, journey: JourneyState, introSeen: boolean): ExperienceRoute {
  if (entryMode === null) return "landing";
  const base = journeyRoute(strategyForV5EntryMode(entryMode), journey);
  if (base === "select") return "discover";
  if (base === "result") return "result";
  return journey.answers.length === 0 && !introSeen ? "ready" : "questions";
}

/** Which screens may render while the journey belongs elsewhere: exactly V4's rule (route logic only). */
export const v5Allows: (route: ExperienceRoute, target: ExperienceRoute) => boolean = v4Allows;
