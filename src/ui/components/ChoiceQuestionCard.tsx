"use client";

import { useEffect, useRef } from "react";
import { copy } from "@/ui/copy.he";

/**
 * A tap that arrives within this window of a question appearing is ignored. A double tap on an answer would
 * otherwise land its second tap on the NEXT question's option at the same screen position and silently record an
 * unintended answer (found in THI-12 acceptance QA). Purely an interaction guard: no scoring or routing involved.
 * Shared by the V1 and V2 question screens.
 */
export const ANSWER_TAP_GUARD_MS = 350;

export interface ChoiceOption {
  id: string;
  label: string;
}

/**
 * One question with large, readable options. Presentation only: it knows an id, a prompt and labelled options, and
 * reports the tapped option. Which question follows is decided by the flow/engine, never here. Authored, generated
 * and precision questions all render through this one component.
 */
export function ChoiceQuestionCard({
  questionId,
  prompt,
  options,
  onAnswer,
}: {
  questionId: string;
  prompt: string;
  options: readonly ChoiceOption[];
  onAnswer: (questionId: string, answerId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const acceptTapsAfter = useRef(Number.POSITIVE_INFINITY);

  // Move focus to the new question so keyboard and screen-reader users land on it.
  useEffect(() => {
    acceptTapsAfter.current = performance.now() + ANSWER_TAP_GUARD_MS;
    headingRef.current?.focus();
  }, [questionId]);

  return (
    <div className="space-y-5" data-question-id={questionId}>
      <h1 ref={headingRef} tabIndex={-1} className="text-xl leading-snug font-bold outline-none sm:text-2xl">
        {prompt}
      </h1>
      <ul className="space-y-3" aria-label={copy.questions.optionsLabel}>
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              data-option-id={option.id}
              onClick={() => {
                if (performance.now() >= acceptTapsAfter.current) onAnswer(questionId, option.id);
              }}
              className="min-h-14 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-start text-base leading-snug break-words transition-colors hover:border-brand active:border-brand active:bg-brand/5 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
