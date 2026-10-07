import { describe, expect, it } from "vitest";
import {
  CAREER_PROJECTS,
  getV2Cluster,
  getV2QuestionCopy,
  V2_CLUSTERS,
  V2_PROGRAM_CATALOG,
  V2_PROGRAM_IDS,
} from "@/data";
import clustersRaw from "@/data/content/discovery/clusters.json";
import neutralCopy from "@/data/content/question_copy_he.json";
import type { V2Question } from "@/engine";

/** THI-15: the shipped non-tech V2 question content and per-program work statements (structure, mapping, copy QA). */

const HEBREW = /[֐-׿]/;
const NON_TECH = ["business", "people", "communication", "law", "interior_design"] as const;

const cluster = (id: string) => getV2Cluster(id)!;
const question = (id: string) => V2_CLUSTERS.flatMap((c) => c.questions).find((q) => q.id === id)!;
const shape = (id: string) => cluster(id).questions.map((q) => `${q.position}:${q.id}:${q.kind}`);
const targets = (q: V2Question) => Object.fromEntries(q.options.map((o) => [o.id, o.programIds]));
/** Program targets of the options that name a program (the shared neutral option is covered by its own tests). */
const scoredTargets = (q: V2Question) =>
  Object.fromEntries(q.options.filter((o) => o.id !== "neither").map((o) => [o.id, o.programIds]));

