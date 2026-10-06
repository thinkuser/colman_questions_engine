"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { nextComparisonStep } from "@/flow";
import { useAnalytics } from "@/ui/analytics/useAnalytics";
import { QuestionCard } from "@/ui/components/QuestionCard";
import { QuestionProgress } from "@/ui/components/QuestionProgress";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { copy } from "@/ui/copy.he";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";
import { useStepGuard } from "@/ui/state/useStepGuard";

/**
 * Renders whatever question the flow/engine says is next. The component holds no routing or scoring logic:
 * answers are dispatched, and the reducer (backed by the engine) decides what comes next or that we are done.
 * Back and restart simply dispatch; the route guard moves the URL to the step the new state belongs on.
 */
export function QuestionsStep() {
  const { state, dispatch } = useComparison();
  const router = useRouter();
  const allowed = useStepGuard("questions");
  const { selectedProgramIds, answers } = state;
  const step = useMemo(
    () => (allowed ? nextComparisonStep({ selectedProgramIds, answers }) : null),
    [allowed, selectedProgramIds, answers],
  );

  const analytics = useAnalytics();
  // Exposure of the displayed question (deduplicated by the tracker; Back shows a new exposure).
  const exposureKey = step?.status === "ask" ? `${step.questionNumber}:${step.question.id}` : null;
  useEffect(() => {
    if (exposureKey) analytics.questionViewed();
  }, [exposureKey, analytics]);

  if (!allowed || step?.status !== "ask") {
    return null;
  }

  function handleRestart() {
    dispatch({ type: "restart" });
    router.push(STEP_PATHS.select);
  }

  return (
    <section className="space-y-6">
      <StepIndicator current="questions" />
      <QuestionProgress questionNumber={step.questionNumber} />

      <QuestionCard
        key={step.question.id}
        question={step.question}
        onAnswer={(questionId, answerId) => dispatch({ type: "record_answer", answer: { questionId, answerId } })}
      />

      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-brand underline"
          onClick={() => dispatch({ type: "go_back" })}
        >
          {copy.questions.back}
        </button>
        <button type="button" className="min-h-11 rounded-lg px-3 text-slate-600 underline" onClick={handleRestart}>
          {copy.questions.restart}
        </button>
      </div>
    </section>
  );
}
