import { describe, expect, it } from "vitest";
import {
  buildResultView,
  comparisonReducer,
  displayName,
  initialComparisonState,
  nextComparisonStep,
  resultKind,
  restoreComparison,
  serializeComparison,
  type ComparisonAction,
  type ComparisonState,
  type ResultView,
} from "@/flow";
import { RESULT_COPY, getProgramSummary } from "@/data";
import type { FitResult, RecordedAnswer } from "@/engine";
import { ALL_PILOT, CS, DS, MIS, runFlow } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";

const viewFor = (id: string, options?: Parameters<typeof buildResultView>[3]) => {
  const sanity = SANITY_CASES.find((c) => c.id === id)!;
  const run = runFlow(sanity.programs, sanity.policy());
  return { run, view: buildResultView(run.result, run.answers, sanity.programs, options) };
};

/** A real CS+DS path that ends in a near tie after the tie-breaker (found by exhaustive enumeration). */
const NEAR_TIE: RecordedAnswer[] = [
  ["Q1", "A"],
  ["Q2", "A"],
  ["Q3", "1"],
  ["CSDS-1", "cs"],
  ["CSDS-2", "ds"],
  ["CSDS-3", "ds"],
  ["TB-CSDS", "cs"],
].map(([questionId, answerId]) => ({ questionId: questionId!, answerId: answerId! }));

function nearTieResult(): FitResult {
  const step = nextComparisonStep({ selectedProgramIds: [CS, DS], answers: NEAR_TIE });
  if (step?.status !== "complete") throw new Error("expected a completed flow");
  return step.result;
}

describe("normal recommendations", () => {
  it.each([
    ["persona_a_cs", CS, DS],
    ["persona_b_ds", DS, MIS],
    ["persona_c_mis", MIS, DS],
  ])("%s recommends the engine's top program and keeps the second visible", (id, top, second) => {
    const { run, view } = viewFor(id);
    expect(view.kind).toBe("recommended");
    expect(view.top.id).toBe(top);
    expect(view.top.id).toBe(run.result.bestFitProgram);
    expect(view.second.id).toBe(second);
    expect(view.secondary.program.id).toBe(second);
    expect(view.secondary.positioningHe).toMatch(/\S/);
    expect(view.hero.eyebrowHe).toBe(RESULT_COPY.states.recommended.eyebrow_he);
    expect(view.hero.fitNoteHe).toMatch(/\S/);
    expect(view.topContent).not.toBeNull();
  });

  it("never exposes the engine's classification names", () => {
    for (const id of ["persona_a_cs", "persona_b_ds", "persona_c_mis", "persona_d_no_fit"]) {
      // `kind` is an internal discriminator that is never displayed; everything else is candidate-facing.
      const candidateFacing = JSON.stringify(viewFor(id).view, (key, value) => (key === "kind" ? undefined : value));
      expect(candidateFacing).not.toMatch(/strong_fit|good_fit|consider_carefully|normalized|raw/);
    }
  });
});

describe("evidence comes from the recorded answers", () => {
  it.each(["persona_a_cs", "persona_b_ds", "persona_c_mis", "low_math_ds", "mixed_three_way"])(
    "%s: 3 to 5 items, each the wording of an answer the candidate actually gave",
    (id) => {
      const { run, view } = viewFor(id);
      expect(view.evidence.length).toBeGreaterThanOrEqual(3);
      expect(view.evidence.length).toBeLessThanOrEqual(5);
      for (const item of view.evidence) {
        expect(run.answers).toContainEqual({ questionId: item.questionId, answerId: item.answerId });
        expect(item.text).toBe(RESULT_COPY.evidence.get(`${item.questionId}/${item.answerId}`));
      }
      expect(new Set(view.evidence.map((e) => e.questionId)).size).toBe(view.evidence.length);
    },
  );

  it("leads with the answers that supported the recommendation, strongest first", () => {
    const { run, view } = viewFor("persona_b_ds");
    const supporting = run.result.evidence.filter((e) => e.direction === "supports_top").map((e) => e.questionId);
    expect(view.evidence.map((e) => e.questionId)).toEqual(supporting.slice(0, view.evidence.length));
  });

  it("represents an answer that worked against the top program as a separate 'mixed' item, last", () => {
    const result = nearTieResult();
    const view = buildResultView(result, NEAR_TIE, [CS, DS]);
    const mixed = view.evidence.filter((e) => e.kind === "mixed");
    expect(mixed).toHaveLength(1);
    expect(view.evidence.at(-1)).toBe(mixed[0]);
    const source = result.evidence.find((e) => e.questionId === mixed[0]!.questionId)!;
    expect(source.direction).toBe("supports_second");
    expect(view.secondary.whyItFitsHe).toEqual([mixed[0]!.text]);
  });

  it("does not show trivially small contrary signals", () => {
    const { view } = viewFor("persona_a_cs");
    expect(view.evidence.some((e) => e.kind === "mixed")).toBe(false);
  });
});