describe("approved question sets", () => {
  it("ships exactly the approved questions per cluster, in position order", () => {
    expect(shape("business")).toEqual([
      "1:B1:scenario",
      "2:B2:focus",
      "3:B3:focus",
      "4:B4:focus",
      "5:B5:focus",
      "6:BR1:reality_check",
    ]);
    expect(shape("people")).toEqual([
      "1:P1:scenario",
      "2:P2:scenario",
      "3:P3:focus",
      "4:P4:focus",
      "5:P5:focus",
      "6:P6:focus",
      "7:PR1:reality_check",
      "8:PR2:reality_check",
    ]);
    expect(shape("communication")).toEqual([
      "1:C1:scenario",
      "2:C2:focus",
      "3:C3:focus",
      "4:C4:focus",
      "5:C5:focus",
      "6:CR1:reality_check",
    ]);
    expect(shape("law")).toEqual([
      "1:L1:scenario",
      "2:L2:focus",
      "3:L3:focus",
      "4:L5:focus",
      "5:L6:focus",
      "6:L7:focus",
      "7:L4:reality_check",
    ]);
    expect(shape("interior_design")).toEqual([
      "1:D1:scenario",
      "2:D2:focus",
      "3:D3:focus",
      "4:D5:focus",
      "5:D6:focus",
      "6:D7:focus",
      "7:D4:reality_check",
    ]);
  });

  it("keeps the remaining Q6-Q7 id slots free and never exceeds a cluster's bound (no count is hard-coded)", () => {
    const ids = new Set(V2_CLUSTERS.flatMap((c) => c.questions.map((q) => q.id)));
    for (const reserved of ["B6", "B7", "P7", "C6", "C7", "L8", "D8"]) expect(ids.has(reserved)).toBe(false);
    for (const id of NON_TECH) expect(cluster(id).questions.length).toBeLessThanOrEqual(cluster(id).maxQuestions);
  });

  it("opens each project with its own scenario and no other question names a project", () => {
    const opener = (projectId: string) =>
      V2_CLUSTERS.flatMap((c) => c.questions).filter((q) => q.projectIds?.includes(projectId));
    expect(opener("wolt_new_city").map((q) => q.id)).toEqual(["B1"]);
    expect(opener("tiktok_endless_scroll").map((q) => q.id)).toEqual(["P1"]);
    expect(opener("duolingo_persistence").map((q) => q.id)).toEqual(["P2"]);
    expect(opener("nike_israel_launch").map((q) => q.id)).toEqual(["C1"]);
    expect(opener("ai_feature_privacy").map((q) => q.id)).toEqual(["L1"]);
    expect(opener("apple_store_space").map((q) => q.id)).toEqual(["D1"]);
    expect(opener("spotify_discover_weekly").map((q) => q.id)).toEqual(["T1"]);
    // Every project has exactly one opener, and it belongs to the project's own cluster.
    for (const project of CAREER_PROJECTS) {
      const [first, ...rest] = opener(project.id);
      expect(rest).toEqual([]);
      expect(cluster(project.clusterId).questions).toContain(first);
    }
  });

  it("maps the approved options to the approved programs", () => {
    const BA = "business_administration";
    expect(targets(question("B1"))).toEqual({ A: [BA], B: ["economics_and_management"], C: ["accounting"] });
    expect(scoredTargets(question("P3"))).toEqual({
      A: ["psychology"],
      B: ["behavioral_science"],
      C: ["economics_and_psychology"],
      D: ["education"],
    });
    expect(scoredTargets(question("P4"))).toEqual({
      A: ["psychology"],
      B: ["behavioral_science"],
      C: ["education"],
      D: ["economics_and_psychology"],
    });
    expect(targets(question("C1"))).toEqual({ A: ["communication"], B: ["communication_and_management"], C: [BA] });
    expect(scoredTargets(question("L2"))).toEqual({ A: ["law"], B: [BA], C: ["management_information_systems"] });
    expect(scoredTargets(question("D2"))).toEqual({
      A: ["interior_design"],
      B: ["communication"],
      C: ["behavioral_science"],
    });
    expect(scoredTargets(question("L5"))).toEqual({
      A: ["law"],
      B: ["communication"],
      C: ["communication_and_management"],
    });
    expect(targets(question("D5"))).toEqual({ A: ["interior_design"], B: ["communication"], C: [BA], neither: [] });
    expect(targets(question("B5"))).toEqual({
      A: [BA],
      B: ["economics_and_management"],
      C: ["accounting"],
      neither: [],
    });
    expect(targets(question("P5"))).toEqual({
      A: ["psychology"],
      B: ["behavioral_science"],
      C: ["education"],
      D: ["economics_and_psychology"],
      neither: [],
    });
    expect(targets(question("P6"))).toEqual(targets(question("P5")));
    expect(targets(question("C5"))).toEqual({
      A: ["communication"],
      B: ["communication_and_management"],
      C: [BA],
      neither: [],
    });
    // L7 / D7: deliberately narrow two-program comparisons (Law vs Business, Interior Design vs Business).
    expect(targets(question("L7"))).toEqual({ A: ["law"], B: [BA], neither: [] });
    expect(targets(question("D7"))).toEqual({ A: ["interior_design"], B: [BA], neither: [] });
    expect(targets(question("L6"))).toEqual({ A: ["law"], B: [BA], C: ["communication"], neither: [] });
    expect(targets(question("D6"))).toEqual({ A: ["interior_design"], B: ["communication"], C: [BA], neither: [] });
  });

  it("uses one intentional multi-target option: Law L1 C points to Communication and Communication + Management", () => {
    const multi = V2_CLUSTERS.flatMap((c) =>
      c.questions.flatMap((q) => q.options.filter((o) => o.programIds.length > 1).map((o) => `${q.id}.${o.id}`)),
    );
    expect(multi).toEqual(["L1.C"]);
    expect(targets(question("L1")).C).toEqual(["communication", "communication_and_management"]);
  });

  it("points every scored option to a real program (or is the shared neutral option), never to an abstract signal", () => {
    for (const c of V2_CLUSTERS) {
      for (const q of c.questions.filter((x) => x.kind !== "reality_check")) {
        for (const o of q.options) {
          if (o.id === "neither") continue;
          expect(o.programIds.length, `${q.id}.${o.id}`).toBeGreaterThan(0);
          for (const programId of o.programIds) expect(V2_PROGRAM_IDS).toContain(programId);
        }
      }
    }
  });

  it("keeps Data Science out of Interior Design (no option uses it) and Interior Design adjacent set final", () => {
    expect(cluster("interior_design").adjacentProgramIds).toEqual([
      "communication",
      "business_administration",
      "behavioral_science",
    ]);
  });

  it("carries no weight, point or score field in the data (weights are engine-owned)", () => {
    expect(JSON.stringify(clustersRaw)).not.toMatch(/"(weight|weights|points|score|scores)"/);
  });
});

