import type { FlowStep } from "@/flow";

export const STEP_PATHS: Record<FlowStep, string> = {
  select: "/",
  questions: "/questions",
  result: "/result",
};
