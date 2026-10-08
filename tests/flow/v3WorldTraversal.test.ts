import { describe, expect, it } from "vitest";
import { V2_PROGRAM_IDS, V3_WORLDS } from "@/data";
import type { RecordedAnswer, V2Step } from "@/engine";
import { WORLD_STRATEGY } from "@/flow";

/**
 * V3 world-led discovery: exhaustive, state-memoised traversal of every answer path for all 45 opening selections
 * (9 single worlds + 36 pairs, each pair in BOTH selection orders). This checks content coverage and routing
 * correctness. It is NOT a calibration: equal-weight enumeration says nothing about how real candidates answer, so the
 * outcome mix is reported, never tuned against.
 *
 * Report: `CALIBRATION_REPORT=1 pnpm vitest run tests/flow/v3WorldTraversal.test.ts`
 */

const WORLD_IDS = V3_WORLDS.map((world) => world.id);
const SINGLES = WORLD_IDS.map((id) => [id]);
const PAIRS = WORLD_IDS.flatMap((a, i) => WORLD_IDS.slice(i + 1).map((b) => [a, b]));

interface Tally {
  paths: number;
  recommended: number;
  near_tie: number;
  insufficient: number;
  precision: number;
  gap: number;
  maxScored: number;
  maxAnswers: number;
  /** The longest remaining answer sequence from this state ("question=answer"). */
  longest: string[];
  /** Longest sequence that ends in the Tech precision module. */
  longestTech: string[];
  outcomes: Set<string>;
  gaps: string[];
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
  longest: [],
  longestTech: [],
  outcomes: new Set(),
  gaps: [],
});

const step = (selected: readonly string[], answers: readonly RecordedAnswer[]): V2Step =>
  WORLD_STRATEGY.nextStep(selected, answers);

function asked(s: Extract<V2Step, { status: "ask" }>): { id: string; options: string[] } {
  if (s.mode === "precision") return { id: s.question.id, options: s.question.options.map((o) => o.id) };
  return { id: s.question.question.id, options: s.question.question.options.map((o) => o.id) };
}

function leaf(s: V2Step, answers: number, label: string): Tally {
  const t = empty();
  t.paths = 1;
  t.maxScored = s.state.scoredAnswerCount;
  t.maxAnswers = answers;
  if (s.status === "needs_focus_content") {
    t.gap = 1;
    t.gaps.push(`${label} [${s.programIds.join(",")}]`);
  } else if (s.status === "complete") {
    const outcome = s.outcome;
    if (outcome.kind === "recommended") {
      t.recommended = 1;
      t.outcomes.add(outcome.programId);
    } else if (outcome.kind === "near_tie") {
      t.near_tie = 1;
      for (const id of outcome.programIds) t.outcomes.add(id);
    } else if (outcome.kind === "insufficient_positive_evidence") {
      t.insufficient = 1;
    } else {
      t.precision = 1;
      if (outcome.result.bestFitProgram) t.outcomes.add(outcome.result.bestFitProgram);
    }
  }
  return t;
}

function merge(into: Tally, child: Tally, edge: string) {
  for (const k of ["paths", "recommended", "near_tie", "insufficient", "precision", "gap"] as const)
    into[k] += child[k];
  into.maxScored = Math.max(into.maxScored, child.maxScored);
  into.maxAnswers = Math.max(into.maxAnswers, child.maxAnswers);
  if (child.longest.length + 1 > into.longest.length) into.longest = [edge, ...child.longest];
  if (child.precision > 0 && child.longestTech.length + 1 > into.longestTech.length) {
    into.longestTech = [edge, ...child.longestTech];
  }
  for (const id of child.outcomes) into.outcomes.add(id);
  for (const gap of child.gaps) if (into.gaps.length < 20) into.gaps.push(gap);
}

/** Memoised walk: two answer histories with the same key have identical futures (engine is a pure function of them). */
export function walkSelection(selected: readonly string[]): Tally {
  const memo = new Map<string, Tally>();
  const label = selected.join("+");
  const walk = (answers: RecordedAnswer[]): Tally => {
    const s = step(selected, answers);
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
    let tally: Tally;
    if (s.status !== "ask") {
      tally = leaf(s, answers.length, label);
      if (tally.precision > 0) tally.longestTech = [];
    } else {
      tally = empty();
      const { id, options } = asked(s);
      for (const option of options) {
        merge(tally, walk([...answers, { questionId: id, answerId: option }]), `${id}=${option}`);
      }
    }
    memo.set(key, tally);
    return tally;
  };
  return walk([]);
}

describe("V3 world traversal (all 45 opening selections)", () => {
  const results = [...SINGLES, ...PAIRS].map((selected) => ({ selected, tally: walkSelection(selected) }));

  it("never hits a content gap, and every path completes", () => {
    const gaps = results.flatMap(({ tally }) => tally.gaps);
    expect(gaps).toEqual([]);
    for (const { selected, tally } of results) {
      expect(tally.gap, selected.join("+")).toBe(0);
      expect(tally.recommended + tally.near_tie + tally.insufficient + tally.precision, selected.join("+")).toBe(
        tally.paths,
      );
    }
  }, 300_000);

  it("keeps the generic ceiling: at most 5 scored generic answers", () => {
    for (const { selected, tally } of results) expect(tally.maxScored, selected.join("+")).toBeLessThanOrEqual(5);
  });

  it("reaches every one of the 14 programs as a recommendation, a near-tie member or a Tech precision fit", () => {
    const reached = new Set(results.flatMap(({ tally }) => [...tally.outcomes]));
    expect([...V2_PROGRAM_IDS].filter((id) => !reached.has(id))).toEqual([]);
  });

  it("the reverse selection order of a pair never creates a gap either (selection order is not a hidden signal)", () => {
    for (const [a, b] of PAIRS) {
      const reversed = walkSelection([b!, a!]);
      expect(reversed.gap, `${b}+${a}`).toBe(0);
    }
  }, 300_000);

  it("prints the traversal report when CALIBRATION_REPORT=1", () => {
    if (!process.env.CALIBRATION_REPORT) return;
    const total = empty();
    for (const { tally } of results) merge(total, tally, "");
    const rows = results.map(({ selected, tally }) => ({
      selection: selected.join(" + "),
      paths: tally.paths,
      recommended: tally.recommended,
      near_tie: tally.near_tie,
      insufficient: tally.insufficient,
      precision: tally.precision,
      gaps: tally.gap,
      max_scored: tally.maxScored,
      max_answers: tally.maxAnswers,
    }));
    console.table(rows);
    console.log("TOTAL", {
      selections: results.length,
      paths: total.paths,
      recommended: total.recommended,
      near_tie: total.near_tie,
      insufficient: total.insufficient,
      precision: total.precision,
      gaps: total.gap,
      maxScored: total.maxScored,
      maxAnswers: total.maxAnswers,
    });
    const tech = results
      .map(({ selected, tally }) => ({ selected, path: tally.longestTech }))
      .sort((x, y) => y.path.length - x.path.length)[0]!;
    console.log("LONGEST TECH PATH", tech.selected.join("+"), tech.path.length, tech.path.join(", "));
    const longest = results
      .map(({ selected, tally }) => ({ selected, path: tally.longest }))
      .sort((x, y) => y.path.length - x.path.length)[0]!;
    console.log("LONGEST PATH", longest.selected.join("+"), longest.path.length, longest.path.join(", "));
  }, 300_000);
});
