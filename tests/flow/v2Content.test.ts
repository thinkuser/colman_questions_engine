import { describe, expect, it } from "vitest";
import { CAREER_PROJECTS, V2_PROGRAM_IDS } from "@/data";
import { buildGenericFocus, type RecordedAnswer, type V2Step } from "@/engine";
import { nextDiscoveryStep, V2_WORK_STATEMENTS } from "@/flow";

/**
 * THI-15 routing on the REAL production content: project openers, adjacent surfacing, lone-leader completeness, generated
 * focus from the real work statements, and an exhaustive walk of every answer path for every non-tech selection.
 */

const SPOTIFY = "spotify_discover_weekly";
const NON_TECH = CAREER_PROJECTS.map((project) => project.id).filter((id) => id !== SPOTIFY);

const step = (selectedProjectIds: string[], answers: RecordedAnswer[] = []): V2Step =>
  nextDiscoveryStep({ selectedProjectIds, answers });
const ans = (questionId: string, answerId: string): RecordedAnswer => ({ questionId, answerId });
const askedId = (s: V2Step) =>
  s.status !== "ask" ? null : s.mode === "precision" ? s.question.id : s.question.question.id;
const reasonOf = (s: V2Step) => (s.status === "ask" && s.mode === "generic" ? s.reason : null);

describe("project openers", () => {
  it.each([
    ["wolt_new_city", "B1"],
    ["tiktok_endless_scroll", "P1"],
    ["duolingo_persistence", "P2"],
    ["nike_israel_launch", "C1"],
    ["ai_feature_privacy", "L1"],
    ["apple_store_space", "D1"],
  ])("%s opens with %s and scores nothing yet", (projectId, opener) => {
    const first = step([projectId]);
    expect(askedId(first)).toBe(opener);
    expect(reasonOf(first)).toBe("project_scenario");
    expect(first.state.scoredAnswerCount).toBe(0);
  });

  it("asks both openers in project display order, whatever the click order", () => {
    expect(askedId(step(["nike_israel_launch", "wolt_new_city"]))).toBe("B1");
    expect(askedId(step(["wolt_new_city", "nike_israel_launch"]))).toBe("B1");
    expect(askedId(step(["wolt_new_city", "nike_israel_launch"], [ans("B1", "A")]))).toBe("C1");
  });
});

describe("adjacent programs surface only through selected answers", () => {
  it("Law: Business, Communication and MIS are not rankable until an answer points to them", () => {
    const start = step(["ai_feature_privacy"]);
    expect(start.state.rankableProgramIds).toEqual(["law"]);
    expect(step(["ai_feature_privacy"], [ans("L1", "A")]).state.surfacedProgramIds).toEqual([]);
    expect(step(["ai_feature_privacy"], [ans("L1", "B")]).state.surfacedProgramIds).toEqual([
      "business_administration",
    ]);
    expect(step(["ai_feature_privacy"], [ans("L1", "C")]).state.surfacedProgramIds).toEqual([
      "communication",
      "communication_and_management",
    ]);
    const mis = step(["ai_feature_privacy"], [ans("L1", "A"), ans("L2", "C")]);
    expect(mis.state.surfacedProgramIds).toEqual(["management_information_systems"]);
  });

  it("Interior Design: Communication, Business and Behavioral Science surface only when chosen", () => {
    expect(step(["apple_store_space"]).state.rankableProgramIds).toEqual(["interior_design"]);
    expect(step(["apple_store_space"], [ans("D1", "A")]).state.surfacedProgramIds).toEqual([]);
    expect(step(["apple_store_space"], [ans("D1", "B")]).state.surfacedProgramIds).toEqual(["communication"]);
    expect(step(["apple_store_space"], [ans("D1", "A"), ans("D2", "C")]).state.surfacedProgramIds).toEqual([
      "behavioral_science",
    ]);
  });
});

