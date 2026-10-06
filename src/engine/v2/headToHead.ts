import type { V2AnswerOption } from "../discovery";
import type { ProgramId } from "../types";

/**
 * Generic head-to-head (THI-14, DEC-030): when no authored question separates the two current leaders, build an A-vs-B
 * focus question from their curated "day at work" statements. Deterministic, built from structured data only (never
 * generated at runtime), and no N×N pair content is authored.
 */

export const HEAD_TO_HEAD_PREFIX = "h2h";

export interface HeadToHeadQuestion {
  /** `h2h:<a>|<b>:<index>`: the pair in canonical id order, and which statement of each is shown. */
  id: string;
  /** Always weighed as a focus answer. */
  kind: "focus";
  /** The pair in canonical (alphabetical) order. Option A is the first program; it is not a ranking. */
  programIds: readonly [ProgramId, ProgramId];
  /** Index into each program's work statements. */
  statementIndex: number;
  /** A, B, and a neutral "neither" option that supports no program. */
  options: readonly V2AnswerOption[];
}

export const headToHeadId = (a: ProgramId, b: ProgramId, index: number) => `${HEAD_TO_HEAD_PREFIX}:${a}|${b}:${index}`;

/**
 * The next head-to-head between two programs, using the next unused statement index for that pair. Returns null when
 * either program lacks a statement at that index: the caller reports "needs focus content" instead of guessing.
 */
export function buildHeadToHead(
  pair: readonly [ProgramId, ProgramId],
  askedQuestionIds: readonly string[],
  workStatements: Readonly<Record<ProgramId, readonly string[]>>,
): HeadToHeadQuestion | null {
  const [a, b] = [...pair].sort() as [ProgramId, ProgramId];
  const prefix = `${HEAD_TO_HEAD_PREFIX}:${a}|${b}:`;
  const index = askedQuestionIds.filter((id) => id.startsWith(prefix)).length;
  if ((workStatements[a]?.length ?? 0) <= index || (workStatements[b]?.length ?? 0) <= index) return null;
  return {
    id: headToHeadId(a, b, index),
    kind: "focus",
    programIds: [a, b],
    statementIndex: index,
    options: [
      { id: "A", programIds: [a], realityLevel: null },
      { id: "B", programIds: [b], realityLevel: null },
      { id: "neither", programIds: [], realityLevel: null },
    ],
  };
}
