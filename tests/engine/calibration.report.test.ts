import { describe, it } from "vitest";
import type { ProgramId } from "@/engine";
import { ALL_PILOT, CS, DS, enumerateRuns, MIS, runFlow } from "./fixtures";
import { SANITY_CASES } from "./sanityCases";

/**
 * Calibration report over the REAL V1 question bank and adaptive flow (THI-8 revalidation of DEC-018).
 * Prints the sanity-case table and the exhaustive answer-path distribution used in docs/SCORING.md.
 * Skipped unless CALIBRATION_REPORT=1:
 *   CALIBRATION_REPORT=1 pnpm vitest run tests/engine/calibration.report.test.ts
 */
const enabled = process.env.CALIBRATION_REPORT === "1";
const short: Record<ProgramId, string> = { [CS]: "CS", [DS]: "DS", [MIS]: "MIS" };
const f = (value: number) => value.toFixed(3);
const pairKey = (a: ProgramId, b: ProgramId) => [a, b].sort().join("|");

describe.runIf(enabled)("calibration report (real question bank)", () => {
  it("prints the sanity-case table", () => {
    const rows = SANITY_CASES.map((sanity) => {
      const run = runFlow(sanity.programs, sanity.policy());
      const { result } = run;
      const ranking = result.ranking.map((p) => `${short[p.programId]} ${f(p.normalizedFit)}`).join(" > ");
      const path = run.answers
        .slice(3)
        .map((a) => `${a.questionId}:${a.answerId}`)
        .join(" ");
      const checks = result.realityChecks.map((check) => check.id).join(", ") || "—";
      return `| ${sanity.id} | ${run.questionsAsked} | ${path} | ${ranking} | ${result.fitClassification} | ${short[result.bestFitProgram ?? ""] ?? "null"} | ${result.nearTie} | ${run.stopReason} | ${checks} |`;
    });
    console.log(
      [
        "| case | n | branch path | ranking (normalized fit) | class | best | near tie | stop | reality checks |",
        ...rows,
      ].join("\n"),
    );
  });

  it("prints the exhaustive answer-path distribution", () => {
    const selections: Array<[string, ProgramId[]]> = [
      ["CS+DS+MIS", ALL_PILOT],
      ["CS+DS", [CS, DS]],
      ["CS+MIS", [CS, MIS]],
      ["DS+MIS", [DS, MIS]],
    ];
    for (const [label, programs] of selections) {
      const runs = enumerateRuns(programs);
      const pct = (n: number) => `${((100 * n) / runs.length).toFixed(1)}%`;
      const count = (predicate: (run: (typeof runs)[number]) => boolean) => pct(runs.filter(predicate).length);
      const cls = (c: string) => count((run) => run.result.fitClassification === c);
      console.log(
        [
          `${label}: paths=${runs.length}`,
          `strong ${cls("strong_fit")} good ${cls("good_fit")} consider ${cls("consider_carefully")} no_strong ${cls("no_strong_fit")}`,
          `n=5 ${count((r) => r.questionsAsked === 5)} n=6 ${count((r) => r.questionsAsked === 6)} n=7 ${count((r) => r.questionsAsked === 7)}`,
          `tie-breaker ${count((r) => r.tieBreakerUsed)} final near tie ${count((r) => r.result.nearTie)}`,
          `final pair≠branch ${count((r) => pairKey(...r.result.mainDecision) !== pairKey(...r.branch.programs))}`,
        ].join(" | "),
      );
    }
  });
});
