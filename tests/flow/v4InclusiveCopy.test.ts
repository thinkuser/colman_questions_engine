import { describe, expect, it } from "vitest";
import {
  DISCOVERY_OPENING,
  NEUTRAL_OPTION_HE,
  PAIR_CONTENT,
  PROGRAM_MEANING,
  V2_LEAD_COPY,
  V2_PROGRAM_CATALOG,
  V2_RESULT_COPY,
  V3_COPY,
  V3_WORLD_OPENING,
  V4_COPY,
  V4_LEAD_COPY,
  V4_TEXT_OVERRIDES,
  V4_UI_COPY,
  v4Text,
} from "@/data";
import clusters from "@/data/content/discovery/clusters.json";
import careerProjects from "@/data/content/discovery/career_projects.json";
import worlds from "@/data/content/discovery/v3_worlds.json";
import v1Questions from "@/data/content/question_copy_he.json";
import evidence from "@/data/content/result_copy/evidence.json";
import resultPrograms from "@/data/content/result_copy/programs.json";
import {
  BRAND_STRATEGY,
  WORLD_STRATEGY,
  buildV3QuestionView,
  buildV3ResultView,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  v3Progress,
  type DiscoveryStrategy,
  type JourneyState,
} from "@/flow";
import { masculineHits } from "./inclusiveScan";

/**
 * V4 gender-inclusive copy (DEC-036). V4 renders the shared V3 screens and the shared content through a thin
 * presentation layer (`V4_UI_COPY`, `V4_LEAD_COPY`, `v4Text`). These tests keep that layer honest:
 *  - every override key is a live shared-content string (a content edit cannot leave a stale, silently unused key);
 *  - the whole V4-renderable surface is free of masculine-only candidate address;
 *  - V2/V3 copy, the legal consent text, ids and mappings are untouched.
 */

/** Every Hebrew string in a value (functions are called with a sample argument). */
function strings(value: unknown, skip: (key: string) => boolean = () => false): string[] {
  if (typeof value === "string") return /[א-ת]/.test(value) ? [value] : [];
  if (typeof value === "function") {
    const out = (value as (...args: unknown[]) => unknown)(2, "שם המסלול");
    return typeof out === "string" ? [out] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, skip));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) => (skip(key) ? [] : strings(item, skip)));
  return [];
}

const META_KEYS = (key: string) => key === "status_note" || key === "doc_refs" || key === "notes";

/** All shared-content strings V4 can render (V2-only text such as the V2 projects opening is excluded). */
const SHARED_CONTENT: readonly string[] = [
  ...strings(worlds, META_KEYS),
  ...strings((clusters as { clusters: unknown }).clusters, META_KEYS),
  ...strings((careerProjects as { projects: unknown }).projects, META_KEYS),
  DISCOVERY_OPENING.brandDisclaimer,
  ...strings(v1Questions, META_KEYS),
  NEUTRAL_OPTION_HE,
  ...strings(PROGRAM_MEANING),
  ...strings(PAIR_CONTENT),
  ...V2_PROGRAM_CATALOG.flatMap((program) => program.workStatementsHe),
  ...strings((evidence as { answers: unknown }).answers),
  ...Object.values(resultPrograms.programs).flatMap((program) =>
    Object.values((program as { reality_checks?: Record<string, { body_he: string }> }).reality_checks ?? {}).map(
      (check) => check.body_he,
    ),
  ),
  V2_RESULT_COPY.generatedFocusPrompt,
  ...strings(V2_RESULT_COPY.reality.heading),
  V2_RESULT_COPY.reality.negativeNote,
  V3_WORLD_OPENING.prompt,
  V3_WORLD_OPENING.helper,
  // Component literal (landing expectations list aria-label).
  "מה מחכה לכם",
];

/** V4's own copy: the screen copy, the V4-only copy and the lead copy (the legal consent text is checked separately). */
const V4_OWN_COPY: readonly string[] = [
  ...strings(V4_UI_COPY),
  ...strings(V4_COPY),
  ...strings(V4_LEAD_COPY, (key) => key === "consent"),
];