describe("near tie", () => {
  it("is its own result kind: no pretended winner, both programs and the decisive axis present", () => {
    const result = nearTieResult();
    expect(result.nearTie).toBe(true);
    expect(result.bestFitProgram).not.toBeNull();
    const view = buildResultView(result, NEAR_TIE, [CS, DS]);
    expect(view.kind).toBe("near_tie");
    expect(view.hero.headingHe).toBe("ההתלבטות שלכם באמת קרובה");
    expect(view.hero.eyebrowHe).toBe(RESULT_COPY.states.near_tie.eyebrow_he);
    expect(view.hero.fitNoteHe).toBeNull();
    expect([view.top.id, view.second.id].sort()).toEqual([CS, DS]);
    expect(view.tradeoff?.axisHe).toBe(RESULT_COPY.pairAxis(CS, DS)!.axisHe);
    expect(view.tradeoff?.topSideHe).toMatch(/\S/);
    expect(view.tradeoff?.secondSideHe).toMatch(/\S/);
    expect(view.tradeoff?.sharedFirstYearNote).toMatch(/\S/);
  });

  it("with only two programs there is no separate focused comparison to offer", () => {
    const view = buildResultView(nearTieResult(), NEAR_TIE, [CS, DS]);
    expect(view.ctas.compareFocused).toBeNull();
  });
});

describe("no strong fit", () => {
  it("is a first-class result with no recommendation", () => {
    const { run, view } = viewFor("persona_d_no_fit");
    expect(run.result.bestFitProgram).toBeNull();
    expect(view.kind).toBe("no_strong_fit");
    expect(view.hero.headingHe).toBe(RESULT_COPY.states.no_strong_fit.heading_he);
    expect(view.hero.eyebrowHe).toBeNull();
    expect(view.hero.fitNoteHe).toBeNull();
    expect(view.topContent).toBeNull();
    expect(view.tradeoff).toBeNull();
    expect(view.ctas.programUrl).toBeNull();
    expect(view.noFit?.exploreHe).toMatch(/\S/);
  });

  it("keeps the two closer options as soft alternatives and explains from the rejections", () => {
    const { run, view } = viewFor("persona_d_no_fit");
    expect([view.top.id, view.second.id]).toEqual(run.result.mainDecision);
    const rejected = view.evidence.filter((e) => e.answerId === "neither");
    expect(rejected.length).toBeGreaterThanOrEqual(2);
    expect(view.evidence.every((e) => e.kind === "answer")).toBe(true);
    expect(view.mirrorHe).toBe(RESULT_COPY.mirror.no_fit_he);
  });

  it("is derived only from the engine's null recommendation", () => {
    const { run } = viewFor("persona_d_no_fit");
    expect(resultKind(run.result)).toBe("no_strong_fit");
    expect(resultKind({ ...run.result, bestFitProgram: MIS })).toBe("recommended");
  });
});

describe("reality checks", () => {
  it("are present only when the engine triggered them", () => {
    for (const id of ["persona_a_cs", "persona_b_ds", "persona_c_mis", "mixed_three_way"]) {
      const { run, view } = viewFor(id);
      expect(run.result.realityChecks).toHaveLength(0);
      expect(view.realityChecks).toHaveLength(0);
    }
    const { run, view } = viewFor("low_math_ds");
    expect(view.realityChecks.map((c) => c.id).sort()).toEqual(run.result.realityChecks.map((c) => c.id).sort());
    expect(view.realityChecks.length).toBeGreaterThan(0);
  });

  it("quote the candidate's actual answer for an explicit-negative trigger, then the program's own wording", () => {
    const { view } = viewFor("low_math_ds");
    const ds = view.realityChecks.find((c) => c.id === "ds_math_statistics_programming")!;
    expect(ds.leadLines).toEqual([RESULT_COPY.evidence.get("Q3/1")]);
    expect(ds.bodyHe).toBe(RESULT_COPY.program(DS).realityCheckBodyHe["ds_math_statistics_programming"]);
    expect(ds.bodyHe).not.toMatch(/לא מתאים|פסול|אי אפשר/);
  });

  it("keep the MIS qualifier on the program the warning is about", () => {
    const { view } = viewFor("persona_d_prime_mis");
    const mis = view.realityChecks.find((c) => c.program.id === MIS)!;
    expect(mis.program.qualifierHe).toBe("דו-חוגי עם מנהל עסקים");
  });
});

