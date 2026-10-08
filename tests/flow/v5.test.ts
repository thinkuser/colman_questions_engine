import { describe, expect, it } from "vitest";
import { JourneyTracker, type DataLayerEvent, type DataLayerHost } from "@/analytics";
import {
  CAREER_PROJECTS,
  getV5Project,
  getV5ProjectQuestionCopy,
  V2_PROGRAM_IDS,
  V5_COPY,
  V5_PROJECT_CLUSTERS,
  V5_PROJECTS,
  V4_COPY,
  buildV5Projects,
} from "@/data";
import projectsRaw from "@/data/content/discovery/v5_projects.json";
import { V2_WEIGHTS, type RecordedAnswer, type V2Step } from "@/engine";
import {
  BRAND_STRATEGY,
  buildLeadRequest,
  buildLeadWebhookPayload,
  buildV3QuestionView,
  buildV3ResultView,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  LeadRequestSchema,
  normalizePhone,
  PROJECT_STRATEGY,
  restoreV4Journey,
  restoreV5Journey,
  serializeV4Journey,
  serializeV5Journey,
  strategyForEntryMode,
  strategyForV5EntryMode,
  V3_STORAGE_KEY,
  V4_STORAGE_KEY,
  V5_STORAGE_KEY,
  WORLD_STRATEGY,
  DISCOVERY_STORAGE_KEY,
  type DiscoveryStrategy,
  type JourneyAction,
  type JourneyState,
} from "@/flow";
import { v5Allows, v5Target } from "@/ui/state/v5Rules";
import { memoryStorage } from "../analytics/harness";

/** V5 balanced project-led discovery (DEC-037). */