describe("V4 gender-inclusive copy: the override layer", () => {
  it("every override key is live shared content (no stale keys) and every value actually changes the text", () => {
    const live = new Set(SHARED_CONTENT);
    const stale = [...V4_TEXT_OVERRIDES.keys()].filter((key) => !live.has(key));
    expect(stale).toEqual([]);
    for (const [original, rewritten] of V4_TEXT_OVERRIDES) expect(rewritten).not.toBe(original);
  });

  it("v4Text rewrites overridden strings and leaves everything else as is", () => {
    expect(v4Text("איזה מעולמות העשייה האלה הכי מסקרן אתכם?")).toBe("איזה מעולמות העשייה האלה הכי מסקרן אותך?");
    expect(v4Text("טכנולוגיה ודאטה")).toBe("טכנולוגיה ודאטה");
  });

  it("the scan itself catches masculine-only address (guards against a vacuous regression test)", () => {
    for (const sample of [
      "בחרו עד שניים",
      "מה מעניין אתכם?",
      "חשוב לכם",
      "אמרתם ש",
      "בואו נמשיך",
      "בסוף תקבלו כיוון",
      "מתאים למי שאוהב דיוק",
      "מי שמבין לעומק",
      "יש לאשר את הסכמתכם",
    ])
      expect(masculineHits(sample), sample).not.toEqual([]);
    for (const sample of ["בוחרים מה מסקרן אותך", "לבדוק אם זה סתם מקרה", "אפשר לבחור", "היית רוצה", "עצרת"])
      expect(masculineHits(sample), sample).toEqual([]);
  });
});

describe("V4 gender-inclusive copy: the whole V4 surface", () => {
  it("no masculine-only candidate address in V4's own copy (screens, method screen, lead form)", () => {
    const offending = V4_OWN_COPY.filter((text) => masculineHits(text).length > 0);
    expect(offending).toEqual([]);
  });

  it("no masculine-only candidate address in any shared content as V4 renders it", () => {
    const offending = SHARED_CONTENT.map(v4Text).filter((text) => masculineHits(text).length > 0);
    expect(offending).toEqual([]);
  });

  it("the progress header renders V4's stage names and encouragements (not V3's)", () => {
    const rendered = ([1, 2, 3] as const).flatMap((stage) =>
      [0, 1, 2, 3, 4, 5].flatMap((answers) => {
        const progress = v3Progress(stage, answers, V4_UI_COPY.progress);
        return [progress.stageLabelHe, progress.stageNameHe, progress.toneHe ?? ""];
      }),
    );
    expect(rendered).toContain("בוחרים מה מסקרן אותך");
    expect(rendered).toContain("הכיוון שלך");
    expect(rendered.filter((text) => masculineHits(text).length > 0)).toEqual([]);
    // V3's default stays the approved V3 wording.
    expect(v3Progress(1).stageNameHe).toBe("בוחרים מה מסקרן אתכם");
  });

  it("V4 screen copy keeps exactly the V3 copy structure (a thin wording layer, not a fork)", () => {
    const shape = (value: unknown): unknown =>
      typeof value === "function"
        ? "fn"
        : Array.isArray(value)
          ? value.map(shape)
          : value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]))
            : typeof value;
    expect(shape(V4_UI_COPY)).toEqual(shape(V3_COPY));
    expect(shape(V4_LEAD_COPY)).toEqual(shape(V2_LEAD_COPY));
  });
});

