"use client";

import type { BankQuestion } from "@/engine";
import { getQuestionCopyHe } from "@/data";
import { ChoiceQuestionCard } from "./ChoiceQuestionCard";

export { ANSWER_TAP_GUARD_MS } from "./ChoiceQuestionCard";

/**
 * Renders one V1 question exactly as the engine returned it: Hebrew copy comes from structured question data. Selecting
 * an option reports it and nothing else; which question follows is decided by the flow/engine, never here.
 */
export function QuestionCard({
  question,
  onAnswer,
}: {
  question: BankQuestion;
  onAnswer: (questionId: string, answerId: string) => void;
}) {
  const questionCopy = getQuestionCopyHe(question.id);
  return (
    <ChoiceQuestionCard
      questionId={question.id}
      prompt={questionCopy.prompt}
      options={questionCopy.options}
      onAnswer={onAnswer}
    />
  );
}