describe("lone-leader completeness (one supported program, the rest untested)", () => {
  /** For each project: an opener answer that supports exactly one program, and the answer id supporting it later. */
  const LONE = [
    { projectId: "wolt_new_city", opener: "B1", pick: "A", leader: "business_administration" },
    { projectId: "wolt_new_city", opener: "B1", pick: "B", leader: "economics_and_management" },
    { projectId: "wolt_new_city", opener: "B1", pick: "C", leader: "accounting" },
    { projectId: "tiktok_endless_scroll", opener: "P1", pick: "A", leader: "psychology" },
    { projectId: "duolingo_persistence", opener: "P2", pick: "B", leader: "education" },
    { projectId: "nike_israel_launch", opener: "C1", pick: "B", leader: "communication_and_management" },
    { projectId: "ai_feature_privacy", opener: "L1", pick: "A", leader: "law" },
    { projectId: "ai_feature_privacy", opener: "L1", pick: "B", leader: "business_administration" },
    { projectId: "apple_store_space", opener: "D1", pick: "A", leader: "interior_design" },
    { projectId: "apple_store_space", opener: "D1", pick: "C", leader: "business_administration" },
  ];

  it.each(LONE.map((c) => [`${c.projectId} ${c.opener}=${c.pick}`, c] as const))(
    "%s: keeps testing the lone leader with an authored question, never a content gap",
    (_label, c) => {
      const next = step([c.projectId], [ans(c.opener, c.pick)]);
      expect(next.state.shortlist).toEqual([c.leader]);
      expect(next.status).toBe("ask");
      expect(reasonOf(next)).toBe("separates_leaders");
      // The authored question offers the leader and at least one alternative.
      const question = next.status === "ask" && next.mode === "generic" ? next.question.question : null;
      const withLeader = question!.options.filter((o) => o.programIds.includes(c.leader));
      const withOther = question!.options.filter((o) => o.programIds.some((p) => p !== c.leader));
      expect(withLeader.length).toBeGreaterThan(0);
      expect(withOther.length).toBeGreaterThan(0);
    },
  );

  it("keeps challenging a lone leader all the way: Apple Store, Business Administration twice, then a third test", () => {
    const afterTwo = step(["apple_store_space"], [ans("D1", "C"), ans("D3", "C")]);
    // D2 has no Business option; the extra authored question D5 tests Business against Interior Design / Communication.
    expect(askedId(afterTwo)).toBe("D5");
    const done = step(["apple_store_space"], [ans("D1", "C"), ans("D3", "C"), ans("D5", "C")]);
    expect(done).toMatchObject({
      status: "complete",
      outcome: { kind: "recommended", programId: "business_administration" },
      completionReason: "clear_leader",
    });
  });

  it("Law: a Communication + Communication & Management tie is tested by an authored question (L5), not a gap", () => {
    const afterL1 = step(["ai_feature_privacy"], [ans("L1", "C")]);
    expect(afterL1.state.shortlist).toEqual(["communication", "communication_and_management"]);
    expect(askedId(afterL1)).toBe("L5");
    expect(reasonOf(afterL1)).toBe("separates_leaders");
  });

  it("always choosing the leader's option recommends it after three answers, in every cluster", () => {
    const FIRST: Record<string, string[]> = {
      wolt_new_city: ["B1", "B2", "B3"],
      nike_israel_launch: ["C1", "C2", "C3"],
      apple_store_space: ["D1", "D2", "D3"],
      ai_feature_privacy: ["L1", "L2", "L3"],
    };
    for (const [projectId, ids] of Object.entries(FIRST)) {
      const answers = ids.map((id) => ans(id, "A"));
      const done = step([projectId], answers);
      // Resolved after three scored answers (Interior Design then asks its reality check, which scores nothing).
      expect(done.state.resolution, projectId).toMatchObject({ kind: "recommended" });
      expect(done.state.scoredAnswerCount, projectId).toBe(3);
    }
    const people = step(["tiktok_endless_scroll"], [ans("P1", "A"), ans("P3", "A"), ans("P4", "A")]);
    expect(people.state.resolution).toEqual({ kind: "recommended", programId: "psychology" });
  });
});

