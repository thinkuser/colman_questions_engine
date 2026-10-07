import { describe, expect, it } from "vitest";
import { nextComparisonStep } from "@/flow";
import {
  ACC,
  BA,
  BEH,
  COMM,
  COMMGMT,
  CS,
  DS,
  ECON,
  FIXTURE_CLUSTERS,
  FIXTURE_CLUSTERS_WITH_BA_REALITY,
  LAW,
  MIS,
  answer,
  askedId,
  neither,
  option,
  play,
  question,
  realityCheck,
  route,
  script,
  withClusterQuestions,
  withQuestions,
} from "./fixtures";

const FOCUS_BA_ECON = "focus:business_administration|economics_and_management:0";
const FOCUS_BEH_COMMGMT = "focus:behavioral_science|communication_and_management:0";
const FOCUS_CS_ECON = "focus:computer_science|economics_and_management:0";
const FOCUS_ACC_BA_ECON = "focus:accounting|business_administration|economics_and_management:0";

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
    [FOCUS_CS_ECON]: "A",
    Q2: "A",
    Q3: "5",
    "CSDS-1": "cs",
    "CSDS-2": "cs",
  });

  it("asks the Spotify opener once in generic mode, then hands off and V1 continues from Q2", () => {
    const { steps, final } = play(["wolt_new_city", "spotify_discover_weekly"], spotifyWolt);
    const asked = steps.map(askedId).filter(Boolean);
    expect(asked).toEqual(["T1", "B1", FOCUS_CS_ECON, "Q2", "Q3", "CSDS-1", "CSDS-2"]);
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
    const step = route(["wolt_new_city"], [...prefix, answer("B4", "A"), answer(FOCUS_BA_ECON, "B")]);
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
      answer(FOCUS_BA_ECON, "neither"),
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
  it("builds a generic focus question from work statements and recommends Communication & Management", () => {
    const { steps, final } = play(
      ["tiktok_endless_scroll", "nike_israel_launch"],
      script({ P1: "B", C1: "B", [FOCUS_BEH_COMMGMT]: "B" }),
    );
    expect(steps.map(askedId).filter(Boolean)).toEqual(["P1", "C1", FOCUS_BEH_COMMGMT]);
    const focus = steps[2]!;
    if (focus.status !== "ask" || focus.mode !== "generic" || focus.question.source !== "generic_focus") {
      throw new Error("expected a generic focus question");
    }
    expect(focus.reason).toBe("generic_focus");
    expect(focus.question.question.programIds).toEqual([BEH, COMMGMT]);
    expect(final).toMatchObject({ status: "complete", outcome: { kind: "recommended", programId: COMMGMT } });
    expect(final.state.support[COMMGMT]).toBe(2);
    expect(final.state.evidence.map((e) => e.source.type)).toEqual(["cluster", "cluster", "generic_focus"]);
  });

  it("needs no authored Behavioral Science vs Communication question", () => {
    const step = route(["tiktok_endless_scroll", "nike_israel_launch"], [answer("P1", "B"), answer("C1", "B")]);
    expect(askedId(step)).toBe(FOCUS_BEH_COMMGMT);
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
    const chooser = script({ P1: "B", C1: "B", [FOCUS_BEH_COMMGMT]: "B" });
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
      answer(FOCUS_BA_ECON, "neither"),
    ];
    const step = route(["wolt_new_city"], answers);
    expect(step.state.scoredAnswerCount).toBe(5);
    expect(step.status).toBe("complete");
  });
});

