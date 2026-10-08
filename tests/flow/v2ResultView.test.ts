import { describe, expect, it } from "vitest";
import {
  buildV2QuestionView,
  buildV2ResultView,
  discoveryReducer,
  discoveryStep,
  initialDiscoveryState,
  type DiscoveryState,
  type GenericResultView,
  type V2ResultView,
} from "@/flow";
import { getCatalogProgram, V2_RESULT_COPY } from "@/data";

const WOLT = "wolt_new_city";
const NIKE = "nike_israel_launch";
const TIKTOK = "tiktok_endless_scroll";
const SPOTIFY = "spotify_discover_weekly";

/** Drive the journey like the UI: ask the engine, answer with `choose(questionId, optionIds)`. */
function play(projects: string[], choose: (questionId: string, optionIds: string[]) => string): DiscoveryState {
  let state = projects.reduce(
    (current, projectId) => discoveryReducer(current, { type: "toggle_project", projectId }),
    initialDiscoveryState,
  );
  state = discoveryReducer(state, { type: "start" });
  for (let guard = 0; guard < 30; guard++) {
    const step = discoveryStep(state);
    if (step?.status !== "ask") return state;
    const question = step.mode === "precision" ? step.question : step.question.question;
    const next = discoveryReducer(state, {
      type: "record_answer",
      answer: {
        questionId: question.id,
        answerId: choose(
          question.id,
          question.options.map((o) => o.id),
        ),
      },
    });
    if (next === state) throw new Error(`answer to ${question.id} rejected`);
    state = next;
  }
  throw new Error("did not terminate");
}

const scripted =
  (script: Record<string, string>, fallback = "neither") =>
  (id: string, options: string[]) => {
    const choice = script[id] ?? fallback;
    return options.includes(choice) ? choice : options[0]!;
  };

function resultOf(state: DiscoveryState, advisorUrl: string | null = null): V2ResultView {
  const step = discoveryStep(state);
  if (step?.status !== "complete") throw new Error("journey not complete");
  return buildV2ResultView(step, state.selectedProjectIds, state.answers, { advisorUrl });
}
const generic = (view: V2ResultView): GenericResultView => {
  if (view.type !== "generic") throw new Error("expected a generic result");
  return view;
};

/** Every candidate-visible string in a view (ids, kinds and URLs are not copy). */
function visibleText(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return ["programUrl", "admissionUrl", "advisorUrl", "programId", "level", "type", "kind"].includes(key)
      ? []
      : [value];
  if (Array.isArray(value)) return value.flatMap((item) => visibleText(item, key));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => (k === "analytics" ? [] : visibleText(v, k)));
  }
  return [];
}

describe("recommended", () => {
  const accounting = play([WOLT], scripted({ B1: "C", B2: "C", B3: "C", BR1: "C" }));
  const view = generic(resultOf(accounting));

  it("recommends the program the candidate's own choices point to, with those choices as evidence", () => {
    expect(view.kind).toBe("recommended");
    const [primary] = view.directions;
    expect(primary).toMatchObject({ programId: "accounting", nameHe: "חשבונאות" });
    expect(primary!.chosenHe).toHaveLength(3);
    expect(view.patternHe).toBe(V2_RESULT_COPY.recommended.pattern(3));
    expect(view.patternHe).toContain("שלוש");
    expect(view.eyebrowHe).toBe(V2_RESULT_COPY.recommended.eyebrow);
  });

  it("shows no runner-up and no main decision when nothing else was supported", () => {
    expect(view.directions).toHaveLength(1);
    expect(view.mainDecision).toBeNull();
  });

  it("surfaces the Accounting reality check calmly, as a note that never disqualifies", () => {
    expect(view.realityChecks).toHaveLength(1);
    expect(view.realityChecks[0]).toMatchObject({
      programId: "accounting",
      level: "negative",
      headingHe: V2_RESULT_COPY.reality.heading.negative,
      noteHe: V2_RESULT_COPY.reality.negativeNote,
    });
    expect(view.directions[0]!.programId).toBe("accounting"); // the negative answer did not change who is recommended
  });

  it("links to the official program page from the source registry and limits facts for pending-curation programs", () => {
    const url = view.directions[0]!.programUrl!;
    expect(url).toMatch(/^https:\/\/(www\.)?(colman\.ac\.il|academy\.org\.il)/);
    expect(view.limitedFacts).toBe(true);
    expect(getCatalogProgram("accounting")!.factsStatus).toBe("pending_curation");
  });

  it("names a real runner-up and the practical trade-off from work statements", () => {
    const withRunnerUp = generic(resultOf(play([WOLT], scripted({ B1: "B", B2: "A", B3: "A", BR1: "A" }))));
    expect(withRunnerUp.kind).toBe("recommended");
    expect(withRunnerUp.directions.map((d) => d.programId)).toEqual([
      "business_administration",
      "economics_and_management",
    ]);
    expect(withRunnerUp.mainDecision!.titleHe).toBe(V2_RESULT_COPY.mainDecision.title);
    expect(withRunnerUp.mainDecision!.textHe).toContain(
      getCatalogProgram("business_administration")!.workStatementsHe[0]!,
    );
    expect(withRunnerUp.mainDecision!.textHe).toContain(
      getCatalogProgram("economics_and_management")!.workStatementsHe[0]!,
    );
  });
});