describe("V4 gender-inclusive copy: rendered journeys", () => {
  type Option = { id: string; isNeutral: boolean };
  type Policy = (options: readonly Option[], turn: number) => string;
  const POLICIES: Record<string, Policy> = {
    first: (options) => options[0]!.id,
    second: (options) => options[Math.min(1, options.length - 1)]!.id,
    last: (options) => options[options.length - 1]!.id,
    rotating: (options, turn) => options[turn % options.length]!.id,
    // "None of these" whenever offered: reaches the insufficient-evidence result.
    neutral: (options) => (options.find((option) => option.isNeutral) ?? options[options.length - 1]!).id,
  };
  const resultKinds = new Set<string>();

  function walk(strategy: DiscoveryStrategy, selection: readonly string[], policy: Policy): string[] {
    let state: JourneyState = selection.reduce(
      (current, entryId) => journeyReducer(strategy, current, { type: "toggle_entry", entryId }),
      initialJourneyState,
    );
    state = journeyReducer(strategy, state, { type: "start" });
    const rendered: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const step = journeyStep(strategy, state);
      if (step?.status !== "ask") break;
      const view = buildV3QuestionView(step, v4Text);
      rendered.push(view.prompt, ...view.options.map((option) => option.label));
      const answerId = policy(view.options, turn);
      state = journeyReducer(strategy, state, { type: "record_answer", answer: { questionId: view.id, answerId } });
    }
    const end = journeyStep(strategy, state);
    if (end?.status !== "complete") throw new Error(`${selection.join("+")}: did not complete`);
    const result = buildV3ResultView(end, state.selectedIds, state.answers, { strategyId: strategy.id, text: v4Text });
    resultKinds.add(`${result.source}:${result.kind}`);
    rendered.push(
      ...result.programs.flatMap((program) => [program.summaryHe, ...program.whyHe, ...program.findHe]),
      ...(result.pair ? [...result.pair.bullets.flat(), ...result.pair.guidance.map((entry) => entry.ifHe)] : []),
      ...result.notes.flatMap((note) => [note.headingHe, note.textHe]),
      ...result.chosenHe,
      ...(result.disclaimerHe ? [result.disclaimerHe] : []),
    );
    return rendered;
  }

  for (const [name, strategy] of [
    ["worlds", WORLD_STRATEGY],
    ["projects", BRAND_STRATEGY],
  ] as const) {
    it(`every question and result string rendered in V4 ${name} mode is inclusive (every single and pair selection × 5 answer policies)`, () => {
      const selections = strategy.entryIds.flatMap((a, i) => [
        [a],
        ...strategy.entryIds.slice(i + 1).map((b) => [a, b]),
      ]);
      const offending = new Set<string>();
      let rendered = 0;
      for (const selection of selections)
        for (const policy of Object.values(POLICIES))
          for (const text of walk(strategy, selection, policy)) {
            rendered++;
            if (masculineHits(text).length > 0) offending.add(text);
          }
      expect(rendered).toBeGreaterThan(1000);
      expect([...offending]).toEqual([]);
    });
  }

  it("the walks cover every result kind, generic and Tech precision", () => {
    for (const kind of [
      "generic:recommended",
      "generic:near_tie",
      "generic:insufficient_positive_evidence",
      "precision:recommended",
    ])
      expect(resultKinds, kind).toContain(kind);
  });

  it("the same journey without the V4 seam renders the original V3 text (V3 is untouched)", () => {
    let state: JourneyState = journeyReducer(WORLD_STRATEGY, initialJourneyState, {
      type: "toggle_entry",
      entryId: WORLD_STRATEGY.entryIds[1]!,
    });
    state = journeyReducer(WORLD_STRATEGY, state, { type: "start" });
    const step = journeyStep(WORLD_STRATEGY, state);
    if (step?.status !== "ask") throw new Error("expected a question");
    const v3 = buildV3QuestionView(step);
    const v4 = buildV3QuestionView(step, v4Text);
    expect(v4.id).toBe(v3.id);
    expect(v4.options.map((option) => option.id)).toEqual(v3.options.map((option) => option.id));
    expect(v3.prompt).toMatch(/אתכם|לכם|הייתם/);
    expect(v4.prompt).toBe(v4Text(v3.prompt));
    expect(v4.prompt).not.toBe(v3.prompt);
  });
});

describe("V4 gender-inclusive copy: what must not change", () => {
  it("pins the final /v4/start copy", () => {
    expect(V4_COPY.method.headline).toBe("מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?");
    expect(V4_COPY.method.support).toBe("אפשר לבחור את האפשרות שהכי מתאימה — ונמשיך משם.");
    expect(V4_COPY.method.worlds).toEqual({
      title: "יש לי כיוון שאני רוצה ללמוד",
      description: "יש תחום שמושך אותי, ואני רוצה לדייק איזה מסלול הכי מתאים לי.",
      cue: "נתחיל מעולמות כמו טכנולוגיה, אנשים, חינוך, משפטים, עסקים ועיצוב.",
    });
    expect(V4_COPY.method.projects).toEqual({
      title: "אין לי מושג מה אני רוצה ללמוד",
      description: "אני רוצה להתחיל לחקור ולגלות מה באמת מסקרן אותי.",
      cue: "נתחיל מפרויקטים ומשימות מוכרות ונבין יחד לאלו כיוונים יש יותר חיבור.",
    });
  });

  it("keeps the legal consent text, the field labels and the validation messages of the lead form", () => {
    expect(V4_LEAD_COPY.consent).toBe(V2_LEAD_COPY.consent);
    expect(V4_LEAD_COPY.fields).toEqual(V2_LEAD_COPY.fields);
    expect(V4_LEAD_COPY.errors.firstName).toBe(V2_LEAD_COPY.errors.firstName);
    expect(V4_LEAD_COPY.errors.lastName).toBe(V2_LEAD_COPY.errors.lastName);
    expect(V4_LEAD_COPY.errors.phone).toBe(V2_LEAD_COPY.errors.phone);
  });

  it("leaves the V2 and V3 copy exactly as approved", () => {
    expect(V3_COPY.landing.headline).toBe("איזה תחום לימודים יכול להתאים לכם?");
    expect(V3_COPY.landing.cta).toBe("בואו נמצא את הכיוון שלכם");
    expect(V3_COPY.result.programCta).toBe("הכירו את המסלול במכללה");
    expect(V3_WORLD_OPENING.prompt).toBe("איזה מעולמות העשייה האלה הכי מסקרן אתכם?");
    expect(V2_LEAD_COPY.title).toBe("רוצים שנעזור לכם לעשות את הצעד הבא?");
    expect(V2_LEAD_COPY.submit).toBe("חזרו אליי עם פרטים");
    expect(V2_RESULT_COPY.generatedFocusPrompt).toBe("איזה יום עבודה נשמע לכם הכי מעניין?");
  });
});
