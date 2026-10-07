import { describe, expect, it } from "vitest";
import {
  clearLeader,
  rankPrograms,
  resolveAtCeiling,
  shortlist,
  tally,
  V2_CLEAR_MIN_LEAD,
  V2_CLEAR_MIN_SUPPORT,
  V2_MAX_GENERIC_SCORED_ANSWERS,
  V2_MIN_SCORED_ANSWERS_FOR_CLEAR,
  V2_WEIGHTS,
  type V2ScoredAnswer,
} from "@/engine";

const scored = (
  programIds: string[],
  weightClass: "scenario" | "focus" | "tiebreaker" = "scenario",
): V2ScoredAnswer => ({
  questionId: `q${Math.random()}`,
  answerId: "A",
  source: { type: "cluster", clusterId: "c" },
  weightClass,
  weight: V2_WEIGHTS[weightClass],
  programIds,
});

const rank = (rankable: string[], answers: V2ScoredAnswer[]) => rankPrograms(rankable, tally(rankable, answers));

describe("V2 weight classes and thresholds (accepted calibration seeds)", () => {
  it("scenario +3, focus +4, tiebreaker +5, reality check 0", () => {
    expect(V2_WEIGHTS).toEqual({ scenario: 3, focus: 4, tiebreaker: 5, reality_check: 0 });
  });

  it("clear leader after 3 scored answers with >= 2 support and a lead >= 4; ceiling 5", () => {
    expect([
      V2_MIN_SCORED_ANSWERS_FOR_CLEAR,
      V2_CLEAR_MIN_SUPPORT,
      V2_CLEAR_MIN_LEAD,
      V2_MAX_GENERIC_SCORED_ANSWERS,
    ]).toEqual([3, 2, 4, 5]);
  });
});

describe("tally", () => {
  it("gives the full weight and one support to every program a multi-target answer points to (no splitting)", () => {
    const { scores, support } = tally(["a", "b", "c"], [scored(["a", "b"], "focus")]);
    expect(scores).toEqual({ a: 4, b: 4, c: 0 });
    expect(support).toEqual({ a: 1, b: 1, c: 0 });
  });

  it("gives nothing for a neutral answer and nothing for merely being rankable", () => {
    const { scores, support } = tally(["a", "b"], [scored([])]);
    expect(scores).toEqual({ a: 0, b: 0 });
    expect(support).toEqual({ a: 0, b: 0 });
  });
});

describe("ranking", () => {
  it("ranks by score, then support; equal score and support share a rank (a true tie stays a tie)", () => {
    const ranking = rank(["b", "a"], [scored(["a"]), scored(["b"])]);
    expect(ranking.map((r) => [r.programId, r.score, r.support, r.rank])).toEqual([
      ["a", 3, 1, 1],
      ["b", 3, 1, 1],
    ]);
  });

  it("does not depend on the order programs entered the pool", () => {
    const answers = [scored(["x"]), scored(["y"], "focus"), scored(["z"])];
    expect(rank(["x", "y", "z"], answers)).toEqual(rank(["z", "y", "x"], answers));
  });
});

describe("shortlist and clear leader", () => {
  it("shortlists programs with support that are less than 4 points behind the leader", () => {
    // 7 vs 3: b is 4 behind, out. 6 vs 3: b is 3 behind, still in contention.
    expect(shortlist(rank(["a", "b", "c"], [scored(["a"]), scored(["a"], "focus"), scored(["b"])]))).toEqual(["a"]);
    expect(shortlist(rank(["a", "b", "c"], [scored(["a"]), scored(["a"]), scored(["b"])]))).toEqual(["a", "b"]);
    expect(shortlist(rank(["a", "b", "c"], [scored(["a"]), scored(["a"]), scored(["b"], "focus")]))).toEqual([
      "a",
      "b",
    ]);
    expect(shortlist(rank(["a", "b"], [scored([])]))).toEqual([]);
  });

  it("needs at least 3 scored answers", () => {
    const answers = [scored(["a"], "focus"), scored(["a"], "focus")];
    expect(clearLeader(rank(["a", "b"], answers), 2)).toBeNull();
    expect(clearLeader(rank(["a", "b"], [...answers, scored([])]), 3)).toBe("a");
  });

  it("needs at least 2 supporting answers, not just a big lead", () => {
    const answers = [scored(["a"], "tiebreaker"), scored([]), scored([])];
    expect(clearLeader(rank(["a", "b"], answers), 3)).toBeNull();
  });

  it("needs a lead of at least 4: 6 vs 3 is not clear, 7 vs 3 is", () => {
    const sixVsThree = [scored(["a"]), scored(["b"]), scored(["a"])];
    expect(clearLeader(rank(["a", "b"], sixVsThree), 3)).toBeNull();
    const sevenVsThree = [scored(["a"]), scored(["b"]), scored(["a"], "focus")];
    expect(clearLeader(rank(["a", "b"], sevenVsThree), 3)).toBe("a");
  });
});

describe("resolution at the ceiling", () => {
  it("is a near tie when two supported programs are within 4 points", () => {
    const answers = [scored(["a"]), scored(["b"]), scored(["a"], "focus"), scored(["b"], "focus"), scored([])];
    expect(resolveAtCeiling(rank(["a", "b"], answers), 5)).toEqual({ kind: "near_tie", programIds: ["a", "b"] });
  });

  it("is insufficient positive evidence when no program is defensibly ahead", () => {
    expect(
      resolveAtCeiling(rank(["a", "b"], [scored(["a"]), scored([]), scored([]), scored([]), scored([])]), 5),
    ).toEqual({
      kind: "insufficient_positive_evidence",
    });
    expect(resolveAtCeiling(rank(["a", "b"], [scored([]), scored([]), scored([]), scored([]), scored([])]), 5)).toEqual(
      {
        kind: "insufficient_positive_evidence",
      },
    );
  });

  it("still recommends a clear leader", () => {
    const answers = [scored(["a"]), scored(["a"]), scored(["b"]), scored(["a"]), scored([])];
    expect(resolveAtCeiling(rank(["a", "b"], answers), 5)).toEqual({ kind: "recommended", programId: "a" });
  });
});
