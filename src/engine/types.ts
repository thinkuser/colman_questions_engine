import type { Dimension } from "./dimensions";

/**
 * Engine contracts. These mirror the result outputs in docs/PRODUCT_SPEC.md.
 * Scoring itself is out of scope for THI-5 and lands in THI-7 (scoring) / THI-8 (adaptive selection).
 */

/** Stable internal program identifier, e.g. `data_science`. The engine is not tied to the pilot set. */
export type ProgramId = string;

export type CandidateVector = Record<Dimension, number>;

/** A program's editorial 1–5 emphasis per dimension (docs/PROGRAM_MODEL.md). Supplied to the engine by the data layer. */
export type ProgramVector = Record<Dimension, number>;

/** Qualitative fit classes. Never expose numeric match percentages to users (DEC-004). */
export const FIT_CLASSIFICATIONS = ["strong_fit", "good_fit", "consider_carefully", "no_strong_fit"] as const;
export type FitClassification = (typeof FIT_CLASSIFICATIONS)[number];

/** A single recorded answer — the raw material for answer-derived evidence (DEC-006). */
export interface RecordedAnswer {
  questionId: string;
  answerId: string;
}

export interface EvidenceItem extends RecordedAnswer {
  programId: ProgramId;
}

export interface RealityCheck {
  code: string;
  programId: ProgramId;
}

export interface FitResult {
  bestFitProgram: ProgramId | null;
  secondaryProgram: ProgramId | null;
  /** The real decision, usually the top two programs (DEC-007). */
  mainDecision: [ProgramId, ProgramId] | null;
  fitClassification: FitClassification;
  evidence: EvidenceItem[];
  tradeoffSummary: string | null;
  realityChecks: RealityCheck[];
  candidateVector: CandidateVector;
}
