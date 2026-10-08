import { journeyRoute, strategyForEntryMode, type JourneyState, type V4EntryMode } from "@/flow";
import type { ExperienceRoute } from "@/ui/experience/ExperienceContext";

/**
 * V4 routing rules (pure, unit-tested). Back behaviour follows from them: result -> last question, first question ->
 * the chosen discovery screen, discovery -> the method screen, method screen -> landing.
 */

/** Where a V4 journey belongs. No method chosen yet: the landing (the method screen is always reachable from there). */
export function v4Target(entryMode: V4EntryMode | null, journey: JourneyState, introSeen: boolean): ExperienceRoute {
  if (entryMode === null) return "landing";
  const base = journeyRoute(strategyForEntryMode(entryMode), journey);
  if (base === "select") return "discover";
  if (base === "result") return "result";
  return journey.answers.length === 0 && !introSeen ? "ready" : "questions";
}

export function v4Allows(route: ExperienceRoute, target: ExperienceRoute): boolean {
  if (route === target) return true;
  // The method screen is reachable while nothing has been answered (from the landing or from discovery: "back").
  if (route === "start") return target === "landing" || target === "discover";
  // A discovery page reached directly with no method stored adopts its own mode (external A/B links).
  if (route === "discover") return target === "landing";
  return false;
}
