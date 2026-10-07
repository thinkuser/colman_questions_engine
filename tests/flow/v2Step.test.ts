import { describe, expect, it } from "vitest";
import { getV2Cluster, PROGRAM_IDS } from "@/data";
import type { RecordedAnswer, V2Step } from "@/engine";
import { nextDiscoveryStep, V1_TECH_PRECISION_MODULE } from "@/flow";
import { ALL_PILOT, runFlow } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";

/** V2 routing on the real production data (tech cluster + V1 module; non-tech content is THI-15). */

function playSpotifyOnly(policy: (question: Extract<V2Step, { mode: "precision" }>["question"]) => string) {
  const answers: RecordedAnswer[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const step = nextDiscoveryStep({ selectedProjectIds: ["spotify_discover_weekly"], answers });
    if (step.status === "complete") return { step, answers };
    if (step.status !== "ask" || step.mode !== "precision") throw new Error(`unexpected step ${step.status}`);
    answers.push({ questionId: step.question.id, answerId: policy(step.question) });
  }
  throw new Error("did not terminate");
}

describe("V1 tech precision module", () => {
  it("covers exactly the V1 pilot programs and the tech cluster", () => {
    expect(V1_TECH_PRECISION_MODULE.programIds).toEqual(PROGRAM_IDS);
    expect([...getV2Cluster("tech")!.programIds].sort()).toEqual([...PROGRAM_IDS].sort());
    expect(V1_TECH_PRECISION_MODULE.ownsQuestion("Q1")).toBe(true);
    expect(V1_TECH_PRECISION_MODULE.ownsQuestion("T1")).toBe(false);
  });
});

describe("Spotify only = the unchanged V1 experience (regression)", () => {
  const threeProgramCases = SANITY_CASES.filter((c) => c.programs.length === 3);

  it("covers the three-program sanity cases", () => {
    expect(threeProgramCases.length).toBeGreaterThanOrEqual(8);
    for (const c of threeProgramCases) expect(c.programs).toEqual(ALL_PILOT);
  });

  it.each(threeProgramCases.map((c) => c.id))("%s: same questions and identical V1 result", (id) => {
    const sanity = SANITY_CASES.find((c) => c.id === id)!;
    const v1 = runFlow(ALL_PILOT, sanity.policy());
    const v2 = playSpotifyOnly(sanity.policy());
    expect(v2.answers.map((a) => a.questionId)).toEqual(v1.asked);
    if (v2.step.status !== "complete" || v2.step.outcome.kind !== "precision") throw new Error("expected precision");
    expect(v2.step.outcome.result).toEqual(v1.result);
    expect(v2.step.outcome.stopReason).toBe(v1.stopReason);
    expect(v2.step.outcome.questionsAsked).toBe(v1.questionsAsked);
    // No generic scoring happened in front of V1.
    expect(v2.step.state.scoredAnswerCount).toBe(0);
  });
});

describe("Spotify + another project on production data", () => {
  it("asks the Spotify opener (T1, V1 Q1's copy) once and V1 continues at Q2 with Q1 carried in", () => {
    const first = nextDiscoveryStep({ selectedProjectIds: ["wolt_new_city", "spotify_discover_weekly"], answers: [] });
    expect(first.status === "ask" && first.mode === "generic" && first.question.question.id).toBe("T1");

    // Wolt has no question content yet (THI-15), so the only evidence is tech: the shortlist is tech-only.
    const next = nextDiscoveryStep({
      selectedProjectIds: ["wolt_new_city", "spotify_discover_weekly"],
      answers: [{ questionId: "T1", answerId: "B" }],
    });
    if (next.status !== "ask" || next.mode !== "precision") throw new Error("expected handoff");
    expect(next.question.id).toBe("Q2");
    expect(next.questionNumber).toBe(2);
    expect(next.state.precision!.carriedAnswers).toEqual([{ questionId: "Q1", answerId: "B" }]);
  });
});

describe("non-tech projects before THI-15 content", () => {
  it("reports needs_focus_content explicitly rather than guessing", () => {
    const step = nextDiscoveryStep({ selectedProjectIds: ["wolt_new_city"], answers: [] });
    expect(step.status).toBe("needs_focus_content");
    expect(step.state.scoredAnswerCount).toBe(0);
  });
});
