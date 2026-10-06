import { describe, expect, it } from "vitest";
import { nextComparisonStep } from "@/flow";
import { ACC, BA, BEH, COMM, COMMGMT, CS, DS, ECON, LAW, MIS, answer, askedId, play, route, script } from "./fixtures";

const H2H_BA_ECON = "h2h:business_administration|economics_and_management:0";
const H2H_BEH_COMMGMT = "h2h:behavioral_science|communication_and_management:0";
const H2H_CS_ECON = "h2h:computer_science|economics_and_management:0";

describe("1. focused Tech: Spotify only", () => {
  it("hands straight to the V1 precision module, which asks its own Q1 (the Spotify question) first", () => {
    const step = route(["spotify_discover_weekly"], []);
    expect(step.status).toBe("ask");
    if (step.status !== "ask" || step.mode !== "precision") throw new Error("expected precision");
    expect(step.moduleId).toBe("v1_tech");
    expect(step.question.id).toBe("Q1");
    expect(step.state.precision!.programIds).toEqual([CS, DS, MIS]);
    expect(step.state.precision!.carriedAnswers).toEqual([]);
    // Project selection scored nothing.
    expect(step.state.scoredAnswerCount).toBe(0);
    expect(Object.values(step.state.scores).every((points) => points === 0)).toBe(true);
  });
});

describe("2. Tech cross-cluster: Spotify + Wolt", () => {
  const spotifyWolt = script({
    T1: "A",
    B1: "B",
    [H2H_CS_ECON]: "A",
    Q2: "A",
    Q3: "5",
    "CSDS-1": "cs",
    "CSDS-2": "cs",
  });

  it("asks the Spotify opener once in generic mode, then hands off and V1 continues from Q2", () => {
    const { steps, final } = play(["wolt_new_city", "spotify_discover_weekly"], spotifyWolt);
    const asked = steps.map(askedId).filter(Boolean);
    expect(asked).toEqual(["T1", "B1", H2H_CS_ECON, "Q2", "Q3", "CSDS-1", "CSDS-2"]);
    // The Spotify decision is never shown twice: V1's Q1 is never asked after T1.
    expect(asked).not.toContain("Q1");

    const handoff = steps.find((step) => step.status === "ask" && step.mode === "precision")!;
    expect(handoff.state.precision!.carriedAnswers).toEqual([answer("Q1", "A")]);
    expect(handoff.state.precision!.programIds).toEqual([CS, DS, MIS]);
    expect(handoff.state.scores).toMatchObject({ [CS]: 7, [ECON]: 3 });

    expect(final.status).toBe("complete");
    if (final.status !== "complete" || final.outcome.kind !== "precision")
      throw new Error("expected precision outcome");
    expect(final.outcome.result.bestFitProgram).toBe(CS);
  });

  it("returns exactly the V1 result for the carried Q1 answer plus the module's own answers", () => {
    const { final } = play(["spotify_discover_weekly", "wolt_new_city"], spotifyWolt);
    if (final.status !== "complete" || final.outcome.kind !== "precision")
      throw new Error("expected precision outcome");
    const v1 = nextComparisonStep({
      selectedProgramIds: [CS, DS, MIS],
      answers: [
        answer("Q1", "A"),
        answer("Q2", "A"),
        answer("Q3", "5"),
        answer("CSDS-1", "cs"),
        answer("CSDS-2", "cs"),
      ],
    });
    expect(v1?.status === "complete" && v1.result).toEqual(final.outcome.result);
  });

  it("stays generic while the shortlist spans clusters", () => {
    const afterScenarios = route(["spotify_discover_weekly", "wolt_new_city"], [answer("T1", "A"), answer("B1", "B")]);
    expect(afterScenarios.status === "ask" && afterScenarios.mode).toBe("generic");
    expect(afterScenarios.state.shortlist).toEqual([CS, ECON]);
  });
});

