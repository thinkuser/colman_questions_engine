"use client";

import { useMemo } from "react";
import type { ProgramId } from "@/engine";
import { getBrowserTracker } from "./browserTracker";

/**
 * The only analytics surface components use. Components say WHAT happened; they never build dataLayer payloads.
 * Every helper is a safe no-op when analytics is unavailable (SSR, blocked storage), and none returns anything
 * that could influence product behaviour.
 */
export function useAnalytics() {
  return useMemo(
    () => ({
      compareViewed: (token: string) => getBrowserTracker()?.compareViewed(token),
      questionViewed: () => getBrowserTracker()?.questionViewed(),
      mirrorResponse: (value: "yes" | "no") => getBrowserTracker()?.mirrorResponse(value),
      admissionClick: () => getBrowserTracker()?.admissionClick(),
      advisorClick: () => getBrowserTracker()?.advisorClick(),
      secondaryProgramViewed: () => getBrowserTracker()?.secondaryProgramViewed(),
      realityCheckViewed: (programId: ProgramId) => getBrowserTracker()?.realityCheckViewed(programId),
    }),
    [],
  );
}
