import { describe, expect, it } from "vitest";
import type { RecordedAnswer, V2Step } from "@/engine";
import { BRAND_STRATEGY, WORLD_STRATEGY, type DiscoveryStrategy } from "@/flow";

/**
 * V4 traversal QA: both V4 entry modes walked with the same exhaustive, state-memoised methodology used for V2/V3.
 * V4 project mode = BRAND_STRATEGY (V2 content), V4 world mode = WORLD_STRATEGY (V3 content). Coverage and routing
 * correctness only; nothing is calibrated from equal-weight enumeration.
 *
 * Report: `CALIBRATION_REPORT=1 pnpm vitest run tests/flow/v4Traversal.test.ts`
 */

interface Tally {
  paths: number;
  recommended: number;
  near_tie: number;
  insufficient: number;
  precision: number;
  gap: number;
  maxScored: number;
  maxAnswers: number;
}
const empty = (): Tally => ({
  paths: 0,
  recommended: 0,
  near_tie: 0,
  insufficient: 0,
  precision: 0,
  gap: 0,
  maxScored: 0,
  maxAnswers: 0,
});
const add = (into: Tally, from: Tally) => {
  for (const k of ["paths", "recommended", "near_tie", "insufficient", "precision", "gap"] as const) into[k] += from[k];
  into.maxScored = Math.max(into.maxScored, from.maxScored);
  into.maxAnswers = Math.max(into.maxAnswers, from.maxAnswers);
};

function walk(strategy: DiscoveryStrategy, selected: readonly string[]): Tally {
  const memo = new Map<string, Tally>();
  const visit = (answers: RecordedAnswer[]): Tally => {
    const s: V2Step = strategy.nextStep(selected, answers);
    const key = JSON.stringify([
      [...s.state.askedQuestionIds].sort(),
      s.state.scores,
      s.state.support,
      s.state.rankableProgramIds,
      s.state.realityEvidence.map((r) => r.questionId),
      s.state.precision?.moduleAnswers ?? null,
    ]);
    const hit = memo.get(key);
    if (hit) return hit;
    const t = empty();
    if (s.status !== "ask") {
      t.paths = 1;
      t.maxScored = s.state.scoredAnswerCount;
      t.maxAnswers = answers.length;
      if (s.status === "needs_focus_content") t.gap = 1;
      else if (s.outcome.kind === "recommended") t.recommended = 1;
      else if (s.outcome.kind === "near_tie") t.near_tie = 1;
      else if (s.outcome.kind === "insufficient_positive_evidence") t.insufficient = 1;
      else t.precision = 1;
    } else {
      const id = s.mode === "precision" ? s.question.id : s.question.question.id;
      const options = (s.mode === "precision" ? s.question.options : s.question.question.options).map((o) => o.id);
      for (const option of options) add(t, visit([...answers, { questionId: id, answerId: option }]));
    }
    memo.set(key, t);
    return t;
  };
  return visit([]);
}

function selections(strategy: DiscoveryStrategy, ordered: boolean): string[][] {
  const ids = strategy.entryIds;
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));
  return [...ids.map((id) => [id]), ...pairs, ...(ordered ? pairs.map(([a, b]) => [b!, a!]) : [])];
}

describe("V4 traversal", () => {
  // Project mode orders openers by display order (V2 semantics), so a reversed pair is the same journey.
  const modes = [
    { label: "V4 Projects (BRAND_STRATEGY)", strategy: BRAND_STRATEGY, ordered: false },
    { label: "V4 Worlds (WORLD_STRATEGY)", strategy: WORLD_STRATEGY, ordered: true },
  ];
  const results = modes.map((mode) => {
    const total = empty();
    const list = selections(mode.strategy, mode.ordered);
    for (const selected of list) add(total, walk(mode.strategy, selected));
    return { ...mode, checked: list.length, total };
  });

  it("finds no content gap in either entry mode, and every path completes", () => {
    for (const { label, total } of results) {
      expect(total.gap, label).toBe(0);
      expect(total.recommended + total.near_tie + total.insufficient + total.precision, label).toBe(total.paths);
      expect(total.maxScored, label).toBeLessThanOrEqual(5);
    }
  }, 600_000);

  it("prints the report when CALIBRATION_REPORT=1", () => {
    if (!process.env.CALIBRATION_REPORT) return;
    console.table(
      results.map(({ label, checked, total }) => ({
        mode: label,
        selections: checked,
        paths: total.paths,
        recommended: total.recommended,
        near_tie: total.near_tie,
        insufficient: total.insufficient,
        precision: total.precision,
        gaps: total.gap,
        max_scored: total.maxScored,
        max_answers: total.maxAnswers,
      })),
    );
  });
});
