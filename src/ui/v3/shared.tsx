import Image from "next/image";
import type { ReactNode } from "react";
import { V3_COPY } from "@/data";
import { v3Progress, type V3Stage } from "@/flow";
import { useExperience } from "@/ui/experience/ExperienceContext";

/** The official COLMAN logo, stored locally (public/brand). Never hotlinked, never redrawn. */
export function LogoMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/colman-logo.webp"
      alt={V3_COPY.logoAlt}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      priority
    />
  );
}

/**
 * A persistent bottom action area. Safe-area aware (home indicator / notch), and it reserves its own height in the flow
 * (the spacer) so it never covers the content above it.
 */
export function StickyBar({
  children,
  className = "",
  hidden = false,
}: {
  children: ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  return (
    <>
      <div aria-hidden="true" className="h-32" />
      <div
        data-testid="sticky-bar"
        hidden={hidden}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-colman-border bg-white/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(27,33,112,0.08)] backdrop-blur ${className}`}
      >
        <div className="mx-auto max-w-2xl space-y-2 px-4">{children}</div>
      </div>
    </>
  );
}

export const v3Primary =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-colman-blue px-5 py-3 text-center text-lg font-semibold text-white shadow-sm transition-colors hover:bg-colman-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

export const v3Secondary =
  "flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-colman-blue bg-white px-5 py-3 text-center font-semibold text-colman-blue transition-colors hover:bg-colman-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue";

/** "Step N of 3" with a three-segment bar and a deterministic encouragement. Never a question count. */
export function ProgressHeader({ stage, committedAnswers = 0 }: { stage: V3Stage; committedAnswers?: number }) {
  const { ui } = useExperience();
  const progress = v3Progress(stage, committedAnswers, ui.progress);
  return (
    <div className="space-y-2" aria-label={ui.progress.label} data-testid="progress">
      <p className="text-sm font-semibold text-colman-blue-dark">
        <span data-testid="progress-stage">{progress.stageLabelHe}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="progress-name">{progress.stageNameHe}</span>
      </p>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 rounded-full ${segment <= stage ? "colman-gradient" : "bg-colman-surface"}`}
          />
        ))}
      </div>
      {progress.toneHe && (
        <p className="text-sm text-slate-600" aria-live="polite" data-testid="progress-tone" data-tone={progress.tone}>
          {progress.toneHe}
        </p>
      )}
    </div>
  );
}