const SPEC: Array<{
  id: string;
  title: string;
  card: string;
  core: string[];
  adjacent: string[];
  opener: string;
  options: Array<[string, string, string]>;
}> = [
  {
    id: "spotify_discovery",
    title: "Spotify",
    card: "לשפר את הדרך שבה מגלים מוזיקה חדשה שמתאימה בדיוק לטעם האישי.",
    core: ["computer_science", "data_science", "management_information_systems"],
    // Like the approved Technology world: one program outside the Tech module, so the opener is actually asked
    // (with an all-Tech pool the engine hands off to V1 before any opener, and V1 would ask its own Q1).
    adjacent: ["business_administration"],
    opener: "Discover Weekly לא פוגע מספיק טוב. איזה חלק הכי מסקרן?",
    options: [
      ["A", "לבנות ולשפר את המערכת", "computer_science"],
      ["B", "לפתוח את הנתונים ולגלות דפוסים", "data_science"],
      ["C", "להבין את הצורך ולחבר בין העסק למערכת", "management_information_systems"],
    ],
  },
  {
    id: "wolt_city_expansion",
    title: "Wolt",
    card: "להחליט אם ואיך להיכנס לעיר חדשה ולהפוך את המהלך להצלחה.",
    core: ["business_administration", "economics_and_management"],
    adjacent: ["economics_and_psychology", "accounting"],
    opener: "Wolt שוקלת להיכנס לעיר חדשה. מה הכי מעניין לבדוק?",
    options: [
      ["A", "איך להפוך את ההזדמנות למהלך עסקי", "business_administration"],
      ["B", "ביקוש, מחירים ותחרות", "economics_and_management"],
      ["C", "איך אנשים יגיבו למחיר ולתמריצים", "economics_and_psychology"],
    ],
  },
  {
    id: "tiktok_behavior",
    title: "TikTok",
    card: "להבין למה אנשים ממשיכים לגלול ומה משפיע על הבחירות שלהם.",
    core: ["psychology", "behavioral_science", "economics_and_psychology"],
    adjacent: [],
    opener: "השימוש באפליקציה עולה מאוד. מה הכי מסקרן להבין?",
    options: [
      ["A", "מה קורה אצל האדם: מוטיבציה, רגש והרגלים", "psychology"],
      ["B", "איך הקבוצה, הנורמות והסביבה משפיעות", "behavioral_science"],
      ["C", "איך עיצוב הבחירה והתמריצים משפיעים על החלטות", "economics_and_psychology"],
    ],
  },
  {
    id: "duolingo_persistence",
    title: "Duolingo",
    card: "לגרום ליותר אנשים להמשיך ללמוד גם כשהמוטיבציה מתחילה לרדת.",
    core: ["education", "psychology", "behavioral_science"],
    adjacent: [],
    opener: "הרבה משתמשים מתחילים ללמוד ואז מפסיקים. במה הכי מעניין להתמקד?",
    options: [
      ["A", "לבנות דרך למידה שמתאימה טוב יותר", "education"],
      ["B", "להבין את המוטיבציה והחסמים האישיים", "psychology"],
      ["C", "להבין איך הסביבה והקבוצה משפיעות על התמדה", "behavioral_science"],
    ],
  },
  {
    id: "people_retention",
    title: "People / HR",
    card: "להבין למה עובדים טובים עוזבים ואיך ליצור מקום שרוצים להישאר בו.",
    core: ["behavioral_science", "economics_and_psychology"],
    adjacent: ["business_administration", "management_information_systems"],
    opener: "ארגון גדל מהר, אבל עובדים טובים עוזבים. איזה חלק הכי מסקרן?",
    options: [
      ["A", "תרבות, יחסים ותחושת שייכות", "behavioral_science"],
      ["B", "שכר, תמריצים ואופן הצגת הבחירה", "economics_and_psychology"],
      ["C", "מהלך של גיוס, פיתוח ושימור", "business_administration"],
      ["D", "מערכות ותהליכים שמנהלים את חוויית העובד", "management_information_systems"],
    ],
  },
  {
    id: "people_change",
    title: "מרכז ליווי והתפתחות",
    card: "להבין מה עובר על אדם בתקופת שינוי ומה יכול לעזור להתקדם.",
    core: ["psychology", "behavioral_science"],
    adjacent: ["education"],
    opener: "אדם מתמודד עם שינוי משמעותי בחיים. מה הכי מסקרן להבין?",
    options: [
      ["A", "מחשבות, רגשות ומוטיבציה", "psychology"],
      ["B", "השפעת המשפחה, הקבוצה והסביבה", "behavioral_science"],
      ["C", "למידה, התפתחות ורכישת כלים", "education"],
    ],
  },
  {
    id: "ai_legal_case",
    title: "מקרה משפטי סביב AI",
    card: "מוצר חדש עומד לעלות לאוויר, אבל יש ויכוח אם הוא פוגע בפרטיות ובזכויות.",
    core: ["law"],
    adjacent: ["business_administration", "communication"],
    opener: "לפני ההשקה מתעוררת מחלוקת. איפה הכי מעניין להיכנס לתמונה?",
    options: [
      ["A", "להבין את החוק ולבנות עמדה משפטית", "law"],
      ["B", "לשנות את המוצר או המהלך העסקי", "business_administration"],
      ["C", "להסביר לציבור ולנהל את השיח", "communication"],
    ],
  },
  {
    id: "accounting_gap",
    title: "משרד רואי חשבון",
    card: "חברה מציגה תוצאות טובות, אבל משהו במספרים פשוט לא מסתדר.",
    core: ["accounting"],
    adjacent: ["economics_and_management", "business_administration"],
    opener: "הדוחות נראים טוב, אבל יש תחושה שמשהו לא נכון. מה הכי מעניין לבדוק?",
    options: [
      ["A", "לרדת לפרטים ולמצוא את הפער", "accounting"],
      ["B", "להבין אם השוק, המחירים או הביקוש מסבירים אותו", "economics_and_management"],
      ["C", "להחליט מה העסק צריך לשנות", "business_administration"],
    ],
  },
  {
    id: "nike_launch",
    title: "Nike",
    card: "להשיק מוצר חדש בישראל ולגרום לאנשים להבין, לזכור ולרצות אותו.",
    core: ["communication", "communication_and_management"],
    adjacent: ["business_administration"],
    opener: "מוצר חדש מגיע לשוק. איזה חלק הכי מסקרן?",
    options: [
      ["A", "לבנות סיפור, תוכן וקמפיין", "communication"],
      ["B", "להחליט למי פונים, באילו ערוצים ואיך מודדים", "communication_and_management"],
      ["C", "לבנות את המהלך העסקי וההצעה", "business_administration"],
    ],
  },
  {
    id: "apple_store_space",
    title: "Apple Store",
    card: "להפוך חלל ריק למקום שאנשים רוצים להיכנס אליו, להשתמש בו ולזכור אותו.",
    core: ["interior_design"],
    adjacent: ["communication", "business_administration"],
    opener: "נפתח חלל חדש. מה הכי מעניין ליצור בו?",
    options: [
      ["A", "לתכנן חלל, תנועה, חומרים ותאורה", "interior_design"],
      ["B", "לגרום למקום לספר סיפור ולתקשר זהות", "communication"],
      ["C", "להחליט מה המקום צריך להשיג עבור העסק", "business_administration"],
    ],
  },
];

