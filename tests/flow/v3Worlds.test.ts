import { describe, expect, it } from "vitest";
import {
  CAREER_PROJECTS,
  V2_PROGRAM_IDS,
  V3_WORLD_CLUSTERS,
  V3_WORLD_PROVENANCE,
  V3_WORLDS,
  getWorldQuestionCopy,
} from "@/data";
import { V2_WEIGHTS, type RecordedAnswer, type V2Step } from "@/engine";
import {
  buildLeadRequest,
  buildLeadWebhookPayload,
  buildV3QuestionView,
  initialJourneyState,
  journeyReducer,
  leadContextFromResult,
  LeadRequestSchema,
  nextDiscoveryStep,
  normalizePhone,
  WORLD_STRATEGY,
} from "@/flow";
import { runV3Persona } from "./v3PersonaRun";
import { V3_PERSONAS } from "./v3Personas";

const step = (worlds: string[], answers: RecordedAnswer[] = []): V2Step => WORLD_STRATEGY.nextStep(worlds, answers);
const askedId = (s: V2Step) =>
  s.status !== "ask" ? null : s.mode === "precision" ? s.question.id : s.question.question.id;
const ans = (questionId: string, answerId: string): RecordedAnswer => ({ questionId, answerId });
const BRANDS = /Spotify|Wolt|TikTok|Nike|Duolingo|Apple|ספוטיפיי|וולט|טיקטוק|נייקי|דואולינגו|אפל/i;

const EXPECTED_WORLDS: Array<[string, string, string, string]> = [
  [
    "technology_data",
    "טכנולוגיה ודאטה",
    "צוות מוצר דיגיטלי",
    "לבנות מוצר, להבין את הנתונים ולגרום לטכנולוגיה לפתור בעיה אמיתית.",
  ],
  [
    "business_markets",
    "עסקים ושווקים",
    "חברה בצמיחה",
    "להחליט לאן העסק הולך, באיזה שוק לפעול ואיך הופכים הזדמנות למהלך אמיתי.",
  ],
  [
    "communication_influence",
    "תקשורת והשפעה",
    "סטודיו תוכן וקמפיינים",
    "לקחת רעיון ולהפוך אותו למסר שאנשים רואים, זוכרים ופועלים לפיו.",
  ],
  [
    "people_psychology",
    "אנשים ופסיכולוגיה",
    "קליניקה / מרכז שעובד עם אנשים",
    "להבין מה עובר על אנשים, מה משפיע עליהם ואיך שינוי קורה.",
  ],
  [
    "people_organizations",
    "אנשים בארגונים",
    "מחלקת People / HR",
    "להבין מה גורם לאנשים להצטרף, להישאר, להתפתח ולעבוד טוב יחד.",
  ],
  [
    "education_future",
    "חינוך ודור העתיד",
    "בית ספר / מסגרת חינוכית",
    "לעזור לגדל את דור העתיד ולמצוא דרכים שבהן ילדים ואנשים לומדים ומתפתחים.",
  ],
  [
    "law_justice",
    "משפט וצדק",
    "משרד עורכי דין / מערכת המשפט",
    "לקחת מקרה מורכב, להבין מה החוק אומר ולבנות עמדה שאפשר להגן עליה.",
  ],
  [
    "finance_accounting",
    "כסף וחשבונאות",
    "משרד רואי חשבון / מחלקת כספים",
    "להבין מה המספרים באמת אומרים ולגלות כשמשהו לא מסתדר.",
  ],
  [
    "design_spaces",
    "עיצוב וחללים",
    "סטודיו לעיצוב",
    "לקחת חלל ולגרום לו להיות יפה, שימושי ומשמעותי עבור האנשים שנמצאים בו.",
  ],
];

