import type { RealityLevel, V2QuestionKind } from "../discovery";
import type { ProgramId } from "../types";

/**
 * Generic V2 point scoring (THI-14, DEC-030). Transparent calibration seeds, not psychometric scores, and never shown
 * to candidates. Used only outside a precision module: the V1 CS/DS/MIS engine keeps its own scoring (DEC-019).
 */

/** Points a chosen answer gives to EACH program it points to (no splitting between targets). */
export const V2_WEIGHTS: Readonly<Record<V2QuestionKind, number>> = {
  scenario: 3,
  focus: 4,
  tiebreaker: 5,
  reality_check: 0,
};

/** A clear leader is evaluated only after this many scored answers. */
export const V2_MIN_SCORED_ANSWERS_FOR_CLEAR = 3;
/** A clear leader needs at least this many scored answers supporting it. */
export const V2_CLEAR_MIN_SUPPORT = 2;
/** A clear leader needs at least this many points over the next program. */
export const V2_CLEAR_MIN_LEAD = 4;
/** The generic flow stops after this many scored answers, even if the result is still close. */
export const V2_MAX_GENERIC_SCORED_ANSWERS = 5;

export type V2WeightClass = Exclude<V2QuestionKind, "reality_check">;

/** Where a scored question came from: an authored cluster question or a generated head-to-head. */
export type V2QuestionSource =
  { type: "cluster"; clusterId: string } | { type: "head_to_head"; programIds: readonly [ProgramId, ProgramId] };

/** Provenance of one scored answer, kept from the start so results can later explain themselves. */
export interface V2ScoredAnswer {
  questionId: string;
  answerId: string;
  source: V2QuestionSource;
  weightClass: V2WeightClass;
  /** Points given to each program in `programIds`. */
  weight: number;
  /** Programs this answer supports; each received the full weight. Empty for a neutral answer. */
  programIds: readonly ProgramId[];
}

/** A reality-check answer: recorded as evidence, never ranked (DEC-009). */
export interface V2RealityAnswer {
  questionId: string;
  answerId: string;
  clusterId: string;
  realityLevel: RealityLevel;
}

export interface V2RankedProgram {
  programId: ProgramId;
  score: number;
  /** Number of scored answers that supported this program. */
  support: number;
  /** 1-based. Programs with equal score and support share a rank: a true tie stays a tie. */
  rank: number;
}

export interface V2Tally {
  scores: Record<ProgramId, number>;
  support: Record<ProgramId, number>;
}

/** Sum points and support counts from scored answers only. Pool membership and order contribute nothing. */
export function tally(rankable: readonly ProgramId[], scored: readonly V2ScoredAnswer[]): V2Tally {
  const scores: Record<ProgramId, number> = Object.fromEntries(rankable.map((id) => [id, 0]));
  const support: Record<ProgramId, number> = Object.fromEntries(rankable.map((id) => [id, 0]));
  for (const answer of scored) {
    for (const programId of answer.programIds) {
      scores[programId] = (scores[programId] ?? 0) + answer.weight;
      support[programId] = (support[programId] ?? 0) + 1;
    }
  }
  return { scores, support };
}

/**
 * Rank by score, then support. Equal score and support share a rank. The array order inside a tie uses the program
 * id only to be deterministic; it is NOT a ranking signal (DEC-027) and never decides a result.
 */
export function rankPrograms(rankable: readonly ProgramId[], { scores, support }: V2Tally): V2RankedProgram[] {
  const rows = rankable.map((programId) => ({
    programId,
    score: scores[programId] ?? 0,
    support: support[programId] ?? 0,
  }));
  rows.sort((a, b) => b.score - a.score || b.support - a.support || (a.programId < b.programId ? -1 : 1));
  let rank = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous || previous.score !== row.score || previous.support !== row.support) rank = index + 1;
    return { ...row, rank };
  });
}

/**
 * The programs still in contention: they have at least one supporting answer and are less than the clear-lead margin
 * behind the leader. Empty while there is no positive evidence.
 */
export function shortlist(ranking: readonly V2RankedProgram[]): ProgramId[] {
  const leader = ranking[0];
  if (!leader || leader.support === 0) return [];
  return ranking
    .filter((row) => row.support > 0 && leader.score - row.score < V2_CLEAR_MIN_LEAD)
    .map((row) => row.programId);
}

/** The clear leader, if the generic stop rule is met: >= 3 scored answers, >= 2 supporting answers, lead >= 4. */
export function clearLeader(ranking: readonly V2RankedProgram[], scoredAnswerCount: number): ProgramId | null {
  const leader = ranking[0];
  if (!leader || scoredAnswerCount < V2_MIN_SCORED_ANSWERS_FOR_CLEAR) return null;
  const runnerUp = ranking[1]?.score ?? 0;
  if (leader.support < V2_CLEAR_MIN_SUPPORT || leader.score - runnerUp < V2_CLEAR_MIN_LEAD) return null;
  return leader.programId;
}

/**
 * The generic ranking result, before any reality check.
 * - `recommended`: a clear leader.
 * - `near_tie`: at the ceiling, two or more programs with positive support are within the clear-lead margin. A valid
 *   result, not a failure.
 * - `insufficient_positive_evidence`: no defensible leader from expressed preferences (e.g. neutral/rejecting answers,
 *   or a leader with a single supporting answer). Never converted into a fake recommendation. A finer generic
 *   "no strong fit" threshold is an open product decision (DEC-030).
 */
export type V2GenericOutcome =
  | { kind: "recommended"; programId: ProgramId }
  | { kind: "near_tie"; programIds: readonly ProgramId[] }
  | { kind: "insufficient_positive_evidence" };

/** Resolve the ranking once the scored-answer ceiling is reached. */
export function resolveAtCeiling(ranking: readonly V2RankedProgram[], scoredAnswerCount: number): V2GenericOutcome {
  const leader = clearLeader(ranking, scoredAnswerCount);
  if (leader) return { kind: "recommended", programId: leader };
  const contenders = shortlist(ranking);
  if (contenders.length >= 2) return { kind: "near_tie", programIds: contenders };
  return { kind: "insufficient_positive_evidence" };
}
