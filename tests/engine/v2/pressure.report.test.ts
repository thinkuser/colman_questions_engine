import { describe, expect, it } from "vitest";
import type { RecordedAnswer, V2Step } from "@/engine";
import { nextDiscoveryStep } from "@/flow";
import { answer, route } from "./fixtures";

/**
 * Pressure-test trace for the three personas used to approve the V2 architecture (THI-14). A developer / calibration
 * artifact, not candidate output: answer -> points/support -> shortlist -> next step -> outcome. The expected traces are
 * hand-derived from the accepted rules; they are sanity checks, not data the weights were tuned on.
 * Print the tables with CALIBRATION_REPORT=1. The same tables are in docs/V2_SCORING.md.
 */

const SHORT: Record<string, string> = {
  computer_science: "CS",
  data_science: "DS",
  management_information_systems: "MIS",
  business_administration: "BA",
  economics_and_management: "ECON",
  accounting: "ACC",
  behavioral_science: "BEH",
  communication_and_management: "COMMGMT",
};
const short = (id: string) => SHORT[id] ?? id;

function describeStep(step: V2Step): string {
  switch (step.status) {
    case "ask":
      return step.mode === "precision"
        ? `precision ${step.moduleId}: ask ${step.question.id}`
        : `ask ${step.question.question.id} (${step.reason})`;
    case "needs_focus_content":
      return `needs focus content (${step.programIds.map(short).join(" vs ")})`;
    case "complete": {
      const o = step.outcome;
      if (o.kind === "precision")
        return `complete: V1 ${short(o.result.bestFitProgram ?? "no fit")} (${o.result.fitClassification})`;
      if (o.kind === "recommended") return `complete: ${short(o.programId)} (${step.completionReason})`;
      if (o.kind === "near_tie")
        return `complete: near tie ${o.programIds.map(short).join("/")} (${step.completionReason})`;
      return `complete: ${o.kind}`;
    }
  }
}

function row(label: string, step: V2Step): string {
  const scored = step.state.ranking.filter((r) => r.score > 0);
  const points = scored.length ? scored.map((r) => `${short(r.programId)} ${r.score}/${r.support}`).join(", ") : "-";
  const list = step.state.shortlist.length ? step.state.shortlist.map(short).join(", ") : "-";
  return `${label} | ${points} | ${list} | ${describeStep(step)}`;
}

function trace(next: (answers: RecordedAnswer[]) => V2Step, projects: string, answers: RecordedAnswer[]): string[] {
  return answers.reduce(
    (rows, _a, index) => [
      ...rows,
      row(`${answers[index]!.questionId}=${answers[index]!.answerId}`, next(answers.slice(0, index + 1))),
    ],
    [row(`select ${projects}`, next([]))],
  );
}

const PERSONAS = {
  "A. Spotify (Tech)": trace(
    (answers) => nextDiscoveryStep({ selectedProjectIds: ["spotify_discover_weekly"], answers }),
    "Spotify",
    [answer("Q1", "A"), answer("Q2", "A"), answer("Q3", "5"), answer("CSDS-1", "cs"), answer("CSDS-2", "cs")],
  ),
  "B. Wolt (Business vs Economics)": trace((answers) => route(["wolt_new_city"], answers), "Wolt", [
    answer("B1", "B"),
    answer("B2", "A"),
    answer("B3", "B"),
    answer("B4", "A"),
    answer("focus:business_administration|economics_and_management:0", "B"),
  ]),
  "C. TikTok + Nike (Behavioral Science vs Communication & Management)": trace(
    (answers) => route(["tiktok_endless_scroll", "nike_israel_launch"], answers),
    "TikTok + Nike",
    [answer("P1", "B"), answer("C1", "B"), answer("focus:behavioral_science|communication_and_management:0", "B")],
  ),
};

describe("V2 pressure-test traces (answer -> points/support -> shortlist -> next step)", () => {
  it("A. Spotify only hands straight to V1 precision; no generic points", () => {
    expect(PERSONAS["A. Spotify (Tech)"]).toEqual([
      "select Spotify | - | - | precision v1_tech: ask Q1",
      "Q1=A | - | - | precision v1_tech: ask Q2",
      "Q2=A | - | - | precision v1_tech: ask Q3",
      "Q3=5 | - | - | precision v1_tech: ask CSDS-1",
      "CSDS-1=cs | - | - | precision v1_tech: ask CSDS-2",
      "CSDS-2=cs | - | - | complete: V1 CS (strong_fit)",
    ]);
  });

  it("B. Wolt: 6 vs 3 is not clear; the ceiling returns a near tie instead of forcing a winner", () => {
    expect(PERSONAS["B. Wolt (Business vs Economics)"]).toEqual([
      "select Wolt | - | - | ask B1 (project_scenario)",
      "B1=B | ECON 3/1 | ECON | ask B2 (separates_leaders)",
      "B2=A | BA 3/1, ECON 3/1 | BA, ECON | ask B3 (separates_leaders)",
      "B3=B | ECON 6/2, BA 3/1 | ECON, BA | ask B4 (separates_leaders)",
      "B4=A | BA 7/2, ECON 6/2 | BA, ECON | ask focus:business_administration|economics_and_management:0 (generic_focus)",
      "focus:business_administration|economics_and_management:0=B | ECON 10/3, BA 7/2 | ECON, BA | complete: near tie ECON/BA (ceiling_near_tie)",
    ]);
  });

  it("C. TikTok + Nike: a generic focus question decides, with no authored pair", () => {
    expect(PERSONAS["C. TikTok + Nike (Behavioral Science vs Communication & Management)"]).toEqual([
      "select TikTok + Nike | - | - | ask P1 (project_scenario)",
      "P1=B | BEH 3/1 | BEH | ask C1 (project_scenario)",
      "C1=B | BEH 3/1, COMMGMT 3/1 | BEH, COMMGMT | ask focus:behavioral_science|communication_and_management:0 (generic_focus)",
      "focus:behavioral_science|communication_and_management:0=B | COMMGMT 7/2, BEH 3/1 | COMMGMT | complete: COMMGMT (clear_leader)",
    ]);
  });

  it.runIf(process.env.CALIBRATION_REPORT === "1")("prints the traces", () => {
    for (const [name, rows] of Object.entries(PERSONAS)) {
      console.log(`\n### ${name}\n| Answer | Points / support | Shortlist | Next step |\n|---|---|---|---|`);
      for (const line of rows) console.log(`| ${line} |`);
    }
  });
});
