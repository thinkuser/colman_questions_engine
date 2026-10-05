import type { FlowStep } from "@/flow";
import { copy } from "@/ui/copy.he";

const ORDER: FlowStep[] = ["select", "questions", "result"];

export function StepIndicator({ current }: { current: FlowStep }) {
  return (
    <ol className="flex gap-2 text-sm" aria-label="שלבי ההשוואה">
      {ORDER.map((step, index) => {
        const isCurrent = step === current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${isCurrent ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {index + 1}. {copy.steps[step]}
          </li>
        );
      })}
    </ol>
  );
}