/** The scenario answer -> program mapping exactly as specified. */
const EXPECTED_SCENARIOS: Record<string, { id: string; options: Record<string, string> }> = {
  technology_data: {
    id: "WT1",
    options: { A: "computer_science", B: "data_science", C: "management_information_systems" },
  },
  business_markets: {
    id: "WB1",
    options: { A: "business_administration", B: "economics_and_management", C: "economics_and_psychology" },
  },
  communication_influence: {
    id: "WC1",
    options: { A: "communication", B: "communication_and_management", C: "business_administration" },
  },
  people_psychology: { id: "WP1", options: { A: "psychology", B: "behavioral_science", C: "education" } },
  people_organizations: {
    id: "WO1",
    options: {
      A: "behavioral_science",
      B: "economics_and_psychology",
      C: "business_administration",
      D: "management_information_systems",
    },
  },
  education_future: { id: "WE1", options: { A: "education", B: "psychology", C: "behavioral_science" } },
  law_justice: { id: "WL1", options: { A: "law", B: "business_administration", C: "communication" } },
  finance_accounting: {
    id: "WF1",
    options: { A: "accounting", B: "economics_and_management", C: "business_administration" },
  },
  design_spaces: { id: "WD1", options: { A: "interior_design", B: "communication", C: "business_administration" } },
};