const start = (strategy: DiscoveryStrategy, ids: readonly string[]): JourneyState => {
  const state = ids.reduce(
    (current, entryId) => journeyReducer(strategy, current, { type: "toggle_entry", entryId }),
    initialJourneyState,
  );
  return journeyReducer(strategy, state, { type: "start" });
};
const answer = (strategy: DiscoveryStrategy, state: JourneyState, questionId: string, answerId: string) =>
  journeyReducer(strategy, state, { type: "record_answer", answer: { questionId, answerId } });
const asked = (step: V2Step | null) =>
  step?.status === "ask" ? (step.mode === "precision" ? step.question.id : step.question.question.id) : null;
const optionIds = (step: V2Step | null): string[] =>
  step?.status === "ask"
    ? (step.mode === "precision" ? step.question.options : step.question.question.options).map((o) => o.id)
    : [];

/** Answers with `pick` until complete; returns the end step and the asked ids. */
function runToEnd(strategy: DiscoveryStrategy, state: JourneyState, pick: (ids: string[], id: string) => string) {
  const ids: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const step = journeyStep(strategy, state);
    const id = asked(step);
    if (!id) break;
    ids.push(id);
    state = answer(strategy, state, id, pick(optionIds(step), id));
  }
  return { state, step: journeyStep(strategy, state)!, asked: ids };
}