describe("9. Reality check", () => {
  const lawPath = [answer("L1", "A"), answer("L2", "A"), answer("L3", "A")];

  it("is asked after the ranking is resolved, for the resolved program (explicit applicability)", () => {
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
      { questionId: "L4", answerId: "C", clusterId: "law", forProgramIds: [LAW], realityLevel: "negative" },
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
      answer(FOCUS_ACC_BA_ECON, "neither"),
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

/**
 * Review fix 1: focus questions compare the whole unresolved leading set. Program ids may order the options on screen;
 * they never decide which equally ranked contender is left out.
 */
describe("unresolved leading set: 2-way, 3-way and more than 3", () => {
  // Synthetic business cluster without an authored focus question, so the generated focus question is reachable.
  // B1 D and B3 D are multi-target answers (full weight and one support to each target).
  const businessOptions = () => [option("A", [BA]), option("B", [ECON]), option("C", [ACC])];
  const clusters = withClusterQuestions(FIXTURE_CLUSTERS, "business", [
    question("B1", 1, "scenario", [...businessOptions(), option("D", [BA, ECON, ACC])], ["wolt_new_city"]),
    question("B2", 2, "scenario", [...businessOptions(), neither]),
    question("B3", 3, "scenario", [...businessOptions(), option("D", [BA, ACC]), neither]),
  ]);
  const threeTied = [answer("B1", "A"), answer("B2", "B"), answer("B3", "C")];
  const FOCUS_ACC_BA_ECON_2 = "focus:accounting|business_administration|economics_and_management:1";

  it("asks a 3-way generic focus question when three programs share the top rank", () => {
    const step = route(["wolt_new_city"], threeTied, { clusters });
    expect(step.state.ranking.map((r) => [r.programId, r.score, r.rank])).toEqual([
      [ACC, 3, 1],
      [BA, 3, 1],
      [ECON, 3, 1],
    ]);
    if (step.status !== "ask" || step.mode !== "generic" || step.question.source !== "generic_focus") {
      throw new Error("expected a generic focus question");
    }
    expect(step.reason).toBe("generic_focus");
    expect(step.question.question.id).toBe(FOCUS_ACC_BA_ECON);
    expect(step.question.question.programIds).toEqual([ACC, BA, ECON]);
    expect(step.question.question.options).toEqual([
      { id: "A", programIds: [ACC], realityLevel: null },
      { id: "B", programIds: [BA], realityLevel: null },
      { id: "C", programIds: [ECON], realityLevel: null },
      { id: "neither", programIds: [], realityLevel: null },
    ]);
  });

  it("compares a unique leader with BOTH tied runners, never just the runner with the lower id", () => {
    const step = route(["wolt_new_city"], [answer("B1", "B"), answer("B2", "B"), answer("B3", "D")], { clusters });
    expect(step.state.ranking.map((r) => [r.programId, r.score, r.support, r.rank])).toEqual([
      [ECON, 6, 2, 1],
      [ACC, 3, 1, 2],
      [BA, 3, 1, 2],
    ]);
    expect(step.state.resolution).toBeNull();
    expect(askedId(step)).toBe(FOCUS_ACC_BA_ECON);
  });

  it("returns needs_focus_content for four equally unresolved programs instead of dropping one by id", () => {
    const step = route(["wolt_new_city", "nike_israel_launch"], [answer("B1", "D"), answer("C1", "B")], { clusters });
    expect(step.state.ranking.filter((r) => r.rank === 1).map((r) => r.programId)).toEqual([ACC, BA, COMMGMT, ECON]);
    expect(step).toMatchObject({ status: "needs_focus_content", programIds: [ACC, BA, COMMGMT, ECON] });
  });

  it("counts a neutral 3-way answer toward the ceiling without scoring anyone", () => {
    const tied = route(["wolt_new_city"], threeTied, { clusters });
    const after = route(["wolt_new_city"], [...threeTied, answer(FOCUS_ACC_BA_ECON, "neither")], { clusters });
    expect(after.state.scoredAnswerCount).toBe(4);
    expect(after.state.scores).toEqual(tied.state.scores);
    expect(after.state.support).toEqual(tied.state.support);
    expect(after.state.evidence.at(-1)).toMatchObject({ questionId: FOCUS_ACC_BA_ECON, programIds: [] });
    // The next statement for the same three programs is offered; the fifth answer hits the ceiling.
    expect(askedId(after)).toBe(FOCUS_ACC_BA_ECON_2);
    const ceiling = route(
      ["wolt_new_city"],
      [...threeTied, answer(FOCUS_ACC_BA_ECON, "neither"), answer(FOCUS_ACC_BA_ECON_2, "neither")],
      { clusters },
    );
    expect(ceiling.state.scoredAnswerCount).toBe(5);
    expect(ceiling.state.scores).toEqual(tied.state.scores);
    expect(ceiling.status).toBe("complete");
  });

  it("gives +4 and one support only to the program chosen in a 3-way answer", () => {
    const step = route(["wolt_new_city"], [...threeTied, answer(FOCUS_ACC_BA_ECON, "B")], { clusters });
    expect(step.state.scores).toMatchObject({ [BA]: 7, [ACC]: 3, [ECON]: 3 });
    expect(step.state.support).toMatchObject({ [BA]: 2, [ACC]: 1, [ECON]: 1 });
    expect(step.state.evidence.at(-1)).toMatchObject({
      questionId: FOCUS_ACC_BA_ECON,
      answerId: "B",
      weightClass: "focus",
      weight: 4,
      programIds: [BA],
      source: { type: "generic_focus", programIds: [ACC, BA, ECON] },
    });
  });

  it("is unaffected by project click order", () => {
    const chooser = script({ B1: "D", C1: "B" });
    const a = play(["wolt_new_city", "nike_israel_launch"], chooser, { clusters });
    const b = play(["nike_israel_launch", "wolt_new_city"], chooser, { clusters });
    expect(b.steps).toEqual(a.steps);
    expect(a.final.status).toBe("needs_focus_content");
  });
});

/**
 * Review fix 2: reality checks apply by explicit `realityForProgramIds`, searched across all clusters, so an adjacent
 * program that wins inside another cluster still gets its check. Synthetic checks only; no production content.
 */
describe("reality-check applicability", () => {
  const baWins = [answer("L1", "B"), answer("L2", "B"), answer("L3", "B")];

  it("asks the Business Administration check when adjacent BA wins inside the Law cluster", () => {
    const step = route(["ai_feature_privacy"], baWins, { clusters: FIXTURE_CLUSTERS_WITH_BA_REALITY });
    expect(step.state.resolution).toEqual({ kind: "recommended", programId: BA });
    if (step.status !== "ask" || step.mode !== "generic" || step.question.source !== "cluster") {
      throw new Error("expected a cluster reality check");
    }
    expect(step.reason).toBe("reality_check");
    expect(step.question.question.id).toBe("B5");
    expect(step.question.clusterId).toBe("business");

    const done = route(["ai_feature_privacy"], [...baWins, answer("B5", "A")], {
      clusters: FIXTURE_CLUSTERS_WITH_BA_REALITY,
    });
    expect(done).toMatchObject({ status: "complete", outcome: { kind: "recommended", programId: BA } });
    expect(done.state.realityEvidence).toEqual([
      { questionId: "B5", answerId: "A", clusterId: "business", forProgramIds: [BA], realityLevel: "positive" },
    ]);
    expect(done.state.askedQuestionIds).not.toContain("L4");
  });

  it("completes cleanly when the adjacent winner has no applicable check (the Law check is not borrowed)", () => {
    const step = route(["ai_feature_privacy"], baWins);
    expect(step).toMatchObject({ status: "complete", outcome: { kind: "recommended", programId: BA } });
    expect(step.state.realityEvidence).toEqual([]);
    expect(step.state.askedQuestionIds).not.toContain("L4");
  });

  it("scores reality checks at 0 points: scores, support, ranking and count are unchanged", () => {
    const resolved = route(["ai_feature_privacy"], baWins, { clusters: FIXTURE_CLUSTERS_WITH_BA_REALITY });
    const after = route(["ai_feature_privacy"], [...baWins, answer("B5", "C")], {
      clusters: FIXTURE_CLUSTERS_WITH_BA_REALITY,
    });
    expect(after.state.scores).toEqual(resolved.state.scores);
    expect(after.state.support).toEqual(resolved.state.support);
    expect(after.state.ranking).toEqual(resolved.state.ranking);
    expect(after.state.scoredAnswerCount).toBe(resolved.state.scoredAnswerCount);
    expect(after.state.realityEvidence[0]!.realityLevel).toBe("negative");
  });

  it("records a check for each program of a near tie without changing the ranking", () => {
    const clusters = withQuestions(FIXTURE_CLUSTERS_WITH_BA_REALITY, "business", realityCheck("B6", 6, [ECON]));
    const nearTie = [
      answer("B1", "B"),
      answer("B2", "A"),
      answer("B3", "B"),
      answer("B4", "A"),
      answer(FOCUS_BA_ECON, "B"),
    ];
    const resolved = route(["wolt_new_city"], nearTie, { clusters });
    expect(resolved.state.resolution).toEqual({ kind: "near_tie", programIds: [ECON, BA] });
    // The near tie's ranked order decides which check comes first: ECON's, then BA's.
    expect(askedId(resolved)).toBe("B6");
    const second = route(["wolt_new_city"], [...nearTie, answer("B6", "B")], { clusters });
    expect(askedId(second)).toBe("B5");
    const done = route(["wolt_new_city"], [...nearTie, answer("B6", "B"), answer("B5", "C")], { clusters });
    expect(done).toMatchObject({
      status: "complete",
      outcome: { kind: "near_tie", programIds: [ECON, BA] },
      completionReason: "ceiling_near_tie",
    });
    expect(done.state.ranking).toEqual(resolved.state.ranking);
    expect(done.state.realityEvidence.map((r) => [r.questionId, r.forProgramIds])).toEqual([
      ["B6", [ECON]],
      ["B5", [BA]],
    ]);
  });

  it("is decided by explicit applicability, not by cluster membership, cluster order or question position", () => {
    // L5 sits in the Law cluster but is about BA; L4 comes first in that cluster but is about Law.
    const lawCluster = withQuestions(FIXTURE_CLUSTERS, "law", realityCheck("L5", 5, [BA]));
    expect(askedId(route(["ai_feature_privacy"], baWins, { clusters: lawCluster }))).toBe("L5");
    const lawWins = [answer("L1", "A"), answer("L2", "A"), answer("L3", "A")];
    expect(askedId(route(["ai_feature_privacy"], lawWins, { clusters: lawCluster }))).toBe("L4");

    // Reversing the cluster list changes nothing.
    const reversed = [...FIXTURE_CLUSTERS_WITH_BA_REALITY].reverse();
    expect(route(["ai_feature_privacy"], baWins, { clusters: reversed })).toEqual(
      route(["ai_feature_privacy"], baWins, { clusters: FIXTURE_CLUSTERS_WITH_BA_REALITY }),
    );

    // Two checks apply to BA: only one is asked, the lowest id among the applicable ones.
    const both = withQuestions(FIXTURE_CLUSTERS_WITH_BA_REALITY, "law", realityCheck("L5", 5, [BA]));
    expect(askedId(route(["ai_feature_privacy"], baWins, { clusters: both }))).toBe("B5");
    expect(route(["ai_feature_privacy"], [...baWins, answer("B5", "B")], { clusters: both }).status).toBe("complete");
  });
});
