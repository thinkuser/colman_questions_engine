import type { Dimension } from "./dimensions";

/**
 * Engine contracts. Result outputs mirror docs/PRODUCT_SPEC.md; formula and constants are in docs/SCORING.md.
 * The engine is pure: it receives questions, answers, program vectors, and reality-check definitions as input
 * and never reads the data layer, admissions, or UI state.
 */

/** Stable internal program identifier, e.g. `data_science`. The engine is not tied to the pilot set. */
export type ProgramId = string;

/** Accumulated weighted signals per dimension: `C[d] = Σ question_weight × chosen_option_signal[d]`. */
export type CandidateVector = Record<Dimension, number>;

/** A program's editorial 1–5 emphasis per dimension (docs/PROGRAM_MODEL.md). Supplied by the data layer. */
export type ProgramVector = Record<Dimension, number>;

/** Qualitative fit classes. Never expose numeric match percentages to users (DEC-004). */
export const FIT_CLASSIFICATIONS = ["strong_fit", "good_fit", "consider_carefully", "no_strong_fit"] as const;
export type FitClassification = (typeof FIT_CLASSIFICATIONS)[number];

/** Question weight classes (docs/QUESTION_ENGINE.md). */
export const QUESTION_TYPES = ["scenario", "tradeoff", "preference", "self_rating", "career_label"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Signed signal per dimension carried by an answer option. Missing dimensions mean 0. */
export type SignalVector = Partial<Record<Dimension, number>>;

export interface AnswerOption {
  id: string;
  signals: SignalVector;
}

/** A question as presented to the candidate. All options are required to compute the attainable ideal. */
export interface QuestionDefinition {
  id: string;
  type: QuestionType;
  options: readonly AnswerOption[];
}

/** A single recorded answer — the raw material for answer-derived evidence (DEC-006). */
export interface RecordedAnswer {
  questionId: string;
  answerId: string;
}

export interface AnsweredQuestion {
  question: QuestionDefinition;
  answerId: string;
}

export interface ProgramInput {
  id: ProgramId;
  vector: ProgramVector;
}

/** A reality check definition from the fit layer, evaluated generically on its related dimensions. */
export interface RealityCheckInput {
  id: string;
  programId: ProgramId;
  relatedDimensions: readonly Dimension[];
}

export interface FitInput {
  /** Selected programs, in selection order (used only to break exact ties deterministically). */
  programs: readonly ProgramInput[];
  answers: readonly AnsweredQuestion[];
  realityChecks?: readonly RealityCheckInput[];
}

/** Per-program scoring. `rawFit` and `normalizedFit` are internal/diagnostic and never shown as percentages. */
export interface ScoredProgram {
  programId: ProgramId;
  /** 1-based rank by `normalizedFit`. */
  rank: number;
  /** `Σ_d C[d] × P[d]` — diagnostics only. */
  rawFit: number;
  /** Attainable ideal: `Σ_q max_option contribution(q, option, P)` over the questions actually asked. */
  idealFit: number;
  /** `clamp(rawFit / idealFit, 0, 1)`; 0 when there is no usable signal. Drives ranking and classification. */
  normalizedFit: number;
  /** False when `idealFit <= 0`: the asked questions cannot express fit for this program. */
  hasUsableSignal: boolean;
  fitClassification: FitClassification;
  /** `C[d] × P[d] / idealFit` per dimension; sums to the unclamped `rawFit / idealFit`. */
  dimensionContributions: Record<Dimension, number>;
}

/** One answered question's effect on each selected program. */
export interface ProgramContribution {
  /** `weight × Σ_d signal[d] × P[d]` for the chosen option. */
  contribution: number;
  /** Best attainable contribution for this question and program. */
  questionIdeal: number;
  /** `contribution / idealFit(P)`: this answer's share of the program's normalized fit. */
  normalizedContribution: number;
}

export interface EvidenceItem extends RecordedAnswer {
  questionType: QuestionType;
  weight: number;
  contributions: Record<ProgramId, ProgramContribution>;
  /** `normalizedContribution(#1) − normalizedContribution(#2)`. Negative = the answer worked against #1. */
  topVsSecond: number;
  direction: "supports_top" | "supports_second" | "neutral";
}

export interface DimensionDelta {
  dimension: Dimension;
  topContribution: number;
  secondContribution: number;
  /** `topContribution − secondContribution`; positive favours the top program. */
  delta: number;
}

/** Structured trade-off between the top two programs. Candidate-facing copy is written by THI-10. */
export interface Tradeoff {
  topProgram: ProgramId;
  secondProgram: ProgramId;
  /** Non-zero dimension deltas, ordered from most in favour of the top program to most against it. */
  decidingDimensions: DimensionDelta[];
}

export interface TriggeredDimension {
  dimension: Dimension;
  value: number;
  min: number;
  max: number;
  /** `min + (max − min) / 3`; the net-negative trigger fires when `value` is below it and below 0. */
  threshold: number;
  /** Why the dimension counts as materially low (DEC-018, proposed). */
  reasons: Array<"net_negative_bottom_third" | "explicit_negative_answer">;
  /** Questions whose chosen option carried an explicit negative signal on this dimension. */
  explicitNegativeQuestionIds: string[];
}

export interface TriggeredRealityCheck {
  id: string;
  programId: ProgramId;
  triggeredDimensions: TriggeredDimension[];
}

export interface FitResult {
  /** Null when the overall classification is `no_strong_fit` (DEC-010: never force a winner). */
  bestFitProgram: ProgramId | null;
  secondaryProgram: ProgramId | null;
  /** The real decision: the top two programs by normalized fit (DEC-007). Retained even for `no_strong_fit`. */
  mainDecision: [ProgramId, ProgramId];
  /** Classification of the top-ranked program. */
  fitClassification: FitClassification;
  /** Top-two normalized gap below the near-tie threshold. Never overrides `no_strong_fit`. */
  nearTie: boolean;
  /** All selected programs, ranked. */
  ranking: ScoredProgram[];
  /** Every answered question, ordered by |topVsSecond| (most decisive first), including answers against #1. */
  evidence: EvidenceItem[];
  tradeoff: Tradeoff;
  /** Triggered checks for the top two programs only. Never modify fit (DEC-009). */
  realityChecks: TriggeredRealityCheck[];
  candidateVector: CandidateVector;
}