describe("near tie", () => {
  const forward = scripted({ B1: "A", B2: "B", B3: "A", B4: "B", B5: "neither" });
  const mirrored = scripted({ B1: "B", B2: "A", B3: "B", B4: "A", B5: "neither" });
  const a = generic(resultOf(play([WOLT], forward)));
  const b = generic(resultOf(play([WOLT], mirrored)));

  it("shows both directions with what pulled toward each, and no winner", () => {
    expect(a.kind).toBe("near_tie");
    expect(a.eyebrowHe).toBe(V2_RESULT_COPY.nearTie.eyebrow);
    expect(a.directions).toHaveLength(2);
    for (const direction of a.directions) expect(direction.chosenHe.length).toBeGreaterThan(0);
    expect(a.analytics.recommendedProgramId).toBeNull();
    expect(a.analytics.alternativeProgramIds).toHaveLength(2);
  });

  it("is symmetric: the same two programs in the same display order whichever one the engine ranked first", () => {
    expect(a.directions.map((d) => d.programId)).toEqual(["business_administration", "economics_and_management"]);
    expect(b.directions.map((d) => d.programId)).toEqual(a.directions.map((d) => d.programId));
    expect(b.mainDecision).toEqual(a.mainDecision);
  });
});

describe("insufficient positive evidence", () => {
  const view = generic(resultOf(play([WOLT], scripted({ B1: "A" }))));

  it("makes no recommendation and says so supportively", () => {
    expect(view.kind).toBe("insufficient_positive_evidence");
    expect(view.headingHe).toBe(V2_RESULT_COPY.insufficient.heading);
    expect(view.analytics.recommendedProgramId).toBeNull();
    expect(visibleText(view).join(" ")).not.toContain("מתאים לכם ביותר");
  });

  it("offers the single weakly supported program only as a direction to check", () => {
    expect(view.directions.map((d) => d.programId)).toEqual(["business_administration"]);
    expect(view.directions[0]!.chosenHe).toHaveLength(1);
    expect(view.mainDecision).toBeNull();
    expect(view.realityChecks).toEqual([]);
  });
});

describe("Tech precision result", () => {
  const precision = play([SPOTIFY], scripted({ Q1: "A", Q2: "A", Q3: "5", "CSDS-1": "cs", "CSDS-2": "cs" }));
  const view = resultOf(precision);

  it("keeps the V1 result view (and its kinds) and never offers the V1-only focused comparison", () => {
    expect(view.type).toBe("precision");
    if (view.type !== "precision") return;
    expect(view.view.kind).toBe("recommended");
    expect(view.view.top.id).toBe("computer_science");
    expect(view.view.ctas.compareFocused).toBeNull();
    expect(view.analytics).toMatchObject({
      resultKind: "v1_precision_result",
      recommendedProgramId: "computer_science",
    });
    expect(view.analytics.totalAnswerCount).toBe(5);
  });
});