describe("the nine V3 worlds", () => {
  it("are exactly the specified world cards, in order, with no company or brand", () => {
    expect(V3_WORLDS.map((w) => [w.id, w.titleHe, w.contextHe, w.lineHe])).toEqual(EXPECTED_WORLDS);
    for (const world of V3_WORLDS) {
      expect(`${world.titleHe} ${world.contextHe} ${world.lineHe}`).not.toMatch(BRANDS);
      expect(CAREER_PROJECTS.map((p) => p.id)).not.toContain(world.id);
    }
    expect(WORLD_STRATEGY.entryIds).toEqual(EXPECTED_WORLDS.map(([id]) => id));
  });

  it("open with the specified scenario and answer mapping (no neutral on an opener)", () => {
    for (const world of V3_WORLDS) {
      const expected = EXPECTED_SCENARIOS[world.id]!;
      const cluster = V3_WORLD_CLUSTERS.find((c) => c.questions[0]?.projectIds?.includes(world.id))!;
      const opener = cluster.questions[0]!;
      expect(opener.id, world.id).toBe(expected.id);
      expect(opener.kind).toBe("scenario");
      expect(Object.fromEntries(opener.options.map((o) => [o.id, o.programIds.join("+")]))).toEqual(expected.options);
      expect(opener.options.every((o) => o.programIds.length === 1)).toBe(true);
      expect(getWorldQuestionCopy(expected.id)?.prompt).toBeTruthy();
    }
    expect(getWorldQuestionCopy("WT1")?.prompt).toBe(
      "מוצר דיגיטלי חשוב לא עובד מספיק טוב. איפה הייתם הכי רוצים להיכנס?",
    );
  });

  it("keep the People & Psychology wording about understanding and development, never treatment or diagnosis", () => {
    const copy = getWorldQuestionCopy("WP1")!;
    const text = [copy.prompt, ...copy.options.map((o) => o.label)].join(" ");
    expect(text).not.toMatch(/לטפל|לאבחן|מטפל|טיפול|אבחון/);
  });

  it("carry provenance for the five Academy pages used to validate the framing (paraphrased, no copied text)", () => {
    expect(V3_WORLD_PROVENANCE.map((p) => p.programId).sort()).toEqual(
      ["accounting", "behavioral_science", "economics_and_psychology", "education", "law"].sort(),
    );
    for (const entry of V3_WORLD_PROVENANCE) expect(entry.url).toMatch(/^https:\/\/www\.academy\.org\.il\/ba\//);
  });
});

describe("routing: the opening world choice is routing only", () => {
  it("selecting worlds gives 0 points and 0 support; the first step is the world's own scenario", () => {
    for (const world of V3_WORLDS) {
      const s = step([world.id]);
      expect(s.status).toBe("ask");
      expect(askedId(s)).toBe(EXPECTED_SCENARIOS[world.id]!.id);
      expect(Object.values(s.state.scores).every((v) => v === 0)).toBe(true);
      expect(Object.values(s.state.support).every((v) => v === 0)).toBe(true);
      expect(s.state.scoredAnswerCount).toBe(0);
      expect(s.state.candidatePoolProgramIds).toEqual([...world.coreProgramIds, ...world.adjacentProgramIds]);
    }
  });

  it("a scenario answer gives the existing scenario weight (+3) to exactly its program", () => {
    const s = step(["business_markets"], [ans("WB1", "B")]);
    expect(V2_WEIGHTS.scenario).toBe(3);
    expect(s.state.scores.economics_and_management).toBe(3);
    expect(s.state.support.economics_and_management).toBe(1);
    expect(Object.entries(s.state.scores).filter(([, v]) => v > 0)).toHaveLength(1);
  });

  it("two worlds ask BOTH opening scenarios, in the candidate's selection order, before any focus question", () => {
    const first = step(["law_justice", "business_markets"]);
    expect(askedId(first)).toBe("WL1"); // "law" sorts after "business": order is the candidate's, not the ids'
    const second = step(["law_justice", "business_markets"], [ans("WL1", "A")]);
    expect(askedId(second)).toBe("WB1");
    const third = step(["law_justice", "business_markets"], [ans("WL1", "A"), ans("WB1", "B")]);
    expect(third.status).toBe("ask");
    if (third.status === "ask" && third.mode === "generic") {
      expect(["separates_leaders", "generic_focus"]).toContain(third.reason);
    }
    expect(askedId(step(["business_markets", "law_justice"]))).toBe("WB1");
  });

  it("selection order gives no points: the same answers in either order give the same scores", () => {
    const a = step(["law_justice", "business_markets"], [ans("WL1", "A"), ans("WB1", "B")]);
    const b = step(["business_markets", "law_justice"], [ans("WB1", "B"), ans("WL1", "A")]);
    expect(a.state.scores).toEqual(b.state.scores);
    expect(a.state.support).toEqual(b.state.support);
  });

  it("a shared authored question is never asked twice when both worlds borrow it", () => {
    for (const persona of V3_PERSONAS) {
      const { asked } = runV3Persona(persona);
      expect(new Set(asked).size, persona.id).toBe(asked.length);
    }
  });

  it("people_psychology + education_future (both borrow the People questions) never repeat one", () => {
    const worlds = ["people_psychology", "education_future"];
    const answers: RecordedAnswer[] = [];
    for (let guard = 0; guard < 20; guard++) {
      const s = step(worlds, answers);
      if (s.status !== "ask") break;
      const id = askedId(s)!;
      expect(answers.map((a) => a.questionId)).not.toContain(id);
      const options = s.mode === "precision" ? s.question.options : s.question.question.options;
      answers.push(ans(id, options[0]!.id));
    }
  });
});

describe("Tech precision handoff", () => {
  it("Technology & Data hands the CS / DS / MIS room to the unchanged V1 module after the world scenario", () => {
    const s = step(["technology_data"], [ans("WT1", "B")]);
    expect(s.status === "ask" && s.mode === "precision").toBe(true);
    if (s.status === "ask" && s.mode === "precision") {
      expect(s.moduleId).toBe("v1_tech");
      expect(s.question.id).toBe("Q2"); // the world scenario was carried in as V1 Q1
      expect(s.state.precision?.carriedAnswers).toEqual([ans("Q1", "B")]);
      expect(s.state.precision?.programIds).toEqual([
        "computer_science",
        "data_science",
        "management_information_systems",
      ]);
    }
  });

  it("never asks V1 Q1 (whose copy names a brand) in V3, on any persona or Tech pair", () => {
    for (const persona of V3_PERSONAS) expect(runV3Persona(persona).asked, persona.id).not.toContain("Q1");
    for (const other of V3_WORLDS.filter((w) => w.id !== "technology_data")) {
      const answers: RecordedAnswer[] = [];
      for (let guard = 0; guard < 25; guard++) {
        const s = step(["technology_data", other.id], answers);
        if (s.status !== "ask") break;
        const id = askedId(s)!;
        expect(id, other.id).not.toBe("Q1");
        const options = s.mode === "precision" ? s.question.options : s.question.question.options;
        answers.push(ans(id, options[0]!.id));
      }
    }
  });

  it("gives the same V1 result as the V2 Spotify journey for the same Tech answers (V1 untouched)", () => {
    const v1Answers = [ans("Q2", "A"), ans("Q3", "1"), ans("CSDS-1", "cs"), ans("CSDS-2", "cs")];
    const walk = (first: RecordedAnswer, run: (answers: RecordedAnswer[]) => V2Step) => {
      const answers = [first];
      let s = run(answers);
      for (const answer of v1Answers) {
        if (s.status !== "ask") break;
        if (askedId(s) !== answer.questionId) break;
        answers.push(answer);
        s = run(answers);
      }
      return s;
    };
    const v3 = walk(ans("WT1", "A"), (answers) => step(["technology_data"], answers));
    const v2 = walk(ans("Q1", "A"), (answers) =>
      nextDiscoveryStep({ selectedProjectIds: ["spotify_discover_weekly"], answers }),
    );
    expect(v3.status).toBe(v2.status);
    if (v3.status === "complete" && v2.status === "complete") expect(v3.outcome).toEqual(v2.outcome);
    else expect(askedId(v3)).toBe(askedId(v2));
  });

  it("renders the world copy for the Tech opener (no brand) and V1 copy afterwards", () => {
    const opener = step(["technology_data"]);
    if (opener.status !== "ask") throw new Error("expected a question");
    const view = buildV3QuestionView(opener);
    expect(view.prompt).not.toMatch(BRANDS);
    expect(view.options.map((o) => o.label)).toEqual([
      "לבנות או לתקן את הפיצ'ר והמערכת",
      "לפתוח את הנתונים ולגלות מה גורם לבעיה",
      "להבין את הצורך העסקי ולשנות את המערכת או התהליך",
    ]);
  });
});

describe("acceptance personas (engine level)", () => {
  it.each(V3_PERSONAS.map((p) => [p.id, p] as const))("%s", (_id, persona) => {
    const { step: end, view } = runV3Persona(persona);
    if (persona.expect.kind === "precision") {
      expect(end.outcome.kind).toBe("precision");
      if (end.outcome.kind === "precision") expect(end.outcome.result.bestFitProgram).toBe(persona.expect.programs[0]);
    } else {
      expect(view.kind).toBe(persona.expect.kind);
      expect(view.programs.map((p) => p.programId)).toEqual(persona.expect.programs);
    }
    // No V3 result text refers to companies, brands or projects.
    const text = JSON.stringify({ ...view, base: undefined, analytics: undefined });
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(/פרויקט/);
    expect(view.disclaimerHe).toBeNull();
  });
});

describe("14-program coverage audit", () => {
  it("every program has a NATURAL V3 path: a world opening scenario answer that points straight to it", () => {
    const natural = new Map<string, string[]>();
    for (const world of V3_WORLDS) {
      for (const [option, programId] of Object.entries(EXPECTED_SCENARIOS[world.id]!.options)) {
        natural.set(programId, [...(natural.get(programId) ?? []), `${EXPECTED_SCENARIOS[world.id]!.id}=${option}`]);
      }
    }
    const missing = V2_PROGRAM_IDS.filter((id) => !natural.has(id));
    expect(missing).toEqual([]);
    expect(V2_PROGRAM_IDS).toHaveLength(14);
    if (process.env.CALIBRATION_REPORT) {
      console.table(
        V2_PROGRAM_IDS.map((id) => ({
          program: id,
          core_in: V3_WORLDS.filter((w) => w.coreProgramIds.includes(id))
            .map((w) => w.id)
            .join(", "),
          adjacent_in: V3_WORLDS.filter((w) => w.adjacentProgramIds.includes(id))
            .map((w) => w.id)
            .join(", "),
          opening_answers: (natural.get(id) ?? []).join(", "),
        })),
      );
    }
  });
});

describe("V2 stays brand-led", () => {
  it("still has the seven brand projects and its own openers", () => {
    expect(CAREER_PROJECTS.map((p) => p.id)).toEqual([
      "spotify_discover_weekly",
      "wolt_new_city",
      "tiktok_endless_scroll",
      "duolingo_persistence",
      "nike_israel_launch",
      "ai_feature_privacy",
      "apple_store_space",
    ]);
    const s = nextDiscoveryStep({ selectedProjectIds: ["wolt_new_city"], answers: [] });
    expect(askedId(s)).toBe("B1");
    expect(askedId(nextDiscoveryStep({ selectedProjectIds: ["spotify_discover_weekly"], answers: [] }))).toBe("Q1");
  });

  it("the world strategy rejects brand ids and the reducer ignores them", () => {
    expect(WORLD_STRATEGY.isValidSelection(["wolt_new_city"])).toBe(false);
    const state = journeyReducer(WORLD_STRATEGY, initialJourneyState, {
      type: "toggle_entry",
      entryId: "wolt_new_city",
    });
    expect(state).toBe(initialJourneyState);
  });
});

describe("lead: world selections travel as selected_world_ids", () => {
  const persona = V3_PERSONAS.find((p) => p.id === "communication_then_people")!;
  const { state, view } = runV3Persona(persona);
  const base = {
    firstName: "דנה",
    lastName: "לוי",
    phone: "0501234567",
    consent: true,
    website: "",
    comparisonId: "j-1",
    context: leadContextFromResult(view.base),
  };

  it("a V3 lead sends selected_world_ids and an empty selected_project_ids", () => {
    const body = buildLeadRequest({
      ...base,
      flowVersion: "v3",
      selectedProjectIds: [],
      selectedWorldIds: state.selectedIds,
    });
    expect(body).toMatchObject({
      flow_version: "v3",
      selected_project_ids: [],
      selected_world_ids: ["communication_influence", "people_psychology"],
    });
    const request = LeadRequestSchema.parse(body);
    const payload = buildLeadWebhookPayload(request, normalizePhone("0501234567")!, new Date("2026-10-08T00:00:00Z"));
    expect(payload.selected_world_ids).toEqual(["communication_influence", "people_psychology"]);
    expect(payload.selected_project_ids).toEqual([]);
    expect(payload.flow_version).toBe("v3");
  });

  it("a V2 lead is unchanged: projects only, no selected_world_ids anywhere", () => {
    const body = buildLeadRequest({ ...base, flowVersion: "v2", selectedProjectIds: ["wolt_new_city"] });
    expect(body).not.toHaveProperty("selected_world_ids");
    const payload = buildLeadWebhookPayload(
      LeadRequestSchema.parse(body),
      normalizePhone("0501234567")!,
      new Date("2026-10-08T00:00:00Z"),
    );
    expect(payload).not.toHaveProperty("selected_world_ids");
    expect(payload.selected_project_ids).toEqual(["wolt_new_city"]);
  });

  it("rejects world ids in the project field, unknown worlds, mixed selections and worlds outside V3", () => {
    const v3 = buildLeadRequest({
      ...base,
      flowVersion: "v3",
      selectedProjectIds: [],
      selectedWorldIds: ["law_justice"],
    });
    expect(LeadRequestSchema.safeParse(v3).success).toBe(true);
    expect(
      LeadRequestSchema.safeParse({ ...v3, selected_project_ids: ["law_justice"], selected_world_ids: [] }).success,
    ).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...v3, selected_world_ids: ["spotify_discover_weekly"] }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...v3, selected_project_ids: ["wolt_new_city"] }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...v3, flow_version: "v2" }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...v3, selected_world_ids: [] }).success).toBe(false);
  });
});
