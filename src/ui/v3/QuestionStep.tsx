"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExperienceCopy } from "@/data";
import { buildV3QuestionView, journeyStep, type V2QuestionView } from "@/flow";
import { useV3, useV3Guard } from "@/ui/state/V3Provider";
import { ProgressHeader, StickyBar, v3Primary } from "./shared";

/**
 * One question: tap an option to SELECT it (changeable), then press Continue to COMMIT it. Nothing advances on tap, and
 * the answer (and its analytics event) is recorded only on Continue, so changing your mind is free and never double
 * counted. The same panel renders authored, generated-focus, scenario and Tech precision questions: the question view
 * is the engine's, and which question follows is still decided by the engine after the commit.
 */
function QuestionPanel({
  view,
  onContinue,
  onBack,
  onRestart,
  answered,
  copy,
}: {
  view: V2QuestionView;
  copy: ExperienceCopy["questions"];
  onContinue: (optionId: string) => void;
  onBack: () => void;
  onRestart: () => void;
  answered: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = `q-${view.id}`;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="space-y-6" data-question-id={view.id}>
      <ProgressHeader stage={2} committedAnswers={answered} />
      <h1
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-xl leading-snug font-bold text-colman-blue-dark outline-none sm:text-2xl"
      >
        {view.prompt}
      </h1>

      <div role="radiogroup" aria-labelledby={headingId} className="space-y-3">
        {view.options.map((option) => {
          const checked = selected === option.id;
          return (
            <label
              key={option.id}
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 text-base leading-snug break-words transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-colman-blue ${
                checked
                  ? "colman-wash border-colman-blue shadow-sm"
                  : "border-colman-border bg-white hover:border-colman-blue"
              }`}
            >
              <input
                type="radio"
                name={`answer-${view.id}`}
                value={option.id}
                data-option-id={option.id}
                checked={checked}
                onChange={() => setSelected(option.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  checked ? "border-colman-blue bg-colman-blue text-white" : "border-colman-border bg-white"
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">{option.label}</span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-colman-border pt-4">
        <button type="button" className="min-h-11 rounded-lg px-3 text-colman-blue underline" onClick={onBack}>
          {copy.back}
        </button>
        <button type="button" className="min-h-11 rounded-lg px-3 text-slate-600 underline" onClick={onRestart}>
          {copy.restart}
        </button>
      </div>

      <StickyBar>
        <button
          type="button"
          className={v3Primary}
          disabled={selected === null}
          data-testid="question-continue"
          onClick={() => selected !== null && onContinue(selected)}
        >
          {copy.continue}
        </button>
      </StickyBar>
    </section>
  );
}

export function QuestionStep() {
  const { strategy, state, dispatch, restartToLanding, analytics, ui, t } = useV3();
  const allowed = useV3Guard("questions");

  const step = useMemo(() => (allowed ? journeyStep(strategy, state) : null), [allowed, strategy, state]);
  const view = useMemo(() => (step?.status === "ask" ? buildV3QuestionView(step, t) : null), [step, t]);

  const exposureKey = view ? `${state.answers.length}:${view.id}` : null;
  useEffect(() => {
    if (exposureKey) analytics.questionViewed();
  }, [exposureKey, analytics]);

  if (!allowed || !step || step.status === "complete") return null;

  if (!view) {
    return (
      <div className="space-y-2" role="alert">
        <h1 className="text-xl font-bold">{ui.questions.gapTitle}</h1>
        <p className="text-slate-700">{ui.questions.gapBody}</p>
      </div>
    );
  }

  return (
    <QuestionPanel
      key={`${state.answers.length}:${view.id}`}
      view={view}
      copy={ui.questions}
      answered={state.answers.length}
      onContinue={(answerId) => {
        // question_continue first (it describes the question being committed), then the commit derives question_answer.
        analytics.questionContinued();
        dispatch({ type: "record_answer", answer: { questionId: view.id, answerId } });
      }}
      onBack={() => dispatch({ type: "go_back" })}
      onRestart={restartToLanding}
    />
  );
}