describe("neutral-option policy (THI-15 review)", () => {
  const scoredOf = (id: string) => cluster(id).questions.filter((q) => q.kind !== "reality_check");
  const openers = V2_CLUSTERS.flatMap((c) => c.questions).filter((q) => q.projectIds !== null);
  const followUps = NON_TECH.flatMap((id) => scoredOf(id)).filter((q) => q.projectIds === null);

  it("gives no opening project scenario a neutral option: they are forced work choices", () => {
    expect(openers.map((q) => q.id).sort()).toEqual(["B1", "C1", "D1", "L1", "P1", "P2", "T1"]);
    for (const q of openers) {
      expect(q.kind, q.id).toBe("scenario");
      expect(
        q.options.some((o) => o.programIds.length === 0),
        q.id,
      ).toBe(false);
      expect(
        q.options.some((o) => o.id === "neither"),
        q.id,
      ).toBe(false);
    }
  });

  it("gives every authored follow-up focus question exactly one neutral option, last, with the shared copy", () => {
    expect(followUps.map((q) => q.id).sort()).toEqual(
      [
        "B2",
        "B3",
        "B4",
        "B5",
        "C2",
        "C3",
        "C4",
        "C5",
        "D2",
        "D3",
        "D5",
        "D6",
        "D7",
        "L2",
        "L3",
        "L5",
        "L6",
        "L7",
        "P3",
        "P4",
        "P5",
        "P6",
      ].sort(),
    );
    for (const q of followUps) {
      expect(q.kind, q.id).toBe("focus");
      const neutral = q.options.filter((o) => o.programIds.length === 0);
      expect(
        neutral.map((o) => o.id),
        q.id,
      ).toEqual(["neither"]);
      expect(q.options.at(-1)!.id, q.id).toBe("neither");
      expect(getV2QuestionCopy(q.id)!.options.at(-1)!.label, q.id).toBe(neutralCopy.neutral_option);
    }
  });

  it("makes the neutral option signal-free: no program, no reality level, no score field", () => {
    for (const q of followUps) {
      const neutral = q.options.find((o) => o.id === "neither")!;
      expect(neutral).toEqual({ id: "neither", programIds: [], realityLevel: null });
    }
    const raw = (clustersRaw.clusters as Array<{ questions: Array<{ options: Array<{ id: string }> }> }>).flatMap((c) =>
      c.questions.flatMap((q) => q.options),
    );
    for (const o of raw.filter((x) => x.id === "neither"))
      expect(Object.keys(o).sort()).toEqual(["id", "label_he", "program_ids"]);
  });

  it("uses exactly the shared V1 neutral wording, which is not negative or judgemental", () => {
    expect(neutralCopy.neutral_option).toBe("אף אחת מהאפשרויות לא ממש מושכת אותי");
    expect(neutralCopy.neutral_option).not.toMatch(/לא יודע|לא מתאים לי|אף אחד/);
  });

  it("leaves reality checks with their positive / neutral / negative structure and no 'neither'", () => {
    for (const q of V2_CLUSTERS.flatMap((c) => c.questions).filter((x) => x.kind === "reality_check")) {
      expect(q.options.map((o) => o.realityLevel)).toEqual(["positive", "neutral", "negative"]);
      expect(q.options.some((o) => o.id === "neither")).toBe(false);
    }
  });

  it("has at least five scored questions available for every single non-tech project (reality checks excluded)", () => {
    for (const project of CAREER_PROJECTS.filter((p) => p.clusterId !== "tech")) {
      const available = scoredOf(project.clusterId).filter(
        (q) => q.projectIds === null || q.projectIds.includes(project.id),
      );
      expect(available.length, project.id).toBeGreaterThanOrEqual(5);
    }
    for (const id of NON_TECH) expect(scoredOf(id).length, id).toBeGreaterThanOrEqual(5);
  });
});

describe("reality checks", () => {
  const checks = V2_CLUSTERS.flatMap((c) => c.questions.filter((q) => q.kind === "reality_check"));

  it("covers the required programs and the two optional ones, each explicitly", () => {
    const covered = checks.flatMap((q) => q.realityForProgramIds ?? []).sort();
    expect(covered).toEqual(
      ["accounting", "communication_and_management", "education", "interior_design", "law", "psychology"].sort(),
    );
  });

  it("points no option to a program, gives every option a reality level, and names its program(s)", () => {
    for (const q of checks) {
      expect(q.realityForProgramIds?.length, q.id).toBeGreaterThan(0);
      expect(
        q.options.map((o) => o.realityLevel),
        q.id,
      ).toEqual(["positive", "neutral", "negative"]);
      for (const o of q.options) expect(o.programIds, `${q.id}.${o.id}`).toEqual([]);
    }
  });

  it("is applicable only inside the cluster it belongs to or its neighbours", () => {
    for (const c of V2_CLUSTERS) {
      const allowed = new Set([...c.programIds, ...c.adjacentProgramIds]);
      for (const q of c.questions.filter((x) => x.kind === "reality_check")) {
        for (const programId of q.realityForProgramIds!) expect(allowed.has(programId), q.id).toBe(true);
      }
    }
  });

  it("is never a ranking question: it carries no program id on any option", () => {
    expect(checks.every((q) => q.options.every((o) => o.programIds.length === 0))).toBe(true);
  });
});

