import { describe, expect, it } from "vitest";
import {
  getV5Project,
  getV5ProjectQuestionCopy,
  V2_LEAD_COPY,
  V4_COPY,
  V4_LEAD_COPY,
  V4_UI_COPY,
  V5_COPY,
  V5_LEAD_COPY,
  V5_PROJECT_OPENING,
  V5_PROJECTS,
  V5_UI_COPY,
  v4Text,
  v5Text,
} from "@/data";
import {
  buildV3QuestionView,
  buildV3ResultView,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  PROJECT_STRATEGY,
  v3Progress,
  WORLD_STRATEGY,
  type DiscoveryStrategy,
  type JourneyState,
} from "@/flow";
import { masculineHits } from "./inclusiveScan";

/**
 * V5 gender-inclusive copy (DEC-036 applied to V5, DEC-037). V5 inherits V4's presentation layer (same screen copy,
 * lead copy and text seam), and its own project content is authored inclusive. Same scan rules as the V4 suite
 * (`inclusiveScan.ts`); the V4 suite itself is unchanged.
 */

/**
 * Two card lines given verbatim in the V5 product spec use the impersonal "רוצים" about third parties ("a place people
 * want to stay in"), not as candidate address. Kept as specified and flagged for Hebrew review; nothing else may hit.
 */
const VERBATIM_THIRD_PERSON = new Set([
  "להבין למה עובדים טובים עוזבים ואיך ליצור מקום שרוצים להישאר בו.",
  "להפוך חלל ריק למקום שאנשים רוצים להיכנס אליו, להשתמש בו ולזכור אותו.",
]);

const offending = (texts: readonly string[]) =>
  [...new Set(texts)].filter((text) => !VERBATIM_THIRD_PERSON.has(text) && masculineHits(text).length > 0);

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

const V5_PROJECT_CONTENT: readonly string[] = [
  V5_PROJECT_OPENING.prompt,
  V5_PROJECT_OPENING.helper,
  ...V5_PROJECTS.flatMap((project) => {
    const copy = getV5ProjectQuestionCopy(project.scenarioId)!;
    return [project.titleHe, project.cardHe, copy.prompt, ...copy.options.map((option) => option.label)];
  }),
];

describe("V5 inherits the V4 inclusive presentation layer (no second copy system)", () => {
  it("uses V4's text seam, lead copy and screen copy; only the project-screen headline/helper differ", () => {
    expect(v5Text).toBe(v4Text);
    expect(V5_LEAD_COPY).toBe(V4_LEAD_COPY);
    expect(V5_LEAD_COPY.consent).toBe(V2_LEAD_COPY.consent);
    expect({ ...V5_UI_COPY, discovery: null }).toEqual({ ...V4_UI_COPY, discovery: null });
    expect(V5_UI_COPY.discovery.headline).toBe(V5_COPY.projects.headline);
    expect(V5_COPY.appTitle).toBe(V4_COPY.appTitle);
  });

  it("the V5 project content is authored inclusive, so the text seam leaves every string as is", () => {
    for (const text of V5_PROJECT_CONTENT) expect(v5Text(text)).toBe(text);
  });
});

describe("V5 gender-inclusive copy: the whole V5 surface", () => {
  it("the scan catches masculine-only address (guards against a vacuous test)", () => {
    for (const sample of ["בחרו עד שניים", "מה הייתם רוצים לבדוק?", "מה מעניין אתכם?"])
      expect(masculineHits(sample), sample).not.toEqual([]);
  });

  it("no masculine-only candidate address in the V5 project content (cards, headline, helper, openers)", () => {
    expect(offending(V5_PROJECT_CONTENT)).toEqual([]);
    // The verbatim exceptions are exactly the two flagged card lines, and they are real cards.
    for (const text of VERBATIM_THIRD_PERSON) expect(V5_PROJECTS.some((project) => project.cardHe === text)).toBe(true);
  });

  it("no masculine-only candidate address in V5's own copy (screens, method screen, lead form; consent excluded)", () => {
    const own = [
      ...strings(V5_UI_COPY),
      ...strings(V5_COPY),
      ...strings(V4_COPY.method),
      ...strings(V5_LEAD_COPY, (key) => key === "consent"),
      ...([1, 2, 3] as const).flatMap((stage) =>
        [0, 3, 5].flatMap((n) => {
          const progress = v3Progress(stage, n, V5_UI_COPY.progress);
          return [progress.stageLabelHe, progress.stageNameHe, progress.toneHe ?? ""];
        }),
      ),
    ];
    expect(offending(own)).toEqual([]);
  });

  type Option = { id: string; isNeutral: boolean };
  const POLICIES: Array<(options: readonly Option[], turn: number) => string> = [
    (options) => options[0]!.id,
    (options) => options[options.length - 1]!.id,
    (options, turn) => options[turn % options.length]!.id,
    (options) => (options.find((option) => option.isNeutral) ?? options[options.length - 1]!).id,
  ];

  function walk(strategy: DiscoveryStrategy, selection: readonly string[], policy: (typeof POLICIES)[number]) {
    let state: JourneyState = selection.reduce(
      (current, entryId) => journeyReducer(strategy, current, { type: "toggle_entry", entryId }),
      initialJourneyState,
    );
    state = journeyReducer(strategy, state, { type: "start" });
    const rendered: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const step = journeyStep(strategy, state);
      if (step?.status !== "ask") break;
      const view = buildV3QuestionView(step, v5Text);
      rendered.push(view.prompt, ...view.options.map((option) => option.label));
      state = journeyReducer(strategy, state, {
        type: "record_answer",
        answer: { questionId: view.id, answerId: policy(view.options, turn) },
      });
    }
    const end = journeyStep(strategy, state);
    if (end?.status !== "complete") throw new Error(`${selection.join("+")}: did not complete`);
    const result = buildV3ResultView(end, state.selectedIds, state.answers, { strategyId: strategy.id, text: v5Text });
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
    ["projects (PROJECT_STRATEGY)", PROJECT_STRATEGY],
    ["worlds (WORLD_STRATEGY)", WORLD_STRATEGY],
  ] as const) {
    it(`every question and result string rendered in V5 ${name} is inclusive (all ordered selections × 4 policies)`, () => {
      const ids = strategy.entryIds;
      const selections = [
        ...ids.map((id) => [id]),
        ...ids.flatMap((a) => ids.filter((b) => b !== a).map((b) => [a, b])),
      ];
      const rendered = selections.flatMap((selection) =>
        POLICIES.flatMap((policy) => walk(strategy, selection, policy)),
      );
      expect(rendered.length).toBeGreaterThan(1000);
      expect(offending(rendered)).toEqual([]);
    }, 120_000);
  }

  it("cards render their exact spec copy (no override applied)", () => {
    expect(v5Text(getV5Project("people_change")!.titleHe)).toBe("מרכז ליווי והתפתחות");
  });
});