describe("V5 project catalog", () => {
  it("has exactly the 10 specified projects, in the specified display order, with the exact card copy", () => {
    expect(V5_PROJECTS.map((project) => project.id)).toEqual(SPEC.map((entry) => entry.id));
    expect(PROJECT_STRATEGY.entryIds).toEqual(SPEC.map((entry) => entry.id));
    for (const entry of SPEC) {
      const project = getV5Project(entry.id)!;
      expect(project.titleHe, entry.id).toBe(entry.title);
      expect(project.cardHe, entry.id).toBe(entry.card);
      expect([...project.coreProgramIds], entry.id).toEqual(entry.core);
      expect([...project.adjacentProgramIds], entry.id).toEqual(entry.adjacent);
    }
  });

  it("pins every opener prompt, option label and option → program mapping", () => {
    for (const entry of SPEC) {
      const project = getV5Project(entry.id)!;
      const copy = getV5ProjectQuestionCopy(project.scenarioId)!;
      expect(copy.prompt, entry.id).toBe(entry.opener);
      expect(
        copy.options.map((o) => [o.id, o.label]),
        entry.id,
      ).toEqual(entry.options.map(([id, label]) => [id, label]));
      const cluster = V5_PROJECT_CLUSTERS.find((c) => c.questions[0]!.id === project.scenarioId)!;
      const opener = cluster.questions[0]!;
      expect(opener.kind).toBe("scenario");
      expect(
        opener.options.map((o) => [o.id, [...o.programIds]]),
        entry.id,
      ).toEqual(entry.options.map(([id, , program]) => [id, [program]]));
      // Openers have no neutral answer.
      expect(opener.options.every((o) => o.programIds.length > 0)).toBe(true);
    }
  });

  it("gives every one of the 14 programs a DIRECT answer in a V5 project opener", () => {
    const direct = new Map<string, string[]>();
    for (const cluster of V5_PROJECT_CLUSTERS)
      for (const option of cluster.questions[0]!.options)
        for (const programId of option.programIds)
          direct.set(programId, [...(direct.get(programId) ?? []), `${cluster.questions[0]!.id}/${option.id}`]);
    expect(V2_PROGRAM_IDS).toHaveLength(14);
    for (const programId of V2_PROGRAM_IDS) expect(direct.get(programId) ?? [], programId).not.toEqual([]);
  });

  it("validation rejects broken V5 content (unknown program, a core program without an opener answer)", () => {
    const broken = structuredClone(projectsRaw);
    broken.projects[1]!.scenario.options[0]!.program_ids = ["not_a_program"];
    expect(() => buildV5Projects(broken)).toThrow(/Invalid V5 projects/);
    const noCore = structuredClone(projectsRaw);
    noCore.projects[7]!.scenario.options[0]!.program_ids = ["business_administration"];
    expect(() => buildV5Projects(noCore)).toThrow(/core program "accounting" has no answer/);
  });

  it("reuses existing authored follow-ups by id instead of duplicating them (People/HR borrows WO2-WO5)", () => {
    const hr = V5_PROJECT_CLUSTERS.find((c) => c.id === "v5_project_people_retention")!;
    expect(hr.questions.map((q) => q.id).slice(0, 5)).toEqual(["V5-HR", "WO2", "WO3", "WO4", "WO5"]);
    const law = V5_PROJECT_CLUSTERS.find((c) => c.id === "v5_project_ai_legal_case")!;
    expect(law.questions.map((q) => q.id)).toEqual(expect.arrayContaining(["L2", "L3", "L5", "L6", "L7", "C2"]));
    // V5 authors only its ten openers.
    const authored = V5_PROJECT_CLUSTERS.flatMap((c) => c.questions).filter((q) => getV5ProjectQuestionCopy(q.id));
    expect(authored.map((q) => q.id).sort()).toEqual(V5_PROJECTS.map((p) => p.scenarioId).sort());
  });
});

describe("PROJECT_STRATEGY vs the frozen BRAND_STRATEGY", () => {
  it("V4 keeps BRAND_STRATEGY with its original 7 projects; V5 uses PROJECT_STRATEGY with 10", () => {
    expect(BRAND_STRATEGY.id).toBe("brand_projects");
    expect(BRAND_STRATEGY.entryIds).toEqual(CAREER_PROJECTS.filter((p) => p.enabled).map((p) => p.id));
    expect(BRAND_STRATEGY.entryIds).toHaveLength(7);
    expect(strategyForEntryMode("projects")).toBe(BRAND_STRATEGY);
    expect(PROJECT_STRATEGY.id).toBe("projects");
    expect(PROJECT_STRATEGY.entryIds).toHaveLength(10);
    expect(strategyForV5EntryMode("projects")).toBe(PROJECT_STRATEGY);
    expect(PROJECT_STRATEGY).not.toBe(BRAND_STRATEGY);
  });

  it("V4's Wolt still opens with V2's B1 (unchanged); V5's Wolt opens with its own opener", () => {
    expect(asked(journeyStep(BRAND_STRATEGY, start(BRAND_STRATEGY, ["wolt_new_city"])))).toBe("B1");
    expect(asked(journeyStep(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["wolt_city_expansion"])))).toBe("V5-WOLT");
    // Neither strategy accepts the other's ids.
    expect(PROJECT_STRATEGY.isValidSelection(["wolt_new_city"])).toBe(false);
    expect(BRAND_STRATEGY.isValidSelection(["wolt_city_expansion"])).toBe(false);
  });
});

