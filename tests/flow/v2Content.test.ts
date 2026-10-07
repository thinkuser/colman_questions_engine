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

describe("neutral answers (THI-15 review)", () => {
  /** Answer `neither` wherever it is offered, and the first option otherwise (the project openers). */
  const playNeutral = (selected: string[], openers: Record<string, string>) => {
    const answers: RecordedAnswer[] = [];
    const asked: string[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const next = step(selected, answers);
      if (next.status !== "ask" || next.mode !== "generic") return { next, answers, asked };
      const q = next.question.question;
      asked.push(q.id);
      answers.push(
        ans(q.id, openers[q.id] ?? (q.options.some((o) => o.id === "neither") ? "neither" : q.options[0]!.id)),
      );
    }
    throw new Error("did not terminate");
  };

  it.each([
    ["Wolt / Business Administration", "wolt_new_city", { B1: "A" }, ["B1", "B2", "B3", "B4", "B5"]],
    ["TikTok / Psychology", "tiktok_endless_scroll", { P1: "A" }, ["P1", "P3", "P4", "P5", "P6"]],
    ["Duolingo / Education", "duolingo_persistence", { P2: "B" }, ["P2", "P3", "P4", "P5", "P6"]],
    ["Nike / Communication", "nike_israel_launch", { C1: "A" }, ["C1", "C2", "C3", "C4", "C5"]],
    ["AI / Law", "ai_feature_privacy", { L1: "A" }, ["L1", "L2", "L3", "L5", "L6"]],
    ["Apple / Interior Design", "apple_store_space", { D1: "A" }, ["D1", "D2", "D3", "D5", "D6"]],
  ])(
    "%s: opener + four neutral follow-ups reaches 5 scored answers and insufficient_positive_evidence",
    (_n, project, openers, order) => {
      const { next, asked } = playNeutral([project], openers);
      expect(asked).toEqual(order);
      expect(next.status).toBe("complete");
      expect(next).toMatchObject({
        outcome: { kind: "insufficient_positive_evidence" },
        completionReason: "ceiling_insufficient_evidence",
      });
      expect(next.state.scoredAnswerCount).toBe(5);
      // Exactly one program is supported, once; the four neutral answers added nothing and forced no other program in.
      expect(Object.values(next.state.support).filter((n) => n > 0)).toEqual([1]);
      expect(next.state.evidence.filter((e) => e.programIds.length === 0)).toHaveLength(4);
      expect(next.state.realityEvidence).toEqual([]);
    },
  );

  it("neutral answers add zero points and zero support but count toward the ceiling", () => {
    const before = step(["wolt_new_city"], [ans("B1", "B")]);
    const after = step(["wolt_new_city"], [ans("B1", "B"), ans("B2", "neither")]);
    expect(after.state.scores).toEqual(before.state.scores);
    expect(after.state.support).toEqual(before.state.support);
    expect(after.state.scoredAnswerCount).toBe(2);
    expect(after.state.evidence.at(-1)).toMatchObject({ questionId: "B2", programIds: [], weight: 4 });
  });

  it("strong path: the opener plus matching focus answers still recommend normally", () => {
    const done = step(["wolt_new_city"], [ans("B1", "C"), ans("B2", "neither"), ans("B3", "C")]);
    expect(done.state.resolution).toEqual({ kind: "recommended", programId: "accounting" });
    expect(done.state.scoredAnswerCount).toBe(3);
  });

  it("mixed path: a later answer supports another program, which joins; zero-support programs do not", () => {
    const next = step(["wolt_new_city"], [ans("B1", "A"), ans("B2", "neither"), ans("B3", "B")]);
    expect(next.state.support).toMatchObject({
      business_administration: 1,
      economics_and_management: 1,
      accounting: 0,
    });
    expect([...next.state.shortlist].sort()).toEqual(["business_administration", "economics_and_management"]);
    expect(next.state.shortlist).not.toContain("accounting");
    expect(next.state.resolution).toBeNull();
    expect(askedId(next)).toBe("B4");
  });

  it.each([
    ["wolt_new_city", "nike_israel_launch"],
    ["tiktok_endless_scroll", "nike_israel_launch"],
    ["wolt_new_city", "ai_feature_privacy"],
    ["nike_israel_launch", "apple_store_space"],
    ["apple_store_space", "ai_feature_privacy"],
  ])("two projects (%s + %s): neutral follow-ups never reach a content gap or a recommendation", (first, second) => {
    // Openers keep their positive signal (first option); every later authored or generated question answers neutrally.
    const { next, answers } = playNeutral([first, second], {});
    expect(next.status).toBe("complete");
    expect(next.state.scoredAnswerCount).toBe(5);
    // Two openers express two different preferences, so a near tie is the correct result, never a forced winner.
    expect(next.status === "complete" && next.outcome.kind).toBe("near_tie");
    expect(answers.filter((a) => a.answerId === "neither").length).toBeGreaterThanOrEqual(3);
  });

  it("documents the one remaining single-project dead end: a lone Business Administration leader in Law / Interior Design", () => {
    // BA is adjacent there and has no option in L5 / D2, so only four authored questions can test it.
    const law = playNeutral(["ai_feature_privacy"], { L1: "B" });
    expect(law.next).toMatchObject({ status: "needs_focus_content", programIds: ["business_administration"] });
    expect(law.asked).toEqual(["L1", "L2", "L3", "L6"]);
    const apple = playNeutral(["apple_store_space"], { D1: "C" });
    expect(apple.next).toMatchObject({ status: "needs_focus_content", programIds: ["business_administration"] });
    expect(apple.asked).toEqual(["D1", "D3", "D5", "D6"]);
  });
});

