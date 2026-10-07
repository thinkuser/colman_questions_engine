"use client";

import { useMemo } from "react";
import { getDiscoveryTracker } from "./discoveryBrowserTracker";

/**
 * The only analytics surface the V2 components use: they say WHAT happened and never build dataLayer payloads.
 * Every helper is a safe no-op when analytics is unavailable and returns nothing that could influence the product.
 */
export function useDiscoveryAnalytics() {
  return useMemo(
    () => ({
      discoveryViewed: (token: string) => getDiscoveryTracker()?.discoveryViewed(token),
      questionViewed: () => getDiscoveryTracker()?.questionViewed(),
      resultViewed: () => getDiscoveryTracker()?.resultViewed(),
      mirrorResponse: (value: "yes" | "no") => getDiscoveryTracker()?.mirrorResponse(value),
      admissionClick: () => getDiscoveryTracker()?.admissionClick(),
      advisorClick: () => getDiscoveryTracker()?.advisorClick(),
      officialProgramClick: (programId: string, role: "primary" | "alternative" | "peer") =>
        getDiscoveryTracker()?.officialProgramClick(programId, role),
      secondaryProgramViewed: () => getDiscoveryTracker()?.secondaryProgramViewed(),
      realityCheckViewed: (programId: string) => getDiscoveryTracker()?.realityCheckViewed(programId),
    }),
    [],
  );
}
