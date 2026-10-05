import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "@/data";
import { computeFit, findBranch, MAX_QUESTIONS, MIN_QUESTIONS, type ProgramId } from "@/engine";
import {
  adaptiveStep,
  ALL_PILOT,
  CS,
  DS,
  enumerateRuns,
  fitInput,
  MIS,
  q,
  runFlow,
  preferencePolicy,
} from "./fixtures";

const SELECTIONS: Array<[string, ProgramId[]]> = [
  ["CS+DS+MIS", ALL_PILOT],
  ["CS+DS", [CS, DS]],
  ["CS+MIS", [CS, MIS]],
  ["DS+MIS", [DS, MIS]],
];
const RUNS = new Map(SELECTIONS.map(([label, programs]) => [label, enumerateRuns(programs)]));
const pairKey = (a: ProgramId, b: ProgramId) => [a, b].sort().join("|");
const favours = (questionId: string, answerId: string) =>
  q(questionId).options.find((option) => option.id === answerId)!.favours;

describe("adaptive flow — invariants over every answer path (real bank)", () => {
  it.each(SELECTIONS)("%s: every path ends in 5–7 questions", (label) => {
    for (const run of RUNS.get(label)!) {
      expect(run.questionsAsked).toBeGreaterThanOrEqual(MIN_QUESTIONS);
      expect(run.questionsAsked).toBeLessThanOrEqual(MAX_QUESTIONS);
    }
  });

  it.each(SELECTIONS)("%s: asks Q1–Q3 first, then the locked branch's pair questions in order", (label) => {
    for (const run of RUNS.get(label)!) {
      expect(run.asked.slice(0, 3)).toEqual(["Q1", "Q2", "Q3"]);
      const pairAsked = run.asked.slice(3).filter((id) => q(id).role === "pair");
      expect(pairAsked).toEqual(run.branch.pairQuestionIds.slice(0, pairAsked.length));
      expect(pairAsked.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(SELECTIONS)("%s: never asks a question about an unselected program", (label, programs) => {
    for (const run of RUNS.get(label)!) {
      expect(run.branch.programs.every((p) => programs.includes(p))).toBe(true);
      for (const id of run.asked) {
        for (const option of q(id).options) {
          expect(option.favours === null || programs.includes(option.favours), `${id} in ${label}`).toBe(true);
        }
      }
    }
  });

  it("CS/DS-only comparisons never ask MIS-specific questions (THI-8 acceptance)", () => {
    for (const run of RUNS.get("CS+DS")!) {
      expect(run.asked.some((id) => id.includes("MIS"))).toBe(false);
    }
  });

  it.each(SELECTIONS)(
    "%s: stops at 5 exactly when pair-1/pair-2 agree (no neither) and there is no near tie",
    (label, programs) => {
      for (const run of RUNS.get(label)!) {
        const [, , , p1, p2] = run.answers;
        const agree =
          favours(p1!.questionId, p1!.answerId) !== null &&
          favours(p1!.questionId, p1!.answerId) === favours(p2!.questionId, p2!.answerId);
        const nearTieAfter5 = computeFit(
          fitInput(
            run.answers.slice(0, 5).map((a) => ({ question: q(a.questionId), answerId: a.answerId })),
            programs,
          ),
        ).nearTie;
        expect(run.questionsAsked === 5).toBe(agree && !nearTieAfter5);
        if (run.questionsAsked === 5) expect(run.stopReason).toBe("pair_answers_agree");
      }
    },
  );

  it.each(SELECTIONS)(
    "%s: at most one tie-breaker, only after pair-3, only for a near tie that is not no_strong_fit",
    (label, programs) => {
      for (const run of RUNS.get(label)!) {
        const tieBreakers = run.asked.filter((id) => q(id).role === "tie_breaker");
        expect(tieBreakers.length).toBeLessThanOrEqual(1);
        expect(run.tieBreakerUsed).toBe(tieBreakers.length === 1);
        if (run.questionsAsked >= 6) {
          const afterPair3 = computeFit(
            fitInput(
              run.answers.slice(0, 6).map((a) => ({ question: q(a.questionId), answerId: a.answerId })),
              programs,
            ),
          );
          const shouldTieBreak = afterPair3.nearTie && afterPair3.fitClassification !== "no_strong_fit";
          expect(run.tieBreakerUsed).toBe(shouldTieBreak);
          if (shouldTieBreak) {
            // Tie-breaker targets the CURRENT top two, which may differ from the locked branch.
            expect(tieBreakers[0]).toBe(findBranch(QUESTION_BANK, ...afterPair3.mainDecision).tieBreakerId);
          }
          if (afterPair3.fitClassification === "no_strong_fit") expect(run.stopReason).toBe("no_strong_fit");
        }
      }
    },
  );

  it.each(SELECTIONS)("%s: the returned result equals computeFit over the asked answers", (label, programs) => {
    for (const run of RUNS.get(label)!.slice(0, 200)) {
      const answers = run.answers.map((a) => ({ question: q(a.questionId), answerId: a.answerId }));
      expect(run.result).toEqual(computeFit(fitInput(answers, programs)));
    }
  });

  it("can return no_strong_fit (THI-8 acceptance)", () => {
    expect([...RUNS.values()].flat().some((run) => run.result.fitClassification === "no_strong_fit")).toBe(true);
  });

  it("near ties can trigger the single tie-breaker (THI-8 acceptance)", () => {
    expect([...RUNS.values()].flat().some((run) => run.tieBreakerUsed)).toBe(true);
  });

  it("uses the current top two for the tie-breaker even when it differs from the locked branch", () => {
    const switched = RUNS.get("CS+DS+MIS")!.find(
      (run) => run.tieBreakerUsed && pairKey(...run.result.mainDecision) !== pairKey(...run.branch.programs),
    );
    expect(switched).toBeDefined();
  });
});

describe("adaptive flow — step contract", () => {
  it("starts with Q1 in the opening phase", () => {
    const step = adaptiveStep(ALL_PILOT, []);
    expect(step).toMatchObject({ status: "ask", phase: "opening", questionNumber: 1, branch: null });
    expect(step.status === "ask" && step.question.id).toBe("Q1");
  });

  it("locks the branch from the top two after Q3 (fixed when two programs are selected)", () => {
    const opening = [
      { questionId: "Q1", answerId: "B" },
      { questionId: "Q2", answerId: "B" },
      { questionId: "Q3", answerId: "4" },
    ];
    const three = adaptiveStep(ALL_PILOT, opening);
    expect(three.status === "ask" && three.question.id).toBe("CSDS-1"); // DS + CS lead after opening
    const two = adaptiveStep([DS, MIS], opening);
    expect(two.status === "ask" && two.question.id).toBe("DSMIS-1");
    expect(two.status === "ask" && two.phase).toBe("pair");
  });

  it("rejects an answer to a question the flow did not ask", () => {
    expect(() => adaptiveStep(ALL_PILOT, [{ questionId: "Q2", answerId: "A" }])).toThrow(/flow asked "Q1"/);
  });

  it("rejects answers beyond the stopping point", () => {
    const run = runFlow(ALL_PILOT, preferencePolicy(["A", "A", "5"], ["cs"]));
    expect(run.questionsAsked).toBe(5);
    expect(() => adaptiveStep(ALL_PILOT, [...run.answers, { questionId: "CSDS-3", answerId: "cs" }])).toThrow(
      /stopped/,
    );
  });

  it("rejects an answer that is not an option", () => {
    expect(() => adaptiveStep(ALL_PILOT, [{ questionId: "Q1", answerId: "Z" }])).toThrow(/not an option/);
  });
});
