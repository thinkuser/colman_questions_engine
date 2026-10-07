import type { DiscoveryRoute } from "@/flow";
import { copy } from "@/ui/copy.he";

const ORDER: DiscoveryRoute[] = ["select", "questions", "result"];

/** The three stages of the V2 journey. Stages, not question counts: the length of the middle one is adaptive. */
export function DiscoveryStepIndicator({ current }: { current: DiscoveryRoute }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label={copy.v2.stepsLabel}>
      {ORDER.map((step, index) => {
        const isCurrent = step === current;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={`rounded-full px-3 py-1 ${isCurrent ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {index + 1}. {copy.v2.steps[step]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Progress without a denominator: adaptive routes (and the Tech module) vary in length, so the bar only moves
 * forward and never promises how many questions remain.
 */
export function DiscoveryProgress({ answered }: { answered: number }) {
  const percent = Math.round((100 * (answered + 1)) / (answered + 4));
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-brand" aria-live="polite">
        {copy.v2.questions.progressTitle}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
