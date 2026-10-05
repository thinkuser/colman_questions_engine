"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { canAccessStep, currentStep, type FlowStep } from "@/flow";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "./ComparisonProvider";

/**
 * Keeps the URL in sync with flow state: if this step is not reachable, redirect to the step
 * the state allows (e.g. a deep link to /result without a completed comparison goes to /).
 */
export function useStepGuard(step: FlowStep): boolean {
  const { state } = useComparison();
  const router = useRouter();
  const allowed = canAccessStep(state, step);
  const target = STEP_PATHS[currentStep(state)];

  useEffect(() => {
    if (!allowed) {
      router.replace(target);
    }
  }, [allowed, router, target]);

  return allowed;
}
