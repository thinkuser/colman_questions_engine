"use client";

import { useEffect, useRef } from "react";
import type { BankQuestion } from "@/engine";
import { getQuestionCopyHe } from "@/data";
import { copy } from "@/ui/copy.he";

/**
 * Renders one question exactly as the engine returned it: Hebrew copy comes from structured question data and
 * every option is a large tap target. Selecting an option reports it and nothing else; which question follows is
 * decided by the flow/engine, never here.
 */
export function QuestionCard({
  question,
  onAnswer,
}: {
  question: BankQuestion;
  onAnswer: (questionId: string, answerId: string) => void;
}) {
  const questionCopy = getQuestionCopyHe(question.id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new question so keyboard and screen-reader users land on it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.id]);

  return (
    <div className="space-y-5" data-question-id={question.id}>
      <h1 ref={headingRef} tabIndex={-1} className="text-xl leading-snug font-bold outline-none sm:text-2xl">
        {questionCopy.prompt}
      </h1>
      <ul className="space-y-3" aria-label={copy.questions.optionsLabel}>
        {questionCopy.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              data-option-id={option.id}
              onClick={() => onAnswer(question.id, option.id)}
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