describe("V5 project routing and scoring", () => {
  it("project selection is routing only: 0 score, 0 support, 0 evidence before the opener", () => {
    const step = journeyStep(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["accounting_gap", "nike_launch"]))!;
    expect(step.state.scoredAnswerCount).toBe(0);
    expect(Object.values(step.state.scores).every((value) => value === 0)).toBe(true);
    expect(Object.values(step.state.support).every((value) => value === 0)).toBe(true);
  });

  it("the opener is scored evidence with the existing scenario weight (+3)", () => {
    expect(V2_WEIGHTS.scenario).toBe(3);
    let state = start(PROJECT_STRATEGY, ["accounting_gap"]);
    state = answer(PROJECT_STRATEGY, state, "V5-ACCOUNTING", "A");
    const step = journeyStep(PROJECT_STRATEGY, state)!;
    expect(step.state.scores.accounting).toBe(3);
    expect(step.state.support.accounting).toBe(1);
    expect(step.state.scoredAnswerCount).toBe(1);
  });

  it("one project: opener, then the existing evidence-aware focus questions, then a result", () => {
    const run = runToEnd(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["ai_legal_case"]), (ids) => ids[0]!);
    expect(run.asked[0]).toBe("V5-LAW");
    expect(run.asked.length).toBeGreaterThan(1);
    expect(run.step.status).toBe("complete");
  });

  it("two projects: the openers follow the candidate's SELECTION order (not id, catalog or score order)", () => {
    const ab = runToEnd(
      PROJECT_STRATEGY,
      start(PROJECT_STRATEGY, ["nike_launch", "tiktok_behavior"]),
      (ids) => ids[0]!,
    );
    const ba = runToEnd(
      PROJECT_STRATEGY,
      start(PROJECT_STRATEGY, ["tiktok_behavior", "nike_launch"]),
      (ids) => ids[0]!,
    );
    expect(ab.asked.slice(0, 2)).toEqual(["V5-NIKE", "V5-TIKTOK"]);
    expect(ba.asked.slice(0, 2)).toEqual(["V5-TIKTOK", "V5-NIKE"]);
  });

  it("selection order gives no points: the same opener answers give the same scores in either order", () => {
    const score = (ids: string[]) => {
      const picks: Record<string, string> = { "V5-NIKE": "B", "V5-TIKTOK": "C" };
      let state = start(PROJECT_STRATEGY, ids);
      for (let i = 0; i < 2; i++) {
        const id = asked(journeyStep(PROJECT_STRATEGY, state))!;
        state = answer(PROJECT_STRATEGY, state, id, picks[id]!);
      }
      expect(state.answers).toHaveLength(2);
      return journeyStep(PROJECT_STRATEGY, state)!.state;
    };
    const a = score(["nike_launch", "tiktok_behavior"]);
    const b = score(["tiktok_behavior", "nike_launch"]);
    expect(a.scores).toEqual(b.scores);
    expect(a.support).toEqual(b.support);
  });
});

