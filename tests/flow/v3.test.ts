import { describe, expect, it } from "vitest";
import { PAIR_CONTENT, PROGRAM_MEANING, V2_PROGRAM_IDS, V3_COPY, findPairContent, getSource } from "@/data";
import {
  DISCOVERY_STORAGE_KEY,
  V3_STORAGE_KEY,
  buildLeadRequest,
  buildLeadWebhookPayload,
  buildV2ResultView,
  buildV3ResultView,
  discoveryReducer,
  discoveryStep,
  initialDiscoveryState,
  leadContextFromResult,
  LeadRequestSchema,
  normalizePhone,
  progressTone,
  restoreV3Journey,
  serializeV3Journey,
  v3Progress,
  v3Program,
  restoreDiscovery,
  serializeDiscovery,
  type DiscoveryState,
} from "@/flow";
import { runPersona } from "./v2PersonaRun";
import { V2_PERSONAS } from "./v2Personas";

const persona = (id: string) => V2_PERSONAS.find((candidate) => candidate.id === id)!;

function completed(personaId: string) {
  const { state } = runPersona(persona(personaId));
  const step = discoveryStep(state);
  if (step?.status !== "complete") throw new Error("not complete");
  return { state, step };
}

describe("V3 persistence is isolated from V2", () => {
  const { state } = runPersona(persona("accounting"));

  it("uses its own key and flow marker", () => {
    expect(V3_STORAGE_KEY).toBe("colman-studymatch:v3:journey");
    expect(V3_STORAGE_KEY).not.toBe(DISCOVERY_STORAGE_KEY);
    const stored = JSON.parse(serializeV3Journey(state)!);
    expect(stored).toMatchObject({ version: 1, flow: "v3" });
    expect(Object.keys(stored).sort()).toEqual(["answers", "flow", "phase", "selectedProjectIds", "version"]);
  });

  it("round-trips by replay", () => {
    const restored = restoreV3Journey(serializeV3Journey(state));
    expect(restored).toEqual(state);
  });

  it("never reads a V2 payload as V3 (or the reverse)", () => {
    const v2 = serializeDiscovery(state)!;
    const v3 = serializeV3Journey(state)!;
    expect(restoreV3Journey(v2)).toBeNull();
    expect(restoreDiscovery(v3)).toBeNull();
  });

  it("rejects stale or inconsistent state without throwing", () => {
    for (const raw of [
      "{",
      "[]",
      JSON.stringify({ version: 1, flow: "v3", phase: "answering", selectedProjectIds: ["nope"], answers: [] }),
    ]) {
      expect(restoreV3Journey(raw)).toBeNull();
    }
    expect(restoreV3Journey(null)).toBeNull();
    expect(serializeV3Journey(initialDiscoveryState)).toBeNull();
  });
});

describe("V3 progress", () => {
  it("never shows a question count, only the stage out of three", () => {
    for (const stage of [1, 2, 3] as const) {
      const progress = v3Progress(stage, 4);
      expect(progress.stageLabelHe).toBe(`שלב ${stage} מתוך 3`);
      expect(progress.stageLabelHe + progress.stageNameHe + (progress.toneHe ?? "")).not.toMatch(/שאלה \d|\d+ שאלות/);
    }
    expect(v3Progress(2).stageNameHe).toBe("מדייקים את הכיוון");
  });

  it("derives early / middle / late only from committed answers", () => {
    expect([0, 1].map(progressTone)).toEqual(["early", "early"]);
    expect([2, 3].map(progressTone)).toEqual(["middle", "middle"]);
    expect([4, 7, 11].map(progressTone)).toEqual(["late", "late", "late"]);
    expect(v3Progress(2, 0).toneHe).toBe("כמה שאלות קצרות");
    expect(v3Progress(2, 2).toneHe).toBe("אנחנו כבר מתחילים לראות כיוון");
    expect(v3Progress(2, 5).toneHe).toBe("הכיוון כבר מתחיל להתחדד");
    expect(v3Progress(1).toneHe).toBeNull();
  });
});

describe("V3 progress never promises the end", () => {
  it("has no completion or remaining-effort promise in any tone, at any count", () => {
    const forbidden = /כמעט סיימנו|עוד שאלה|נשאר|בקרוב|סוף/;
    for (let answered = 0; answered <= 12; answered++) {
      const progress = v3Progress(2, answered);
      expect(`${progress.stageNameHe} ${progress.toneHe}`).not.toMatch(forbidden);
    }
    for (const line of [V3_COPY.progress.early, V3_COPY.progress.middle, V3_COPY.progress.late]) {
      expect(line).not.toMatch(forbidden);
    }
  });
});

