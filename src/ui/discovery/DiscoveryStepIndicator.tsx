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
            className={`rounded-full px-3 py-1 ${isCurrent ? "colman-gradient font-semibold text-white" : "bg-colman-surface text-slate-600"}`}
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
      <p className="text-sm font-semibold text-colman-blue-dark" aria-live="polite">
        {copy.v2.questions.progressTitle}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-colman-surface" aria-hidden="true">
        <div className="colman-gradient h-full rounded-full transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
