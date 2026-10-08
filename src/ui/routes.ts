import type { DiscoveryRoute, FlowStep } from "@/flow";

export const STEP_PATHS: Record<FlowStep, string> = {
  select: "/",
  questions: "/questions",
  result: "/result",
};

/** V2 career-project discovery lives under /v2 so the V1 comparison routes are untouched. */
export const V2_PATHS: Record<DiscoveryRoute, string> = {
  select: "/v2",
  questions: "/v2/questions",
  result: "/v2/result",
};