describe("3. Business vs Economics (Wolt)", () => {
  const prefix = [answer("B1", "B"), answer("B2", "A"), answer("B3", "B")];

  it("does not treat 6 vs 3 after three answers as clear, and asks the separating focus question", () => {
    const step = route(["wolt_new_city"], prefix);
    expect(step.state.scores).toMatchObject({ [ECON]: 6, [BA]: 3, [ACC]: 0 });
    expect(step.state.support).toMatchObject({ [ECON]: 2, [BA]: 1 });
    expect(step.status === "ask" && step.mode === "generic" && step.reason).toBe("separates_leaders");
    expect(askedId(step)).toBe("B4");
  });

  it("recommends Economics once the evidence is clear", () => {
    const step = route(["wolt_new_city"], [...prefix, answer("B4", "B")]);
    expect(step).toMatchObject({
      status: "complete",
      outcome: { kind: "recommended", programId: ECON },
      completionReason: "clear_leader",
    });
  });

  it("stops at 5 scored answers with a near tie rather than forcing a winner", () => {
    const step = route(["wolt_new_city"], [...prefix, answer("B4", "A"), answer(H2H_BA_ECON, "B")]);
    expect(step.state.scores).toMatchObject({ [ECON]: 10, [BA]: 7 });
    expect(step).toMatchObject({
      status: "complete",
      outcome: { kind: "near_tie", programIds: [ECON, BA] },
      completionReason: "ceiling_near_tie",
    });
  });

  it("keeps a true tie a tie (shared rank, no hidden tie-break)", () => {
    const answers = [
      answer("B1", "B"),
      answer("B2", "A"),
      answer("B3", "neither"),
      answer("B4", "neither"),
      answer(H2H_BA_ECON, "neither"),
    ];
    const step = route(["wolt_new_city"], answers);
    // Weights 3/3/3/4/4 cannot reach an exact tie without first passing a clear-leader point, so neutral answers keep it open.
    expect(step.state.scores).toMatchObject({ [ECON]: 3, [BA]: 3 });
    expect(step.state.support).toMatchObject({ [ECON]: 1, [BA]: 1 });
    expect(step.state.ranking.slice(0, 2).map((r) => r.rank)).toEqual([1, 1]);
    expect(step.status === "complete" && step.outcome).toEqual({ kind: "near_tie", programIds: [BA, ECON] });
  });
});

describe("4. Cross-cluster: TikTok + Nike", () => {
  it("builds a generic head-to-head from work statements and recommends Communication & Management", () => {
    const { steps, final } = play(
      ["tiktok_endless_scroll", "nike_israel_launch"],
      script({ P1: "B", C1: "B", [H2H_BEH_COMMGMT]: "B" }),
    );
    expect(steps.map(askedId).filter(Boolean)).toEqual(["P1", "C1", H2H_BEH_COMMGMT]);
    const h2h = steps[2]!;
    if (h2h.status !== "ask" || h2h.mode !== "generic" || h2h.question.source !== "head_to_head") {
      throw new Error("expected a head-to-head");
    }
    expect(h2h.reason).toBe("head_to_head");
    expect(h2h.question.question.programIds).toEqual([BEH, COMMGMT]);
    expect(final).toMatchObject({ status: "complete", outcome: { kind: "recommended", programId: COMMGMT } });
    expect(final.state.support[COMMGMT]).toBe(2);
    expect(final.state.evidence.map((e) => e.source.type)).toEqual(["cluster", "cluster", "head_to_head"]);
  });

  it("needs no authored Behavioral Science vs Communication question", () => {
    const step = route(["tiktok_endless_scroll", "nike_israel_launch"], [answer("P1", "B"), answer("C1", "B")]);
    expect(askedId(step)).toBe(H2H_BEH_COMMGMT);
  });
});

describe("5. Multi-target answers", () => {
  it("gives the full weight and one support to each target", () => {
    const step = route(["ai_feature_privacy"], [answer("L1", "C")]);
    expect(step.state.scores).toMatchObject({ [COMM]: 3, [COMMGMT]: 3, [LAW]: 0 });
    expect(step.state.support).toMatchObject({ [COMM]: 1, [COMMGMT]: 1 });
    expect(step.state.evidence[0]).toMatchObject({ weightClass: "scenario", weight: 3, programIds: [COMM, COMMGMT] });
  });
});

describe("6. Adjacent programs surface only through expressed evidence", () => {
  it("does not rank an adjacent program merely because the cluster allows it", () => {
    const step = route(["ai_feature_privacy"], []);
    expect(step.state.rankableProgramIds).toEqual([LAW]);
    expect(step.state.ranking.map((r) => r.programId)).toEqual([LAW]);
  });

  it("makes it rankable after the candidate actually picks it", () => {
    const step = route(["ai_feature_privacy"], [answer("L1", "B")]);
    expect(step.state.surfacedProgramIds).toEqual([BA]);
    expect(step.state.rankableProgramIds).toEqual([LAW, BA]);
    expect(step.state.rankableProgramIds).not.toContain(MIS);
    expect(step.state.ranking[0]).toMatchObject({ programId: BA, score: 3, support: 1 });
  });
});

describe("7. Project order is never a ranking", () => {
  it("gives identical steps and outcomes whatever the click order", () => {
    const chooser = script({ P1: "B", C1: "B", [H2H_BEH_COMMGMT]: "B" });
    const a = play(["tiktok_endless_scroll", "nike_israel_launch"], chooser);
    const b = play(["nike_israel_launch", "tiktok_endless_scroll"], chooser);
    expect(b.steps).toEqual(a.steps);
  });

  it("does not resolve a score tie by pool position", () => {
    const step = route(["nike_israel_launch", "tiktok_endless_scroll"], [answer("P1", "B"), answer("C1", "B")]);
    expect(step.state.ranking.slice(0, 2).map((r) => [r.score, r.rank])).toEqual([
      [3, 1],
      [3, 1],
    ]);
    expect(step.status).toBe("ask");
  });
});