describe("hygiene (all result kinds)", () => {
  const views = [
    resultOf(play([WOLT], scripted({ B1: "C", B2: "C", B3: "C", BR1: "A" }))),
    resultOf(play([WOLT], scripted({ B1: "A", B2: "B", B3: "A", B4: "B" }))),
    resultOf(play([WOLT], scripted({ B1: "A" }))),
    resultOf(play([TIKTOK, NIKE], scripted({ P1: "B", C1: "B", C2: "B" }))),
  ].map(generic);

  it("never renders scores, percentages, numbers or internal vocabulary", () => {
    for (const view of views) {
      const text = visibleText(view).join("\n");
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/%|ציון|ניקוד|אחוז|נקודות|scenario|focus|tiebreaker|reality_check|shortlist/i);
    }
  });

  it("puts only ids, counts and booleans in analytics metadata", () => {
    for (const view of views) {
      for (const value of Object.values(view.analytics)) {
        expect(["string", "number"].includes(typeof value) || Array.isArray(value) || value === null).toBe(true);
      }
      expect(JSON.stringify(view.analytics)).not.toMatch(/[֐-׿]/);
    }
  });

  it("includes the brand disclaimer and no partnership wording", () => {
    for (const view of views) expect(view.disclaimerHe).toMatch(/לצורך המחשה בלבד/);
  });

  it("offers the advisor CTA only when a destination is configured", () => {
    const state = play([WOLT], scripted({ B1: "A" }));
    expect(generic(resultOf(state)).ctas.advisorUrl).toBeNull();
    expect(generic(resultOf(state, "https://example.org/advisor")).ctas.advisorUrl).toBe("https://example.org/advisor");
    expect(generic(resultOf(state, "   ")).ctas.advisorUrl).toBeNull();
  });
});

describe("question view", () => {
  const first = (projects: string[], answers: Record<string, string> = {}) => {
    const state = play(projects, (id, options) =>
      answers[id] && options.includes(answers[id]!) ? answers[id]! : options[0]!,
    );
    return state;
  };

  it("renders authored questions with Hebrew copy and flags the neutral option", () => {
    let state = discoveryReducer(discoveryReducer(initialDiscoveryState, { type: "toggle_project", projectId: WOLT }), {
      type: "start",
    });
    state = discoveryReducer(state, { type: "record_answer", answer: { questionId: "B1", answerId: "A" } });
    const step = discoveryStep(state)!;
    if (step.status !== "ask") throw new Error("expected a question");
    const view = buildV2QuestionView(step);
    expect(view.id).toBe("B2");
    expect(view.options.map((o) => o.isNeutral)).toEqual([false, false, false, true]);
    expect(view.analytics).toEqual({
      mode: "generic",
      kind: "focus",
      isGeneratedFocus: false,
      focusProgramCount: null,
    });
    expect(JSON.stringify(view)).not.toMatch(/program_ids|programIds|weight|score/);
    expect(first([WOLT]).phase).toBe("answering");
  });

  it("renders a generated 2-way focus question from work statements, with the neutral option", () => {
    const state = play([TIKTOK, NIKE], (id, options) => (id === "P1" || id === "C1" ? "B" : options[0]!));
    // The first generated question for Behavioral Science vs Communication + Management.
    let current = discoveryReducer(
      discoveryReducer(discoveryReducer(initialDiscoveryState, { type: "toggle_project", projectId: TIKTOK }), {
        type: "toggle_project",
        projectId: NIKE,
      }),
      { type: "start" },
    );
    for (const [questionId, answerId] of [
      ["P1", "B"],
      ["C1", "B"],
    ] as const) {
      current = discoveryReducer(current, { type: "record_answer", answer: { questionId, answerId } });
    }
    const step = discoveryStep(current)!;
    if (step.status !== "ask") throw new Error("expected a question");
    const view = buildV2QuestionView(step);
    expect(view.id).toBe("focus:behavioral_science|communication_and_management:0");
    expect(view.prompt).toBe(V2_RESULT_COPY.generatedFocusPrompt);
    expect(view.options.map((o) => o.label)).toEqual([
      getCatalogProgram("behavioral_science")!.workStatementsHe[0],
      getCatalogProgram("communication_and_management")!.workStatementsHe[0],
      expect.any(String),
    ]);
    expect(view.options.map((o) => o.isNeutral)).toEqual([false, false, true]);
    expect(view.analytics).toEqual({ mode: "generic", kind: "focus", isGeneratedFocus: true, focusProgramCount: 2 });
    expect(state.answers.length).toBeGreaterThan(2);
  });

  it("renders a V1 precision question with V1 copy, tagged as precision", () => {
    const state = discoveryReducer(
      discoveryReducer(initialDiscoveryState, { type: "toggle_project", projectId: SPOTIFY }),
      { type: "start" },
    );
    const step = discoveryStep(state)!;
    if (step.status !== "ask") throw new Error("expected a question");
    const view = buildV2QuestionView(step);
    expect(view.id).toBe("Q1");
    expect(view.analytics).toMatchObject({ mode: "precision", kind: null, isGeneratedFocus: false });
  });
});