describe("V3 result view: same engine outcome, new presentation", () => {
  it.each(V2_PERSONAS.map((p) => p.id))("%s: V3 shows exactly the engine/V2 outcome", (id) => {
    const { state, step } = completed(id);
    const v2 = buildV2ResultView(step, state.selectedProjectIds, state.answers);
    const v3 = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    expect(v3.analytics).toEqual(v2.analytics);
    expect(leadContextFromResult(v3.base)).toEqual(leadContextFromResult(v2));
    if (v2.type === "generic") {
      expect(v3.kind).toBe(v2.kind);
      expect(v3.programs.map((p) => p.programId)).toEqual(v2.directions.map((d) => d.programId));
    }
  });

  it("recommended: two or three short meaning bullets that do not echo the literal choices", () => {
    const { state, step } = completed("accounting");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    const [primary] = view.programs;
    expect(view.kind).toBe("recommended");
    expect(primary!.whyHe.length).toBeGreaterThanOrEqual(2);
    expect(primary!.whyHe.length).toBeLessThanOrEqual(3);
    expect(primary!.findHe.length).toBeLessThanOrEqual(3);
    const visible = [primary!.summaryHe, ...primary!.whyHe].join(" ");
    expect(visible).not.toMatch(/בחרתם|TikTok|Nike|Wolt|Spotify|Duolingo|Apple/);
    // The literal choices stay available, but only for the collapsed detail.
    expect(view.chosenHe.length).toBeGreaterThan(0);
    for (const chosen of view.chosenHe) expect(primary!.whyHe).not.toContain(chosen);
  });

  it("a negative reality note is important (never collapsed); the rest is detail", () => {
    const { state, step } = completed("accounting");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    for (const note of view.notes) expect(note.important).toBe(note.level === "negative");
  });

  it("near tie: both programs symmetric in catalog order, no winner, with a pair block", () => {
    const { state, step } = completed("business_vs_economics");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    expect(view.kind).toBe("near_tie");
    const order = view.programs.map((p) => V2_PROGRAM_IDS.indexOf(p.programId));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(view.pair?.curated).toBe(true);
    expect(view.pair?.guidance).toHaveLength(2);
  });

  it("insufficient evidence: no recommendation and at most one weak direction", () => {
    const { state, step } = completed("insufficient");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    expect(view.kind).toBe("insufficient_positive_evidence");
    expect(view.programs.length).toBeLessThanOrEqual(1);
  });

  it("Tech precision is presented through V3 with the same top program as the engine", () => {
    const { state, step } = completed("focused_tech");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    expect(view.source).toBe("precision");
    expect(view.programs[0]?.programId).toBe(persona("focused_tech").expect.programs[0]);
  });

  it("links to the verified all-programs page from the source registry (no invented URL)", () => {
    const { state, step } = completed("accounting");
    const view = buildV3ResultView(step, state.selectedProjectIds, state.answers);
    expect(view.allProgramsUrl).toBe(getSource("colman_ba_programs_index")?.url);
    expect(view.allProgramsUrl).toMatch(/^https:\/\/www\.colman\.ac\.il\//);
  });
});

describe("V3 curated copy", () => {
  it("has three meaning lines and a summary for every one of the 14 programs, with no numbers or scores", () => {
    expect(V2_PROGRAM_IDS).toHaveLength(14);
    for (const id of V2_PROGRAM_IDS) {
      const meaning = PROGRAM_MEANING[id]!;
      expect(meaning, id).toBeDefined();
      expect(meaning.whyHe).toHaveLength(3);
      expect([meaning.summaryHe, ...meaning.whyHe].join(" ")).not.toMatch(/\d|%|ציון|התאמה של/);
      expect(v3Program(id, 3).findHe.length).toBeGreaterThan(0);
    }
  });

  it("curates the four requested pairs, in either argument order, and falls back otherwise", () => {
    const wanted: Array<[string, string]> = [
      ["communication", "communication_and_management"],
      ["computer_science", "data_science"],
      ["business_administration", "economics_and_management"],
      ["psychology", "behavioral_science"],
    ];
    for (const [a, b] of wanted) {
      expect(findPairContent(a as never, b as never), `${a}|${b}`).not.toBeNull();
      expect(findPairContent(b as never, a as never)).not.toBeNull();
    }
    expect(PAIR_CONTENT).toHaveLength(4);
    expect(findPairContent("law", "accounting")).toBeNull();
  });

  it("positions Behavioral Science around groups and organizations, and Psychology around the individual", () => {
    const behavioral = PROGRAM_MEANING.behavioral_science!;
    expect(behavioral.summaryHe).toBe(
      "מתאים למי שרוצה להבין איך קבוצות, ארגונים והסביבה החברתית משפיעים על הדרך שבה אנשים מתנהגים.",
    );
    expect(behavioral.whyHe.join(" ")).toMatch(/קבוצות/);
    expect(behavioral.whyHe.join(" ")).toMatch(/תרבות/);
    // It must no longer read as behavioral economics / individual decision-making.
    expect(behavioral.summaryHe + behavioral.whyHe.join(" ")).not.toMatch(/החלטות|נתונים|מחקר|השערות/);

    const pair = findPairContent("behavioral_science", "psychology")!;
    expect(pair.programs).toEqual(["psychology", "behavioral_science"]);
    expect(pair.bullets[0]).toEqual(["האדם עצמו", "רגשות, מחשבות ומוטיבציה", "איך אדם חושב ומתנהג"]);
    expect(pair.bullets[1]).toEqual(["קבוצות וארגונים", "תרבות, יחסים ונורמות", "איך הסביבה החברתית משפיעה על אנשים"]);
    expect(pair.guidance.map((g) => [g.programId, g.ifHe])).toEqual([
      ["psychology", "אם מושך אתכם להבין אדם לעומק: מה הוא מרגיש, חושב ולמה הוא פועל כך"],
      ["behavioral_science", "אם מושך אתכם להבין אנשים בתוך קבוצות, ארגונים וסביבות חברתיות"],
    ]);
  });

  it("the COLMAN section describes the type of work, not curriculum", () => {
    expect(V3_COPY.result.colmanTitle).toBe("לאיזה סוג עשייה המסלול מתחבר?");
    expect(V3_COPY.result.colmanExamples).toBe("דוגמאות למה שאפשר לעשות בתחום:");
    expect(V3_COPY.result.colmanTitle + V3_COPY.result.colmanExamples).not.toMatch(
      /תמצאו|קורסים|לימודים|תוכנית הלימודים/,
    );
  });

  it("uses the agreed Communication guidance wording", () => {
    const pair = findPairContent("communication", "communication_and_management")!;
    expect(pair.guidance.map((g) => g.ifHe)).toEqual([
      "אם מושך אתכם בעיקר ליצור ולהשפיע דרך תוכן",
      "אם מושך אתכם לחבר תקשורת להחלטות ולביצועים של ארגון",
    ]);
  });

  it("carries the agreed landing, discovery, transition and result copy", () => {
    expect(V3_COPY.landing.headline).toBe("איזה תחום לימודים יכול להתאים לכם?");
    expect(V3_COPY.landing.cta).toBe("בואו נמצא את הכיוון שלכם");
    expect(V3_COPY.discovery.headline).toBe("באיזה פרויקט הייתם הכי רוצים להשתתף?");
    expect(V3_COPY.discovery.limit).toBe("אפשר לבחור עד שני פרויקטים. בטלו בחירה אחת כדי לבחור אחרת.");
    expect(V3_COPY.transition.cta).toBe("לשאלה הראשונה");
    expect(V3_COPY.companyLabels.ai_feature_privacy).toBe("AI");
    expect(V3_COPY.result.programCta).toBe("הכירו את המסלול במכללה");
    expect(V3_COPY.result.contactCta).toBe("דברו איתנו על המסלול");
  });
});

describe("explicit Continue: committing is the only thing that records an answer", () => {
  it("engine equivalence: the same committed answers give the same outcome whichever UI commits them", () => {
    const { state } = completed("accounting");
    // V2 auto-advance and V3 select-then-continue both end up as record_answer actions in the same order.
    let replay: DiscoveryState = discoveryReducer(
      state.selectedProjectIds.reduce(
        (s, projectId) => discoveryReducer(s, { type: "toggle_project", projectId }),
        initialDiscoveryState,
      ),
      { type: "start" },
    );
    for (const answer of state.answers) replay = discoveryReducer(replay, { type: "record_answer", answer });
    expect(replay).toEqual(state);
  });
});

describe("lead flow_version", () => {
  const { state, step } = completed("business_vs_economics");
  const context = leadContextFromResult(buildV3ResultView(step, state.selectedProjectIds, state.answers).base);
  const base = {
    firstName: "דנה",
    lastName: "לוי",
    phone: "0501234567",
    consent: true,
    website: "",
    comparisonId: "j-1",
    context,
    selectedProjectIds: state.selectedProjectIds,
  };
  const payloadOf = (flowVersion?: "v2" | "v3") => {
    const request = LeadRequestSchema.parse(buildLeadRequest({ ...base, flowVersion }));
    return {
      request,
      payload: buildLeadWebhookPayload(request, normalizePhone("0501234567")!, new Date("2026-10-08T00:00:00Z")),
    };
  };

  it("V3 leads are tagged v3, V2 leads v2, and an untagged request stays v2", () => {
    expect(payloadOf("v3").payload.flow_version).toBe("v3");
    expect(payloadOf("v2").payload.flow_version).toBe("v2");
    expect(payloadOf().payload.flow_version).toBe("v2");
    expect(buildLeadRequest({ ...base, flowVersion: "v3" })).toMatchObject({ flow_version: "v3" });
    expect(buildLeadRequest(base)).not.toHaveProperty("flow_version");
  });

  it("rejects an unknown flow version", () => {
    expect(LeadRequestSchema.safeParse({ ...buildLeadRequest(base), flow_version: "v9" }).success).toBe(false);
  });

  it("the payload is otherwise identical for V2 and V3 (the n8n contract does not change)", () => {
    const strip = (payload: object) => {
      const copy: Record<string, unknown> = { ...payload };
      delete copy.flow_version;
      return copy;
    };
    const v2 = strip(payloadOf("v2").payload);
    const v3 = strip(payloadOf("v3").payload);
    expect(v3).toEqual(v2);
    expect(Object.keys(payloadOf("v3").payload).sort()).toEqual(Object.keys(payloadOf("v2").payload).sort());
  });
});
