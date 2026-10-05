import { describe, it } from "vitest";
import { computeFit, type AnsweredQuestion, type ProgramId } from "@/engine";
import {
  ALL_PILOT,
  answer,
  fitInput,
  Q1_PROJECT_CHOICE,
  Q2_DESIRED_OUTCOME,
  Q3_MATH_TOLERANCE,
  SYN_CSDS_1,
  SYN_CSDS_2,
  SYN_CSDS_3,
  SYN_CSMIS_1,
  SYN_CSMIS_2,
  SYN_DSMIS_1,
  SYN_DSMIS_2,
} from "./fixtures";
import { SANITY_CASES } from "./sanityCases";

/**
 * Calibration report — prints the sanity-case table and the exhaustive answer-space distribution used in
 * docs/SCORING.md. Skipped unless CALIBRATION_REPORT=1:
 *   CALIBRATION_REPORT=1 pnpm vitest run tests/engine/calibration.report.test.ts
 */
const enabled = process.env.CALIBRATION_REPORT === "1";
const short: Record<ProgramId, string> = {
  computer_science: "CS",
  data_science: "DS",
  management_information_systems: "MIS",
};
const f = (value: number) => value.toFixed(3);

describe.runIf(enabled)("calibration report", () => {
  it("prints the sanity-case table", () => {
    const rows = SANITY_CASES.map((sanity) => {
      const result = computeFit(fitInput(sanity.answers, sanity.programs));
      const ranking = result.ranking.map((p) => `${short[p.programId]} ${f(p.normalizedFit)}`).join(" > ");
      const checks = result.realityChecks.map((check) => check.id).join(", ") || "—";
      return `| ${sanity.id} | ${ranking} | ${result.fitClassification} | ${short[result.bestFitProgram ?? ""] ?? "null"} | ${result.nearTie} | ${checks} |`;
    });
    console.log(["| case | ranking (normalized fit) | class | best | near tie | reality checks |", ...rows].join("\n"));
  });

  it("prints the exhaustive answer-space distribution per pair flow", () => {
    const flows: Array<{ name: string; programs: ProgramId[]; pair: (typeof SYN_CSDS_1)[] }> = [
      { name: "CS vs DS (all 3 selected)", programs: ALL_PILOT, pair: [SYN_CSDS_1, SYN_CSDS_2, SYN_CSDS_3] },
      { name: "CS vs MIS (all 3 selected)", programs: ALL_PILOT, pair: [SYN_CSMIS_1, SYN_CSMIS_2] },
      { name: "DS vs MIS (all 3 selected)", programs: ALL_PILOT, pair: [SYN_DSMIS_1, SYN_DSMIS_2] },
    ];
    for (const [flow, includeNeither] of flows.flatMap(
      (flow) =>
        [
          [flow, true],
          [flow, false],
        ] as const,
    )) {
      const opening = [Q1_PROJECT_CHOICE, Q2_DESIRED_OUTCOME, Q3_MATH_TOLERANCE];
      const questions = [...opening, ...flow.pair];
      const combos: AnsweredQuestion[][] = questions.reduce<AnsweredQuestion[][]>(
        (acc, question) =>
          acc.flatMap((prefix) =>
            question.options
              .filter((option) => includeNeither || option.id !== "neither")
              .map((option) => [...prefix, answer(question, option.id)]),
          ),
        [[]],
      );
      const counts: Record<string, number> = { strong_fit: 0, good_fit: 0, consider_carefully: 0, no_strong_fit: 0 };
      let nearTies = 0;
      const tops: number[] = [];
      for (const combo of combos) {
        const result = computeFit(fitInput(combo, flow.programs));
        counts[result.fitClassification]! += 1;
        if (result.nearTie) nearTies += 1;
        tops.push(result.ranking[0]!.normalizedFit);
      }
      tops.sort((a, b) => a - b);
      const pct = (n: number) => `${((100 * n) / combos.length).toFixed(1)}%`;
      const q = (p: number) => f(tops[Math.floor(p * (tops.length - 1))]!);
      console.log(
        `${flow.name}${includeNeither ? "" : ", no 'neither'"}: n=${combos.length} | strong ${pct(counts.strong_fit!)} | good ${pct(counts.good_fit!)} | consider ${pct(
          counts.consider_carefully!,
        )} | no_strong ${pct(counts.no_strong_fit!)} | near-tie ${pct(nearTies)} | top-fit p10/p50/p90 ${q(0.1)}/${q(0.5)}/${q(0.9)}`,
      );
    }
  });
});