describe("main decision and mirror", () => {
  it("describe the pair axis in plain Hebrew, with the top program's side first", () => {
    const { view } = viewFor("persona_b_ds");
    expect(view.tradeoff?.axisHe).toBe(RESULT_COPY.pairAxis(DS, MIS)!.axisHe);
    expect(view.tradeoff?.topSideHe).toBe(RESULT_COPY.pairAxis(DS, MIS)!.sidesHe[DS]);
    expect(view.tradeoff?.secondSideHe).toBe(RESULT_COPY.pairAxis(DS, MIS)!.sidesHe[MIS]);
    expect(view.tradeoff?.decidedByHe.length).toBeGreaterThan(0);
  });

  it("adds the shared-first-year note only for a CS/DS main decision (explanatory, DEC-016)", () => {
    expect(viewFor("persona_a_cs").view.tradeoff?.sharedFirstYearNote).toMatch(/\S/);
    expect(viewFor("persona_b_ds").view.tradeoff?.sharedFirstYearNote).toBeNull();
    expect(viewFor("persona_c_mis").view.tradeoff?.sharedFirstYearNote).toBeNull();
    const note = viewFor("persona_a_cs").view.tradeoff?.sharedFirstYearNote;
    expect(viewFor("persona_a_cs").view.evidence.map((e) => e.text)).not.toContain(note);
  });

  it("builds the mirror from the candidate's actual leanings, never from numbers", () => {
    const text = viewFor("persona_a_cs").view.mirrorHe;
    expect(text).toContain(RESULT_COPY.dimensions.software_building.nounHe);
    expect(text).toContain(RESULT_COPY.mirror.less_he);
    expect(text).not.toMatch(/\d/);
  });
});

describe("actions", () => {
  it("offers admissions and the official program page, and only offers the advisor when configured", () => {
    const without = viewFor("persona_a_cs").view.ctas;
    expect(without.admissionUrl).toBe("https://www.academy.org.il/admission/");
    expect(without.programUrl).toBe("https://www.colman.ac.il/academics/ba/computer-science/");
    expect(without.advisorUrl).toBeNull();
    expect(viewFor("persona_a_cs", { advisorUrl: "https://example.org/advisor" }).view.ctas.advisorUrl).toBe(
      "https://example.org/advisor",
    );
    expect(viewFor("persona_a_cs", { advisorUrl: "  " }).view.ctas.advisorUrl).toBeNull();
  });

  it("builds a contextual advisor label with the MIS qualifier", () => {
    const label = viewFor("persona_b_ds").view.ctas.advisorLabelHe;
    expect(label).toContain("מדע הנתונים");
    expect(label).toContain(displayName(getProgramSummary(MIS)!));
    expect(label).toContain("דו-חוגי עם מנהל עסקים");
  });

  it("offers a focused re-comparison only when three programs were compared", () => {
    expect(viewFor("persona_a_cs").view.ctas.compareFocused).toEqual([CS, DS]);
    expect(viewFor("persona_b_cs_ds_only").view.ctas.compareFocused).toBeNull();
  });
});

describe("refresh and back", () => {
  const reduce = (state: ComparisonState, ...actions: ComparisonAction[]) => actions.reduce(comparisonReducer, state);

  it("the same result view is rebuilt from the stored answers after a refresh", () => {
    const sanity = SANITY_CASES.find((c) => c.id === "persona_b_ds")!;
    const run = runFlow(sanity.programs, sanity.policy());
    let state = reduce(
      initialComparisonState,
      ...ALL_PILOT.map((programId): ComparisonAction => ({ type: "toggle_program", programId })),
      { type: "start_questions" },
      ...run.answers.map((answer): ComparisonAction => ({ type: "record_answer", answer })),
    );
    expect(state.status).toBe("completed");
    const before = buildResultView(state.result!, state.answers, state.selectedProgramIds);

    const restored = restoreComparison(serializeComparison(state));
    expect(restored?.status).toBe("completed");
    const after = buildResultView(restored!.result!, restored!.answers, restored!.selectedProgramIds);
    expect(after).toEqual(before as ResultView);

    // Back from the result reopens the last question, and the result is gone until it is answered again.
    state = reduce(state, { type: "go_back" });
    expect(state.status).toBe("answering");
    expect(state.result).toBeNull();
    const step = nextComparisonStep(state);
    expect(step?.status).toBe("ask");
  });
});
