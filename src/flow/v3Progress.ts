import { V3_COPY } from "@/data";

/**
 * V3 progress transparency. The number of questions is adaptive (and can grow in the Tech module), so V3 never shows
 * a question count. It shows the stage out of three (projects / sharpening the direction / the result) and a
 * deterministic encouragement derived only from the number of COMMITTED answers.
 */

export type V3Stage = 1 | 2 | 3;
export type V3ProgressTone = "early" | "middle" | "late";

export interface V3Progress {
  stage: V3Stage;
  stageLabelHe: string;
  stageNameHe: string;
  tone: V3ProgressTone | null;
  toneHe: string | null;
}

const EARLY_BELOW = 2;
const MIDDLE_BELOW = 4;

export function progressTone(committedAnswers: number): V3ProgressTone {
  if (committedAnswers < EARLY_BELOW) return "early";
  if (committedAnswers < MIDDLE_BELOW) return "middle";
  return "late";
}

/** The progress copy an experience supplies (V3: `V3_COPY.progress`; V4: its gender-inclusive wording). */
export interface V3ProgressCopy {
  stage: (n: number) => string;
  stageNames: Readonly<Record<number, string>>;
  early: string;
  middle: string;
  late: string;
}

export function v3Progress(stage: V3Stage, committedAnswers = 0, copy: V3ProgressCopy = V3_COPY.progress): V3Progress {
  const tone = stage === 2 ? progressTone(committedAnswers) : null;
  return {
    stage,
    stageLabelHe: copy.stage(stage),
    stageNameHe: copy.stageNames[stage] ?? "",
    tone,
    toneHe: tone ? copy[tone] : null,
  };
}