describe("Spotify → V1 Tech precision carry (no duplicate Q1, no double scoring)", () => {
  const v1Pick = (ids: string[]) => ids[0]!;

  it("the Spotify opener carries into V1 as Q1: V1 continues at Q2 and never asks Q1", () => {
    const state = answer(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["spotify_discovery"]), "V5-SPOTIFY", "B");
    const step = journeyStep(PROJECT_STRATEGY, state)!;
    expect(step.status).toBe("ask");
    expect(step.mode).toBe("precision");
    expect(asked(step)).toBe("Q2");
    expect(step.state.precision?.carriedAnswers).toEqual([{ questionId: "Q1", answerId: "B" }]);
    const run = runToEnd(PROJECT_STRATEGY, state, v1Pick);
    expect(run.asked).not.toContain("Q1");
    const moduleAnswers = run.step.state.precision!.moduleAnswers;
    expect(moduleAnswers.filter((a: RecordedAnswer) => a.questionId === "Q1")).toEqual([
      { questionId: "Q1", answerId: "B" },
    ]);
  });

  it("the same answers give the same V1 result through the V5 Technology world and the V5 Spotify project", () => {
    for (const opener of ["A", "B", "C"]) {
      const world = runToEnd(
        WORLD_STRATEGY,
        answer(WORLD_STRATEGY, start(WORLD_STRATEGY, ["technology_data"]), "WT1", opener),
        v1Pick,
      );
      const project = runToEnd(
        PROJECT_STRATEGY,
        answer(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["spotify_discovery"]), "V5-SPOTIFY", opener),
        v1Pick,
      );
      expect(project.asked, opener).toEqual(world.asked);
      expect(project.step.state.precision!.moduleAnswers, opener).toEqual(world.step.state.precision!.moduleAnswers);
      if (world.step.status !== "complete" || project.step.status !== "complete") throw new Error("incomplete");
      expect(project.step.outcome, opener).toEqual(world.step.outcome);
    }
  });

  it("the result detail shows the candidate's own Spotify answer for the carried Q1 (not V1's Q1 copy)", () => {
    const run = runToEnd(
      PROJECT_STRATEGY,
      answer(PROJECT_STRATEGY, start(PROJECT_STRATEGY, ["spotify_discovery"]), "V5-SPOTIFY", "A"),
      v1Pick,
    );
    if (run.step.status !== "complete") throw new Error("incomplete");
    const view = buildV3ResultView(run.step, run.state.selectedIds, run.state.answers, { strategyId: "projects" });
    expect(view.source).toBe("precision");
    expect(view.chosenHe).toContain("לבנות ולשפר את המערכת");
    // Project mode keeps the company disclaimer (V5 cards name companies as illustrations).
    expect(view.disclaimerHe).not.toBeNull();
  });
});

describe("V5 question views", () => {
  it("renders V5 opener copy, and the borrowed WO2-WO5 / V2 questions with their existing copy", () => {
    let state = start(PROJECT_STRATEGY, ["people_retention"]);
    const opener = journeyStep(PROJECT_STRATEGY, state)!;
    if (opener.status !== "ask") throw new Error("expected a question");
    expect(buildV3QuestionView(opener).prompt).toBe(SPEC[4]!.opener);
    state = answer(PROJECT_STRATEGY, state, "V5-HR", "D");
    const next = journeyStep(PROJECT_STRATEGY, state)!;
    if (next.status !== "ask") throw new Error("expected a question");
    expect(buildV3QuestionView(next).prompt.length).toBeGreaterThan(0);
  });
});

describe("V5 persistence", () => {
  it("has its own key, distinct from V2/V3/V4", () => {
    expect(V5_STORAGE_KEY).toBe("colman-studymatch:v5:journey");
    expect(new Set([DISCOVERY_STORAGE_KEY, V3_STORAGE_KEY, V4_STORAGE_KEY, V5_STORAGE_KEY]).size).toBe(4);
  });

  it("round-trips a V5 projects journey by replay, with flow v5", () => {
    let journey = start(PROJECT_STRATEGY, ["tiktok_behavior", "people_change"]);
    journey = answer(PROJECT_STRATEGY, journey, "V5-TIKTOK", "A");
    const raw = serializeV5Journey({ entryMode: "projects", journey })!;
    expect(JSON.parse(raw)).toMatchObject({ version: 1, flow: "v5", entryMode: "projects" });
    expect(restoreV5Journey(raw)).toEqual({ entryMode: "projects", journey });
  });

  it("never accepts another version's payload, and V4 never accepts V5's", () => {
    const v4Raw = serializeV4Journey({ entryMode: "projects", journey: start(BRAND_STRATEGY, ["wolt_new_city"]) })!;
    expect(restoreV5Journey(v4Raw)).toBeNull();
    const v5Raw = serializeV5Journey({
      entryMode: "projects",
      journey: start(PROJECT_STRATEGY, ["wolt_city_expansion"]),
    })!;
    expect(restoreV4Journey(v5Raw)).toBeNull();
    // A V4/V2 brand id (or a world id) in V5 project mode is invalid.
    const forged = (selectedIds: string[]) =>
      JSON.stringify({ version: 1, flow: "v5", entryMode: "projects", phase: "selecting", selectedIds, answers: [] });
    expect(restoreV5Journey(forged(["wolt_new_city"]))).toBeNull();
    expect(restoreV5Journey(forged(["law_justice"]))).toBeNull();
    expect(restoreV5Journey(forged(["wolt_city_expansion"]))).not.toBeNull();
  });
});

