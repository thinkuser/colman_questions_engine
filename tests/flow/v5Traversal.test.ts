import { describe, expect, it } from "vitest";
import type { RecordedAnswer, V2Step } from "@/engine";
import {
  PROJECT_STRATEGY,
  strategyForEntryMode,
  strategyForV5EntryMode,
  WORLD_STRATEGY,
  type DiscoveryStrategy,
} from "@/flow";

/**
 * V5 traversal QA (DEC-037): the same exhaustive, state-memoised methodology as V2/V3/V4. Openers follow the
 * candidate's selection order, so every ORDERED selection is a distinct journey: 10 singles + 90 ordered pairs = 100.
 * Coverage and routing correctness only; nothing is calibrated from equal-weight enumeration.
 *
 * Report: `CALIBRATION_REPORT=1 pnpm vitest run tests/flow/v5Traversal.test.ts`
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
  /** Paths ending on each program: the recommended one, both near-tie peers, or V1's best fit. */
  programs: Record<string, number>;
}
const empty = (): Tally => ({
  programs: {},
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
  for (const [id, n] of Object.entries(from.programs)) into.programs[id] = (into.programs[id] ?? 0) + n;
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
      else if (s.outcome.kind === "recommended") {
        t.recommended = 1;
        t.programs[s.outcome.programId] = 1;
      } else if (s.outcome.kind === "near_tie") {
        t.near_tie = 1;
        for (const id of s.outcome.programIds) t.programs[id] = 1;
      } else if (s.outcome.kind === "insufficient_positive_evidence") t.insufficient = 1;
      else {
        t.precision = 1;
        t.programs[s.outcome.result.bestFitProgram ?? "v1_no_strong_fit"] = 1;
      }
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

const orderedSelections = (ids: readonly string[]) => [
  ...ids.map((id) => [id]),
  ...ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => [a, b])),
];

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((1000 * part) / whole) / 10);

describe("V5 projects traversal (PROJECT_STRATEGY)", () => {
  const selections = orderedSelections(PROJECT_STRATEGY.entryIds);
  const perSelection = selections.map((selected) => ({ selected, tally: walk(PROJECT_STRATEGY, selected) }));
  const total = empty();
  for (const { tally } of perSelection) add(total, tally);

  it("walks all 100 ordered opening selections (10 singles + 90 ordered pairs)", () => {
    expect(PROJECT_STRATEGY.entryIds).toHaveLength(10);
    expect(selections).toHaveLength(100);
  });

  it("finds no content gap, every path completes, and the generic ceiling holds", () => {
    expect(total.gap).toBe(0);
    expect(total.recommended + total.near_tie + total.insufficient + total.precision).toBe(total.paths);
    expect(total.maxScored).toBeLessThanOrEqual(5);
    for (const { selected, tally } of perSelection) expect(tally.gap, selected.join(" → ")).toBe(0);
  }, 600_000);

  it("prints the report when CALIBRATION_REPORT=1", () => {
    if (!process.env.CALIBRATION_REPORT) return;
    const longest = perSelection.reduce((best, entry) =>
      entry.tally.maxAnswers > best.tally.maxAnswers ? entry : best,
    );
    console.log(
      `V5 projects: selections=${selections.length} paths=${total.paths} recommended=${total.recommended} ` +
        `near_tie=${total.near_tie} insufficient=${total.insufficient} precision=${total.precision} gaps=${total.gap} ` +
        `max_scored=${total.maxScored} max_answers=${total.maxAnswers} longest=${longest.selected.join(" → ")} ` +
        `(${longest.tally.maxAnswers} answers)`,
    );
    // Path counts are dominated by the V1 Tech subtree (many leaves), so generic shares exclude precision paths.
    const generic = (t: Tally) => t.recommended + t.near_tie + t.insufficient;
    const row = (label: string, t: Tally) => ({
      selection: label,
      paths: t.paths,
      precision_pct: pct(t.precision, t.paths),
      recommended_of_generic: pct(t.recommended, generic(t)),
      near_tie_of_generic: pct(t.near_tie, generic(t)),
      insufficient_of_generic: pct(t.insufficient, generic(t)),
      max_answers: t.maxAnswers,
      programs_reached: Object.keys(t.programs).sort().join(","),
    });
    console.log("Single-project selections:");
    console.table(perSelection.filter((entry) => entry.selected.length === 1).map((e) => row(e.selected[0]!, e.tally)));
    console.log("Per project (all selections containing it):");
    console.table(
      PROJECT_STRATEGY.entryIds.map((id) => {
        const t = empty();
        for (const entry of perSelection) if (entry.selected.includes(id)) add(t, entry.tally);
        return row(id, t);
      }),
    );
    const pairs = perSelection.filter((entry) => entry.selected.length === 2 && generic(entry.tally) > 0);
    const top = (key: "near_tie" | "insufficient", of: (t: Tally) => number) =>
      [...pairs]
        .sort((a, b) => b.tally[key] / of(b.tally) - a.tally[key] / of(a.tally))
        .slice(0, 6)
        .map((entry) => `${entry.selected.join(" → ")} ${pct(entry.tally[key], of(entry.tally))}%`);
    console.log("Pairs with the most unresolved ties (share of generic paths):", top("near_tie", generic));
    console.log("Pairs with the most insufficient evidence (share of generic paths):", top("insufficient", generic));
    console.log(
      "Pairs entering Tech precision most (share of all paths):",
      [...perSelection.filter((entry) => entry.selected.length === 2)]
        .sort((a, b) => b.tally.precision / b.tally.paths - a.tally.precision / a.tally.paths)
        .slice(0, 6)
        .map((entry) => `${entry.selected.join(" → ")} ${pct(entry.tally.precision, entry.tally.paths)}%`),
    );
    console.log("Programs reached by any V5 project path:", Object.keys(total.programs).sort().join(","));
  });
});

describe("V5 worlds traversal (WORLD_STRATEGY, regression)", () => {
  it("V5 worlds IS the V4 (and V3) world strategy: same object, so the same outcomes for the same answers", () => {
    expect(strategyForV5EntryMode("worlds")).toBe(WORLD_STRATEGY);
    expect(strategyForEntryMode("worlds")).toBe(WORLD_STRATEGY);
    expect(strategyForV5EntryMode("projects")).toBe(PROJECT_STRATEGY);
  });

  it("finds no content gap across all 81 ordered world selections", () => {
    const selections = orderedSelections(WORLD_STRATEGY.entryIds);
    const total = empty();
    for (const selected of selections) add(total, walk(WORLD_STRATEGY, selected));
    expect(selections).toHaveLength(81);
    expect(total.gap).toBe(0);
    expect(total.maxScored).toBeLessThanOrEqual(5);
    if (process.env.CALIBRATION_REPORT)
      console.log(
        `V5 worlds: selections=81 paths=${total.paths} recommended=${total.recommended} near_tie=${total.near_tie} ` +
          `insufficient=${total.insufficient} precision=${total.precision} gaps=${total.gap} ` +
          `max_scored=${total.maxScored} max_answers=${total.maxAnswers}`,
      );
  }, 600_000);
});