describe("8. Generic stop", () => {
  it("never declares a leader before 3 scored answers", () => {
    const step = route(["ai_feature_privacy"], [answer("L1", "A"), answer("L2", "A")]);
    expect(step.state.scores[LAW]).toBe(6);
    expect(step.status).toBe("ask");
    expect(askedId(step)).toBe("L3");
  });

  it("stops at 5 scored answers even when nothing is resolved", () => {
    const answers = [
      answer("B1", "B"),
      answer("B2", "A"),
      answer("B3", "neither"),
      answer("B4", "neither"),
      answer(H2H_BA_ECON, "neither"),
    ];
    const step = route(["wolt_new_city"], answers);
    expect(step.state.scoredAnswerCount).toBe(5);
    expect(step.status).toBe("complete");
  });
});

describe("9. Reality check", () => {
  const lawPath = [answer("L1", "A"), answer("L2", "A"), answer("L3", "A")];

  it("is asked after the ranking is resolved, for the resolved program's cluster", () => {
    const step = route(["ai_feature_privacy"], lawPath);
    expect(step.state.resolution).toEqual({ kind: "recommended", programId: LAW });
    expect(step.status === "ask" && step.mode === "generic" && step.reason).toBe("reality_check");
    expect(askedId(step)).toBe("L4");
  });

  it("is recorded as evidence and changes neither scores nor the leader", () => {
    const before = route(["ai_feature_privacy"], lawPath);
    const after = route(["ai_feature_privacy"], [...lawPath, answer("L4", "C")]);
    expect(after.state.scores).toEqual(before.state.scores);
    expect(after.state.realityEvidence).toEqual([
      { questionId: "L4", answerId: "C", clusterId: "law", realityLevel: "negative" },
    ]);
    expect(after).toMatchObject({ status: "complete", outcome: { kind: "recommended", programId: LAW } });
  });
});

describe("10. Insufficient positive evidence", () => {
  it("returns an explicit no-positive-evidence state instead of a fake recommendation", () => {
    const answers = [
      answer("B1", "B"),
      answer("B2", "neither"),
      answer("B3", "neither"),
      answer("B4", "neither"),
      answer("h2h:accounting|economics_and_management:0", "neither"),
    ];
    const step = route(["wolt_new_city"], answers);
    expect(step).toMatchObject({
      status: "complete",
      outcome: { kind: "insufficient_positive_evidence" },
      completionReason: "ceiling_insufficient_evidence",
    });
    expect(step.state.evidence.filter((e) => e.programIds.length === 0)).toHaveLength(4);
  });
});

describe("explicit content gaps", () => {
  it("reports needs_focus_content instead of guessing when no question can separate the leaders", () => {
    const step = route(["tiktok_endless_scroll", "nike_israel_launch"], [answer("P1", "B"), answer("C1", "B")], {
      statements: {},
    });
    expect(step).toMatchObject({ status: "needs_focus_content", programIds: [BEH, COMMGMT] });
  });
});

describe("replay validation and determinism", () => {
  it("rejects an answer to a question the flow did not ask, an unknown option, and answers past the end", () => {
    expect(() => route(["wolt_new_city"], [answer("B2", "A")])).toThrow(/asked "B1"/);
    expect(() => route(["wolt_new_city"], [answer("B1", "Z")])).toThrow(/not an option/);
    const done = [answer("B1", "B"), answer("B2", "B"), answer("B3", "B")];
    expect(route(["wolt_new_city"], done).status).toBe("complete");
    expect(() => route(["wolt_new_city"], [...done, answer("B4", "A")])).toThrow(/stopped after/);
  });

  it("rejects a non-module answer after handoff", () => {
    expect(() => route(["spotify_discover_weekly"], [answer("B1", "A")])).toThrow(/does not ask it/);
  });

  it("rejects an invalid project selection", () => {
    expect(() => route([], [])).toThrow(/none_selected/);
    expect(() => route(["wolt_new_city", "nike_israel_launch", "apple_store_space"], [])).toThrow(/too_many/);
  });

  it("gives the same step for the same projects, answers and data", () => {
    const answers = [answer("P1", "B"), answer("C1", "B")];
    expect(route(["tiktok_endless_scroll", "nike_israel_launch"], answers)).toEqual(
      route(["tiktok_endless_scroll", "nike_israel_launch"], answers),
    );
  });
});
