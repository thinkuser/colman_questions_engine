import type { V2AnswerOption } from "../discovery";
import type { ProgramId } from "../types";
import type { V2RankedProgram } from "./scoring";

/**
 * Generic focus questions (THI-14, DEC-030). When no authored question separates the evidence leading set,
 * build a 2- or 3-way "which day sounds most interesting?" question from their curated work statements: one option per
 * program plus a neutral "neither". Deterministic and built from structured data only: nothing is generated at
 * runtime, and no pair- or triple-specific content is authored.
 */

export const GENERIC_FOCUS_PREFIX = "focus";
/** A generated focus question compares at most this many programs. Larger unresolved sets need authored content. */
export const GENERIC_FOCUS_MAX_PROGRAMS = 3;

const OPTION_IDS = ["A", "B", "C"] as const;

export interface GenericFocusQuestion {
  /** `focus:<a>|<b>[|<c>]:<index>`: the programs in canonical id order, and which statement of each is shown. */
  id: string;
  /** Always weighed as a focus answer (+4). */
  kind: "focus";
  /** 2 or 3 programs in canonical (alphabetical) order: DISPLAY order only, never a ranking. */
  programIds: readonly ProgramId[];
  /** Index into each program's work statements. */
  statementIndex: number;
  /** One option per program (A, B, C) and a neutral "neither" that supports no program. */
  options: readonly V2AnswerOption[];
}

export const genericFocusId = (programIds: readonly ProgramId[], index: number) =>
  `${GENERIC_FOCUS_PREFIX}:${[...programIds].sort().join("|")}:${index}`;

/**
 * The evidence leading set: the programs a focus question must compare. It is NOT the full ranking (which stays
 * available as a diagnostic); it holds only evidence-based contenders, so that no equally supported contender is left
 * out (DEC-027) and no untested program is treated as a runner-up (DEC-022). Built from shared ranks, never from array
 * position:
 * - Some program has a supporting answer: only supported programs count. Zero-support programs are untested
 *   alternatives, not runners-up; they stay rankable and join as soon as an answer supports them.
 *   - two or more supported programs share the top rank: that whole group;
 *   - otherwise: the leader plus EVERY supported program sharing the next rank;
 *   - a single supported program: just that leader. This is not a recommendation: the clear-leader rule still applies.
 * - No program has support yet: the whole top-rank group (all programs with no evidence). No leader is invented.
 * Returned in canonical id order.
 */
export function evidenceLeadingSet(ranking: readonly V2RankedProgram[]): ProgramId[] {
  const supported = ranking.filter((row) => row.support > 0);
  const contenders = supported.length > 0 ? supported : ranking;
  const leader = contenders[0];
  if (!leader) return [];
  const top = contenders.filter((row) => row.rank === leader.rank);
  if (top.length >= 2) return top.map((row) => row.programId).sort();
  const next = contenders.find((row) => row.rank !== leader.rank);
  if (!next) return [leader.programId];
  return [leader.programId, ...contenders.filter((row) => row.rank === next.rank).map((row) => row.programId)].sort();
}

/**
 * The next generic focus question for 2-3 programs, using the next unused statement index for exactly that set.
 * Returns null when the set is not 2-3 programs or any member lacks a statement at that index: the caller reports
 * `needs_focus_content` instead of guessing or trimming the set.
 */
export function buildGenericFocus(
  programIds: readonly ProgramId[],
  askedQuestionIds: readonly string[],
  workStatements: Readonly<Record<ProgramId, readonly string[]>>,
): GenericFocusQuestion | null {
  const sorted = [...programIds].sort();
  if (sorted.length < 2 || sorted.length > GENERIC_FOCUS_MAX_PROGRAMS) return null;
  const prefix = `${GENERIC_FOCUS_PREFIX}:${sorted.join("|")}:`;
  const index = askedQuestionIds.filter((id) => id.startsWith(prefix)).length;
  if (sorted.some((programId) => (workStatements[programId]?.length ?? 0) <= index)) return null;
  return {
    id: genericFocusId(sorted, index),
    kind: "focus",
    programIds: sorted,
    statementIndex: index,
    options: [
      ...sorted.map((programId, position) => ({
        id: OPTION_IDS[position]!,
        programIds: [programId],
        realityLevel: null,
      })),
      { id: "neither", programIds: [], realityLevel: null },
    ],
  };
}