describe("generated focus on the real work statements", () => {
  it("builds a 2-way question for every pair of the 14 programs and a 3-way for every triple, at three indexes", () => {
    const ids = [...V2_PROGRAM_IDS];
    let pairs = 0;
    let triples = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs++;
        const asked: string[] = [];
        for (let index = 0; index < 3; index++) {
          const q = buildGenericFocus([ids[j]!, ids[i]!], asked, V2_WORK_STATEMENTS);
          expect(q, `${ids[i]}|${ids[j]}:${index}`).not.toBeNull();
          asked.push(q!.id);
        }
        for (let k = j + 1; k < ids.length; k++) {
          triples++;
          expect(buildGenericFocus([ids[i]!, ids[j]!, ids[k]!], [], V2_WORK_STATEMENTS)).not.toBeNull();
        }
      }
    }
    expect([pairs, triples]).toEqual([91, 364]);
  });

  it("Behavioral Science vs Communication & Management (TikTok + Nike) is a generated question", () => {
    const next = step(["tiktok_endless_scroll", "nike_israel_launch"], [ans("P1", "B"), ans("C1", "B")]);
    expect(askedId(next)).toBe("focus:behavioral_science|communication_and_management:0");
    expect(reasonOf(next)).toBe("generic_focus");
    if (next.status !== "ask" || next.mode !== "generic" || next.question.source !== "generic_focus") {
      throw new Error("expected a generated focus question");
    }
    expect(next.question.question.options.map((o) => o.id)).toEqual(["A", "B", "neither"]);
  });

  it("Business Administration vs Psychology (Wolt + TikTok) is a generated question", () => {
    const next = step(["wolt_new_city", "tiktok_endless_scroll"], [ans("B1", "A"), ans("P1", "A")]);
    expect(askedId(next)).toBe("focus:business_administration|psychology:0");
  });

  it("Law vs Business: surfaced from an AI-law project plus Wolt, an authored question separates them first", () => {
    const next = step(["ai_feature_privacy", "wolt_new_city"], [ans("B1", "A"), ans("L1", "A")]);
    expect(askedId(next)).toBe("L2");
    expect(reasonOf(next)).toBe("separates_leaders");
  });

  it("builds a 3-way question for three tied programs (Wolt + AI project, with a shared Communication answer)", () => {
    const next = step(["wolt_new_city", "ai_feature_privacy"], [ans("B1", "A"), ans("L1", "C")]);
    expect([...next.state.shortlist].sort()).toEqual([
      "business_administration",
      "communication",
      "communication_and_management",
    ]);
    expect(askedId(next)).toBe("focus:business_administration|communication|communication_and_management:0");
    if (next.status !== "ask" || next.mode !== "generic" || next.question.source !== "generic_focus") {
      throw new Error("expected a generated focus question");
    }
    expect(next.question.question.options.map((o) => o.id)).toEqual(["A", "B", "C", "neither"]);
  });

  it("neutral generated answers score nothing, count toward the ceiling, and never create a recommendation", () => {
    const base = [ans("P1", "B"), ans("C1", "B")];
    const selected = ["tiktok_endless_scroll", "nike_israel_launch"];
    const before = step(selected, base);
    const path = [...base];
    for (let i = 0; i < 3; i++) {
      const next = step(selected, path);
      expect(reasonOf(next)).toBe("generic_focus");
      path.push(ans(askedId(next)!, "neither"));
    }
    const end = step(selected, path);
    expect(end.state.scores).toEqual(before.state.scores);
    expect(end.state.scoredAnswerCount).toBe(5);
    // A near tie, never a recommendation. (The router may still ask the reality checks of the tied programs.)
    expect(end.state.resolution).toMatchObject({ kind: "near_tie" });
  });
});

