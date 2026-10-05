"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { canAccessStep, currentStep, type FlowStep } from "@/flow";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "./ComparisonProvider";

/**
 * Keeps the URL in sync with flow state: if this step is not reachable, redirect to the step
 * the state allows (e.g. a deep link to /result without a completed comparison goes to /).
 * Waits for the persisted state to be restored first, so a refresh on /questions is not bounced to /.
 * Returns true only when the step may be rendered.
 */
export function useStepGuard(step: FlowStep): boolean {
  const { state, hydrated } = useComparison();
  const router = useRouter();
  const allowed = canAccessStep(state, step);
  const target = STEP_PATHS[currentStep(state)];

  useEffect(() => {
    if (hydrated && !allowed) {
      router.replace(target);
    }
  }, [hydrated, allowed, router, target]);

  return hydrated && allowed;
}
