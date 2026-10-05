import type { FitClassification, QuestionType } from "./types";

/** Question weight classes — documented in docs/QUESTION_ENGINE.md ("Weight classes"). */
export const QUESTION_TYPE_WEIGHTS: Readonly<Record<QuestionType, number>> = {
  scenario: 3.0,
  tradeoff: 3.0,
  preference: 2.0,
  self_rating: 1.5,
  career_label: 1.0,
};

/**
 * PROPOSED thresholds — DEC-018, pending review. Calibration seeds, NOT final product constants.
 * They were checked only against synthetic pair-question fixtures and must be revalidated in THI-8
 * once the real CSDS / CSMIS / DSMIS signal definitions exist. See docs/SCORING.md.
 *
 * All thresholds apply to `normalizedFit` (raw fit / attainable ideal, in [0, 1]).
 */
export const FIT_THRESHOLDS = {
  /** normalizedFit >= this → strong_fit */
  strong_fit: 0.8,
  /** normalizedFit >= this → good_fit */
  good_fit: 0.65,
  /** normalizedFit >= this → consider_carefully; below → no_strong_fit */
  consider_carefully: 0.5,
} as const satisfies Partial<Record<FitClassification, number>>;

/** PROPOSED (DEC-018): top-two normalizedFit gap strictly below this is a near tie. */
export const NEAR_TIE_MAX_GAP = 0.05;

/**
 * PROPOSED (DEC-018): a reality-check dimension triggers when its candidate value is strictly below
 * `min + (max − min) × REALITY_CHECK_BOTTOM_FRACTION` of its attainable range for the questions asked.
 */
export const REALITY_CHECK_BOTTOM_FRACTION = 1 / 3;

/**
 * PROPOSED (DEC-018): "materially" low also requires net-negative evidence, i.e. the candidate value must be
 * strictly below this neutral point. Without it, merely not choosing a dimension's options (value 0 at the
 * bottom of a 0..max range) would fire warnings, e.g. a math-loving CS candidate getting a statistics warning.
 */
export const REALITY_CHECK_MAX_SIGNAL = 0;

/**
 * DEC-020 (accepted): the 1–5 math-tolerance answer maps to `math_affinity = answer − 3` (1 → −2 … 5 → +2),
 * weighted as `self_rating`. A fit signal, not a gate: it may lower fit or trigger a reality check, never eliminate.
 */
export function mathToleranceSignal(answer: number): number {
  if (!Number.isInteger(answer) || answer < 1 || answer > 5) {
    throw new Error(`Math tolerance answer must be an integer 1–5, got ${answer}`);
  }
  return answer - 3;
}

/** Numerical tolerance for floating-point comparisons (not a product threshold). */
export const EPSILON = 1e-9;
