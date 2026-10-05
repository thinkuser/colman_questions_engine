import { EPSILON, NEAR_TIE_MAX_GAP } from "./constants";
import { buildEvidence, buildTradeoff, evaluateRealityChecks } from "./explain";
import { buildCandidateVector, scorePrograms, validateFitInput } from "./scoring";
import type { FitInput, FitResult } from "./types";

/**
 * The deterministic fit engine entry point. Pure: same input → same output.
 * The engine decides fit; an LLM may only explain the result (DEC-003). Admissions are never an input (DEC-008).
 */
export function computeFit(input: FitInput): FitResult {
  const { programs, answers, realityChecks = [] } = input;
  validateFitInput(programs, answers);

  const candidateVector = buildCandidateVector(answers);
  const ranking = scorePrograms(answers, programs, candidateVector);
  const [top, second] = [ranking[0]!, ranking[1]!];

  const fitClassification = top.fitClassification;
  const isNoStrongFit = fitClassification === "no_strong_fit";
  const nearTie = top.normalizedFit - second.normalizedFit < NEAR_TIE_MAX_GAP - EPSILON;

  return {
    bestFitProgram: isNoStrongFit ? null : top.programId,
    secondaryProgram: isNoStrongFit ? null : second.programId,
    mainDecision: [top.programId, second.programId],
    fitClassification,
    nearTie,
    ranking,
    evidence: buildEvidence(answers, programs, ranking),
    tradeoff: buildTradeoff(top, second),
    realityChecks: evaluateRealityChecks(answers, candidateVector, [top.programId, second.programId], realityChecks),
    candidateVector,
  };
}