describe("every answer path of every non-tech selection (exhaustive)", () => {
  const selections: string[][] = [
    ...NON_TECH.map((id) => [id]),
    ...NON_TECH.flatMap((a, i) => NON_TECH.slice(i + 1).map((b) => [a, b])),
  ];

  it("never reports needs_focus_content, never repeats a question, and ends in a result within 7 answers", () => {
    const outcomes = new Map<string, number>();
    let paths = 0;
    let longest = 0;
    for (const selected of selections) {
      const walk = (answers: RecordedAnswer[]): void => {
        const next = step(selected, answers);
        if (next.status === "needs_focus_content") {
          throw new Error(`content gap for ${selected.join("+")} after ${answers.map((a) => a.questionId).join(",")}`);
        }
        if (next.status === "complete") {
          paths++;
          longest = Math.max(longest, answers.length);
          outcomes.set(next.outcome.kind, (outcomes.get(next.outcome.kind) ?? 0) + 1);
          const ids = answers.map((a) => a.questionId);
          expect(new Set(ids).size).toBe(ids.length);
          return;
        }
        if (next.mode === "precision") throw new Error("non-tech selections never reach the V1 module");
        for (const option of next.question.question.options)
          walk([...answers, ans(next.question.question.id, option.id)]);
      };
      walk([]);
    }
    expect(paths).toBeGreaterThan(5000);
    // 5 scored answers plus at most two reality checks (a near tie checks each of its two programs).
    expect(longest).toBeLessThanOrEqual(7);
    // Every authored option points to a program, so these clusters cannot reach "insufficient positive evidence".
    expect([...outcomes.keys()].sort()).toEqual(["near_tie", "recommended"]);
  }, 120_000);
});

describe("V1 tech stays separate", () => {
  it("Spotify alone is the V1 flow: Q1 is asked by V1 itself", () => {
    expect(askedId(step([SPOTIFY]))).toBe("Q1");
  });

  it.each(NON_TECH)("Spotify + %s asks the Spotify opener T1 once and never Q1 again", (other) => {
    const answers: RecordedAnswer[] = [];
    const asked: string[] = [];
    for (let guard = 0; guard < 30; guard++) {
      const next = step([SPOTIFY, other], answers);
      if (next.status === "complete") break;
      if (next.status === "needs_focus_content") throw new Error("unexpected content gap");
      const id = askedId(next)!;
      asked.push(id);
      const options = next.mode === "precision" ? next.question.options : next.question.question.options;
      // Prefer the first option for the opener, then the first for every later question.
      answers.push(ans(id, options[0]!.id));
    }
    expect(asked.filter((id) => id === "T1")).toHaveLength(1);
    expect(asked).not.toContain("Q1");
  });
});

describe("production reality checks", () => {
  it("asks the Accounting check after Accounting resolves, and it changes nothing about the ranking", () => {
    const won = [ans("B1", "C"), ans("B2", "C"), ans("B3", "C")];
    const asked = step(["wolt_new_city"], won);
    expect(asked.state.resolution).toEqual({ kind: "recommended", programId: "accounting" });
    expect(askedId(asked)).toBe("BR1");
    expect(reasonOf(asked)).toBe("reality_check");
    const done = step(["wolt_new_city"], [...won, ans("BR1", "C")]);
    expect(done.status).toBe("complete");
    expect(done.state.scores).toEqual(asked.state.scores);
    expect(done.state.ranking).toEqual(asked.state.ranking);
    expect(done.state.realityEvidence).toMatchObject([
      { questionId: "BR1", forProgramIds: ["accounting"], realityLevel: "negative" },
    ]);
  });

  it("completes cleanly, without a check, when the recommended program has none (Business Administration)", () => {
    const done = step(["wolt_new_city"], [ans("B1", "A"), ans("B2", "A"), ans("B3", "A")]);
    expect(done).toMatchObject({
      status: "complete",
      outcome: { kind: "recommended", programId: "business_administration" },
    });
    expect(done.state.realityEvidence).toEqual([]);
  });

  it("reaches an adjacent winner's own check across clusters: Communication & Management wins inside the Law cluster", () => {
    // L1=C credits Communication and Communication & Management; L5=C then favours Communication & Management.
    const answers = [ans("L1", "C"), ans("L5", "C"), ans("focus:communication|communication_and_management:0", "B")];
    const next = step(["ai_feature_privacy"], answers);
    expect(next.state.resolution).toEqual({ kind: "recommended", programId: "communication_and_management" });
    // The Law check (L4) is not borrowed; the Communication & Management check from the Communication cluster is asked.
    expect(askedId(next)).toBe("CR1");
    const done = step(["ai_feature_privacy"], [...answers, ans("CR1", "A")]);
    expect(done.status).toBe("complete");
    expect(done.state.askedQuestionIds).not.toContain("L4");
  });
});
