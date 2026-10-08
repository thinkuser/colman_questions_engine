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

/** V4 (dual-entry experiment) lives under /v4: the candidate chooses worlds or projects; V1, V2 and V3 are untouched. */
export const V4_PATHS = {
  landing: "/v4",
  start: "/v4/start",
  worlds: "/v4/worlds",
  projects: "/v4/projects",
  ready: "/v4/ready",
  questions: "/v4/questions",
  result: "/v4/result",
} as const;

/**
 * V5 (dual entry with balanced project-led discovery, DEC-037) lives under /v5. Same structure as V4; /v5/projects shows
 * the ten V5 projects, never V4's. No route redirects between V4 and V5.
 */
export const V5_PATHS = {
  landing: "/v5",
  start: "/v5/start",
  worlds: "/v5/worlds",
  projects: "/v5/projects",
  ready: "/v5/ready",
  questions: "/v5/questions",
  result: "/v5/result",
} as const;
