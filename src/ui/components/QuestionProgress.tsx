import { MAX_QUESTIONS, MIN_QUESTIONS } from "@/engine";
import { copy } from "@/ui/copy.he";

/**
 * Progress for an adaptive-length flow: the current question number plus the usual range.
 * Deliberately no "n/7" denominator, since the final length (5-7) is only known as the answers come in.
 */
export function QuestionProgress({ questionNumber }: { questionNumber: number }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 text-sm" aria-live="polite">
      <span className="font-semibold text-brand">{copy.questions.progress(questionNumber)}</span>
      <span className="text-slate-500">{copy.questions.typicalLength(MIN_QUESTIONS, MAX_QUESTIONS)}</span>
    </p>
  );
}