describe("every answer path of every non-tech selection (state-memoised walk)", () => {
  const selections: string[][] = [
    ...NON_TECH.map((id) => [id]),
    ...NON_TECH.flatMap((a, i) => NON_TECH.slice(i + 1).map((b) => [a, b])),
  ];

  interface Tally {
    paths: number;
    recommended: number;
    near_tie: number;
    insufficient: number;
    gap: number;
    maxScored: number;
    maxAnswers: number;
  }
  const empty = (): Tally => ({
    paths: 0,
    recommended: 0,
    near_tie: 0,
    insufficient: 0,
    gap: 0,
    maxScored: 0,
    maxAnswers: 0,
  });
  const add = (into: Tally, from: Tally) => {
    for (const k of ["paths", "recommended", "near_tie", "insufficient", "gap"] as const) into[k] += from[k];
    into.maxScored = Math.max(into.maxScored, from.maxScored);
    into.maxAnswers = Math.max(into.maxAnswers, from.maxAnswers);
  };
  const leaf = (s: V2Step, answers: number, gaps: string[], selected: string[], trail: RecordedAnswer[]): Tally => {
    const t = empty();
    t.paths = 1;
    t.maxScored = s.state.scoredAnswerCount;
    t.maxAnswers = answers;
    if (s.status === "needs_focus_content") {
      t.gap = 1;
      gaps.push(`${selected.join("+")} [${s.programIds.join(",")}] after ${trail.map((a) => a.questionId).join(",")}`);
    } else if (s.status === "complete") {
      if (s.outcome.kind === "recommended") t.recommended = 1;
      else if (s.outcome.kind === "near_tie") t.near_tie = 1;
      else if (s.outcome.kind === "insufficient_positive_evidence") t.insufficient = 1;
      else throw new Error("non-tech selections never reach the V1 module");
    }
    return t;
  };
  const optionsOf = (s: Extract<V2Step, { status: "ask" }>) => {
    if (s.mode === "precision") throw new Error("non-tech selections never reach the V1 module");
    return { id: s.question.question.id, options: s.question.question.options.map((o) => o.id) };
  };

  /**
   * Walks every reachable engine state once. The next step depends only on the asked questions, the scores and support,
   * the rankable programs and the reality evidence, so two paths with the same key have identical futures; the tally of a
   * state is the sum of its children's, which gives the exact number of complete paths without enumerating them.
   */
  function memoWalk(selected: string[], gaps: string[]): Tally {
    const memo = new Map<string, Tally>();
    const walk = (answers: RecordedAnswer[]): Tally => {
      const s = step(selected, answers);
      const key = JSON.stringify([
        [...s.state.askedQuestionIds].sort(),
        s.state.scores,
        s.state.support,
        s.state.rankableProgramIds,
        s.state.realityEvidence.map((r) => r.questionId),
      ]);
      const hit = memo.get(key);
      if (hit) {
        if (hit.gap > 0) gaps.push(`${selected.join("+")} (repeat state)`);
        return hit;
      }
      let tally: Tally;
      if (s.status !== "ask") tally = leaf(s, answers.length, gaps, selected, answers);
      else {
        tally = empty();
        const { id, options } = optionsOf(s);
        for (const option of options) add(tally, walk([...answers, ans(id, option)]));
      }
      memo.set(key, tally);
      return tally;
    };
    return walk([]);
  }

  /** The literal Cartesian walk, used on the six single-project selections to prove the memoised one is exact. */
  function literalWalk(selected: string[]): Tally {
    const tally = empty();
    const walk = (answers: RecordedAnswer[]): void => {
      const s = step(selected, answers);
      if (s.status !== "ask") return add(tally, leaf(s, answers.length, [], selected, answers));
      const { id, options } = optionsOf(s);
      for (const option of options) walk([...answers, ans(id, option)]);
    };
    walk([]);
    return tally;
  }

  it("matches the literal walk on every single-project selection", () => {
    for (const project of NON_TECH) {
      expect(memoWalk([project], []), project).toEqual(literalWalk([project]));
    }
  }, 120_000);

  it("never reports needs_focus_content except for the two documented lone-Business-Administration dead ends", () => {
    const total = empty();
    const gaps: string[] = [];
    for (const selected of selections) add(total, memoWalk(selected, gaps));
    expect(gaps.sort()).toEqual([
      "ai_feature_privacy [business_administration] after L1,L2,L3,L6",
      "apple_store_space [business_administration] after D1,D3,D5,D6",
    ]);
    expect(total.gap).toBe(2);
    // Results are recommendations, valid near ties, and (now reachable) insufficient positive evidence.
    expect(total.recommended).toBeGreaterThan(0);
    expect(total.near_tie).toBeGreaterThan(0);
    expect(total.insufficient).toBeGreaterThan(0);
    expect(total.recommended + total.near_tie + total.insufficient + total.gap).toBe(total.paths);
    // The generic ceiling holds: at most 5 scored answers, plus at most two reality checks for a near tie.
    expect(total.maxScored).toBeLessThanOrEqual(5);
    expect(total.maxAnswers).toBeLessThanOrEqual(7);
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