describe("work statements", () => {
  const statements = V2_PROGRAM_CATALOG.map((program) => ({ id: program.id, list: program.workStatementsHe }));
  const all = statements.flatMap((s) => s.list);

  it("gives every one of the 14 programs two or three non-empty statements", () => {
    expect(statements).toHaveLength(14);
    for (const { id, list } of statements) {
      expect(list.length, id).toBeGreaterThanOrEqual(2);
      expect(list.length, id).toBeLessThanOrEqual(3);
      for (const text of list) expect(text.trim().length, id).toBeGreaterThan(0);
    }
  });

  it("keeps each statement short enough for a generated 2-/3-way option, in Hebrew, with no brand or number", () => {
    for (const text of all) {
      expect(text.length, text).toBeLessThanOrEqual(90);
      expect(text, text).toMatch(HEBREW);
      expect(text, text).not.toMatch(/\d/);
      expect(text, text).not.toMatch(/Spotify|Wolt|Nike|Apple|TikTok|Duolingo/i);
    }
  });

  it("differentiates programs: no statement is shared, and no program repeats a statement", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("stays a structured fragment about work, not an academic claim or guarantee", () => {
    for (const text of all) {
      expect(text, text).not.toMatch(/(^|s)(תואר|קורס|קורסים|קבלה|ציון|שכר|מובטח|מבטיח)(s|$)/);
    }
  });
});

describe("candidate copy QA", () => {
  const copy = V2_CLUSTERS.filter((c) => (NON_TECH as readonly string[]).includes(c.id)).flatMap((c) =>
    c.questions.map((q) => ({ q, copy: getV2QuestionCopy(q.id)! })),
  );

  it("has Hebrew copy for every question and option", () => {
    expect(copy).toHaveLength(NON_TECH.map((id) => cluster(id).questions.length).reduce((a, b) => a + b, 0));
    for (const { q, copy: c } of copy) {
      expect(c.prompt, q.id).toMatch(HEBREW);
      expect(
        c.options.map((o) => o.id),
        q.id,
      ).toEqual(q.options.map((o) => o.id));
      for (const o of c.options) expect(o.label, `${q.id}.${o.id}`).toMatch(HEBREW);
    }
  });

  it("is concise, informal and plural-style, with no diagnostic vocabulary, scores or degree names", () => {
    const banned = /נטייה|פרופיל|כישורים|אבחון|הערכת התאמה|ציון|ניקוד|אחוזי|התאמה של|תואר ראשון/;
    for (const { q, copy: c } of copy) {
      expect(c.prompt.length, q.id).toBeLessThanOrEqual(150);
      expect(c.prompt, q.id).not.toMatch(banned);
      // Singular second person ("אתה/שלך/אותך") is out; the product speaks to "אתכם".
      expect(c.prompt, q.id).not.toMatch(/(^|\s)(אתה|שלך|אותך|בשבילך|לך)(\s|[.,?!]|$)/);
      for (const o of c.options) {
        expect(o.label.length, `${q.id}.${o.id}`).toBeLessThanOrEqual(110);
        expect(o.label, `${q.id}.${o.id}`).not.toMatch(banned);
        expect(o.label, `${q.id}.${o.id}`).not.toMatch(/(^|\s)(אתה|שלך|אותך|בשבילך|לך)(\s|[.,?!]|$)/);
      }
    }
  });

  it("does not repeat an option text inside one question, nor reuse one prompt twice", () => {
    for (const { q, copy: c } of copy) expect(new Set(c.options.map((o) => o.label)).size, q.id).toBe(c.options.length);
    const prompts = copy.map(({ copy: c }) => c.prompt);
    // Two "which day sounds interesting" prompts (C4, D3, L3) share a stem by design; scenario prompts are all distinct.
    const scenarios = copy.filter(({ q }) => q.kind === "scenario").map(({ copy: c }) => c.prompt);
    expect(new Set(scenarios).size).toBe(scenarios.length);
    expect(prompts.length).toBeGreaterThan(20);
  });

  it("uses company names as scenario context only (the project names stay in the prompt text, not in an option)", () => {
    for (const { q, copy: c } of copy) {
      for (const o of c.options)
        expect(o.label, `${q.id}.${o.id}`).not.toMatch(/Spotify|Wolt|Nike|Apple|TikTok|Duolingo/i);
    }
  });
});