describe("V5 routing rules", () => {
  it("mirror V4: landing until a method exists, then discover / ready / questions / result", () => {
    expect(v5Target(null, initialJourneyState, false)).toBe("landing");
    expect(v5Target("projects", initialJourneyState, false)).toBe("discover");
    const started = start(PROJECT_STRATEGY, ["nike_launch"]);
    expect(v5Target("projects", started, false)).toBe("ready");
    expect(v5Target("projects", started, true)).toBe("questions");
    const done = runToEnd(PROJECT_STRATEGY, started, (ids) => ids[0]!);
    expect(v5Target("projects", done.state, true)).toBe("result");
    expect(v5Allows("start", "discover")).toBe(true);
    expect(v5Allows("discover", "landing")).toBe(true);
    expect(v5Allows("result", "questions")).toBe(false);
  });
});

describe("V5 lead validation (flow-version specific)", () => {
  const base = {
    first_name: "דנה",
    last_name: "לוי",
    phone: "050-1234567",
    consent: true,
    comparison_id: "j-1",
    result_kind: "recommended",
    primary_program_id: "law",
    alternative_programs: [],
  } as const;
  const ok = (body: object) => LeadRequestSchema.safeParse({ ...base, ...body }).success;

  it("accepts a V5 worlds lead and a V5 projects lead", () => {
    expect(
      ok({ flow_version: "v5", entry_mode: "worlds", selected_world_ids: ["law_justice"], selected_project_ids: [] }),
    ).toBe(true);
    expect(
      ok({
        flow_version: "v5",
        entry_mode: "projects",
        selected_project_ids: ["ai_legal_case", "spotify_discovery"],
        selected_world_ids: [],
      }),
    ).toBe(true);
  });

  it("rejects V5-only ids sent as V4, and V4-only ids sent as V5", () => {
    expect(
      ok({
        flow_version: "v4",
        entry_mode: "projects",
        selected_project_ids: ["spotify_discovery"],
        selected_world_ids: [],
      }),
    ).toBe(false);
    expect(
      ok({
        flow_version: "v5",
        entry_mode: "projects",
        selected_project_ids: ["wolt_new_city"],
        selected_world_ids: [],
      }),
    ).toBe(false);
    expect(ok({ selected_project_ids: ["ai_legal_case"] })).toBe(false); // a V2 lead with a V5 id
    // The V4 baseline still accepts its own ids.
    expect(
      ok({
        flow_version: "v4",
        entry_mode: "projects",
        selected_project_ids: ["wolt_new_city"],
        selected_world_ids: [],
      }),
    ).toBe(true);
  });

  it("rejects mixed lists, a missing or mismatched entry mode, and unknown ids", () => {
    const v5 = { flow_version: "v5" };
    expect(
      ok({ ...v5, entry_mode: "projects", selected_project_ids: ["nike_launch"], selected_world_ids: ["law_justice"] }),
    ).toBe(false);
    expect(ok({ ...v5, selected_project_ids: ["nike_launch"], selected_world_ids: [] })).toBe(false);
    expect(ok({ ...v5, entry_mode: "worlds", selected_project_ids: ["nike_launch"], selected_world_ids: [] })).toBe(
      false,
    );
    expect(ok({ ...v5, entry_mode: "projects", selected_project_ids: ["nope"], selected_world_ids: [] })).toBe(false);
  });

  it("builds the V5 request and webhook payload with flow_version v5, entry_mode and both lists", () => {
    const body = buildLeadRequest({
      firstName: "דנה",
      lastName: "לוי",
      phone: "050-1234567",
      consent: true,
      website: "",
      flowVersion: "v5",
      entryMode: "projects",
      comparisonId: "j-1",
      context: { resultKind: "recommended", primaryProgramId: "law", alternatives: [] },
      selectedProjectIds: ["ai_legal_case"],
    });
    expect(body).toMatchObject({
      flow_version: "v5",
      entry_mode: "projects",
      selected_project_ids: ["ai_legal_case"],
      selected_world_ids: [],
    });
    const parsed = LeadRequestSchema.parse(body);
    const payload = buildLeadWebhookPayload(parsed, normalizePhone("050-1234567")!, new Date("2026-10-08T10:00:00Z"));
    expect(payload).toMatchObject({
      flow_version: "v5",
      entry_mode: "projects",
      selected_project_ids: ["ai_legal_case"],
      selected_world_ids: [],
    });
  });
});

