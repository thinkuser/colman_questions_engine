"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildV2QuestionView, discoveryStep } from "@/flow";
import { useDiscoveryAnalytics } from "@/ui/analytics/useDiscoveryAnalytics";
import { ChoiceQuestionCard } from "@/ui/components/ChoiceQuestionCard";
import { copy } from "@/ui/copy.he";
import { V2_PATHS } from "@/ui/routes";
import { useDiscovery, useDiscoveryGuard } from "@/ui/state/DiscoveryProvider";
import { DiscoveryProgress, DiscoveryStepIndicator } from "./DiscoveryStepIndicator";

/**
 * Renders whatever the engine says is next: an authored or generated V2 question, or a V1 Tech precision question,
 * all through the same card. This component holds no routing or scoring logic: an answer is dispatched, and the flow
 * (backed by the engine) decides what comes next, whether Tech takes over, or that the journey is done. Back and
 * restart just dispatch; the route guard moves the URL to wherever the new state belongs.
 */
export function DiscoveryQuestionsStep() {
  const { state, dispatch } = useDiscovery();
  const router = useRouter();
  const allowed = useDiscoveryGuard("questions");
  const analytics = useDiscoveryAnalytics();

  const step = useMemo(() => (allowed ? discoveryStep(state) : null), [allowed, state]);
  const view = useMemo(() => (step?.status === "ask" ? buildV2QuestionView(step) : null), [step]);

  // Exposure of the displayed question (deduplicated by the tracker; Back shows a new exposure).
  const exposureKey = view ? `${state.answers.length}:${view.id}` : null;
  useEffect(() => {
    if (exposureKey) analytics.questionViewed();
  }, [exposureKey, analytics]);

  if (!allowed || !step || step.status === "complete") return null;

  function handleRestart() {
    dispatch({ type: "restart" });
    router.push(V2_PATHS.select);
  }

  function handleBack() {
    dispatch({ type: "go_back" });
  }

  return (
    <section className="space-y-6">
      <DiscoveryStepIndicator current="questions" />
      <DiscoveryProgress answered={state.answers.length} />

      {view ? (
        <ChoiceQuestionCard
          key={view.id}
          questionId={view.id}
          prompt={view.prompt}
          options={view.options}
          onAnswer={(questionId, answerId) => dispatch({ type: "record_answer", answer: { questionId, answerId } })}
        />
      ) : (
        <div className="space-y-2" role="alert">
          <h1 className="text-xl font-bold">{copy.v2.questions.gapTitle}</h1>
          <p className="text-slate-700">{copy.v2.questions.gapBody}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
        <button type="button" className="min-h-11 rounded-lg px-3 text-brand underline" onClick={handleBack}>
          {copy.v2.questions.back}
        </button>
        <button type="button" className="min-h-11 rounded-lg px-3 text-slate-600 underline" onClick={handleRestart}>
          {copy.v2.questions.restart}
        </button>
      </div>
    </section>
  );
}
