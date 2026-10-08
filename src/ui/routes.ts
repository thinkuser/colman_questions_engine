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

/** V3 (UX redesign) lives under /v3, fully separate from V1 (/) and the frozen V2 baseline (/v2). */
export type V3Route = "landing" | "discover" | "ready" | "questions" | "result";

export const V3_PATHS: Record<V3Route, string> = {
  landing: "/v3",
  discover: "/v3/worlds",
  ready: "/v3/ready",
  questions: "/v3/questions",
  result: "/v3/result",
};