describe("V5 analytics (flow_version v5, entry_mode, V5 project ids)", () => {
  function harness(mode: "worlds" | "projects") {
    const host: DataLayerHost = {};
    const tracker = new JourneyTracker({
      host,
      storage: memoryStorage(),
      strategy: strategyForV5EntryMode(mode),
      flowVersion: "v5",
      storageKey: `colman-studymatch:analytics-v5:${mode}`,
      baseParams: { entry_mode: mode },
      uuid: () => `v5-${mode}`,
    });
    tracker.hydrate(null, "");
    const events = () => (host.dataLayer ?? []) as DataLayerEvent[];
    const dispatch = (action: JourneyAction) => {
      tracker.enqueue(action);
      tracker.flush();
    };
    return { tracker, events, dispatch };
  }

  it("project mode emits career_project_* with the new V5 project ids, selection position and entry_mode", () => {
    const h = harness("projects");
    h.tracker.discoveryViewed("v");
    h.dispatch({ type: "toggle_entry", entryId: "nike_launch" });
    h.dispatch({ type: "toggle_entry", entryId: "people_change" });
    h.dispatch({ type: "toggle_entry", entryId: "people_change" });
    h.dispatch({ type: "toggle_entry", entryId: "accounting_gap" });
    h.dispatch({ type: "start" });
    h.dispatch({ type: "record_answer", answer: { questionId: "V5-NIKE", answerId: "A" } });
    const names = h.events().map((e) => e.event);
    expect(names).toEqual(
      expect.arrayContaining([
        "career_project_discovery_view",
        "career_project_selected",
        "career_project_deselected",
        "career_project_selection_completed",
        "question_answer",
      ]),
    );
    expect(names.some((n) => String(n).startsWith("career_world_"))).toBe(false);
    for (const event of h.events()) expect(event).toMatchObject({ flow_version: "v5", entry_mode: "projects" });
    expect(h.events().find((e) => e.event === "career_project_discovery_view")).toMatchObject({
      project_count_available: 10,
    });
    const selected = h.events().filter((e) => e.event === "career_project_selected");
    expect(selected.at(-1)).toMatchObject({ project_id: "accounting_gap", selection_position: 2 });
    expect(h.events().find((e) => e.event === "question_answer")).toMatchObject({
      question_id: "V5-NIKE",
      project_ids: "accounting_gap|nike_launch",
    });
  });

  it("world mode emits career_world_* with flow_version v5 and entry_mode worlds", () => {
    const h = harness("worlds");
    h.tracker.discoveryViewed("v");
    h.dispatch({ type: "toggle_entry", entryId: "law_justice" });
    h.dispatch({ type: "start" });
    const names = h.events().map((e) => e.event);
    expect(names).toEqual(expect.arrayContaining(["career_world_discovery_view", "career_world_selected"]));
    for (const event of h.events()) expect(event).toMatchObject({ flow_version: "v5", entry_mode: "worlds" });
  });
});

describe("V5 copy", () => {
  it("reuses V4's approved start-screen copy and defines the V5 project screen copy", () => {
    expect(V4_COPY.method.headline).toBe("מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?");
    expect(V5_COPY.projects).toEqual({
      headline: "איזה מהפרויקטים האלה הכי מסקרן?",
      support: "אפשר לבחור עד שניים — לפי המשימה שנשמעת הכי מעניינת, לא לפי השם שמופיע עליה.",
    });
  });
});
