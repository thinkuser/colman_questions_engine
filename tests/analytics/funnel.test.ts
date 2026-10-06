import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PARAMS,
  ANALYTICS_STORAGE_KEY,
  canonicalPair,
  comparisonCluster,
  type DataLayerHost,
} from "@/analytics";
import { nextComparisonStep, restoreComparison, serializeComparison } from "@/flow";
import { ALL_PILOT, CS, DS, MIS } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";
import { makeHarness, memoryStorage, SAFE_VALUE } from "./harness";

const sanity = (id: string) => SANITY_CASES.find((c) => c.id === id)!;
const playCase = (id: string, options?: Parameters<typeof makeHarness>[0]) => {
  const harness = makeHarness(options);
  const { programs, policy } = sanity(id);
  harness.play(programs, policy());
  return harness;
};
const NEAR_TIE_ANSWERS = [
  ["Q1", "A"],
  ["Q2", "A"],
  ["Q3", "1"],
  ["CSDS-1", "cs"],
  ["CSDS-2", "ds"],
  ["CSDS-3", "ds"],
  ["TB-CSDS", "cs"],
] as const;

describe("canonical conventions", () => {
  it("orders programs, clusters and pairs alphabetically, regardless of selection order or winner", () => {
    expect(comparisonCluster([MIS, CS, DS])).toBe("computer_science|data_science|management_information_systems");
    expect(comparisonCluster([DS, CS, MIS])).toBe(comparisonCluster([CS, MIS, DS]));
    expect(canonicalPair(DS, CS)).toBe("computer_science|data_science");
    expect(canonicalPair(CS, DS)).toBe(canonicalPair(DS, CS));
  });
});

describe("selection events", () => {
  it("does not duplicate degree_compare_view for the same mounted view, even if re-rendered or effects re-run", () => {
    const h = makeHarness();
    h.tracker.compareViewed("view-1");
    h.tracker.compareViewed("view-1");
    h.tracker.compareViewed("view-1");
    expect(h.of("degree_compare_view")).toHaveLength(1);
    h.tracker.compareViewed("view-2"); // a genuinely new view (navigated away and back)
    expect(h.of("degree_compare_view")).toHaveLength(2);
  });

  it("emits degree_selected with program_id and the selection after the action", () => {
    const h = makeHarness();
    h.select(DS, CS);
    expect(h.of("degree_selected")).toMatchObject([
      { program_id: DS, selected_program_count: 1, program_1: DS, comparison_cluster: DS },
      {
        program_id: CS,
        selected_program_count: 2,
        program_1: CS,
        program_2: DS,
        comparison_cluster: "computer_science|data_science",
      },
    ]);
    expect(h.of("degree_selected").every((e) => e.comparison_id === undefined)).toBe(true);
  });

  it("emits change_program when a selected program is removed, and ignores a rejected fourth selection", () => {
    const h = makeHarness();
    h.select(CS, DS, MIS);
    h.dispatch({ type: "toggle_program", programId: "physics" }); // rejected: already three selected
    expect(h.of("degree_selected")).toHaveLength(3);
    h.dispatch({ type: "toggle_program", programId: DS });
    expect(h.of("change_program")).toMatchObject([
      {
        program_id: DS,
        selected_program_count: 2,
        comparison_cluster: "computer_science|management_information_systems",
      },
    ]);
  });

  it("emits nothing when state is restored after a refresh", () => {
    const first = makeHarness();
    first.select(CS, DS);
    const restored = restoreComparison(serializeComparison(first.tracker.getState()));
    const second = makeHarness({ restored });
    expect(second.events()).toEqual([]);
  });
});

describe("comparison start and comparison_id", () => {
  it("creates one id when a valid comparison is explicitly started and carries it on later events", () => {
    const h = makeHarness();
    h.select(CS);
    h.start(); // invalid: one program
    expect(h.of("comparison_started")).toHaveLength(0);
    h.select(DS);
    h.start();
    const [started] = h.of("comparison_started");
    expect(started).toMatchObject({
      comparison_id: "cmp-1",
      selected_program_count: 2,
      program_1: CS,
      program_2: DS,
      comparison_cluster: "computer_science|data_science",
    });
    h.tracker.questionViewed();
    h.answer("Q1", "A");
    const ids = new Set(
      h
        .events()
        .filter((e) => e.event !== "degree_selected")
        .map((e) => e.comparison_id),
    );
    expect(ids).toEqual(new Set(["cmp-1"]));
  });

  it("keeps the same comparison_id across a refresh mid-run", () => {
    const storage = memoryStorage();
    const first = makeHarness({ storage });
    first.select(...ALL_PILOT);
    first.start();
    first.tracker.questionViewed();
    first.answer("Q1", "A");
    const restored = restoreComparison(serializeComparison(first.tracker.getState()));
    const second = makeHarness({ storage, restored });
    expect(second.tracker.getComparisonId()).toBe("cmp-1");
    second.tracker.questionViewed();
    second.answer("Q2", "A");
    expect(second.of("question_answer")[0]!.comparison_id).toBe("cmp-1");
  });

  it("gives a new actual comparison a new id, and none while only selecting", () => {
    const h = makeHarness();
    h.select(CS, DS);
    expect(h.tracker.getComparisonId()).toBeNull();
    h.start();
    expect(h.tracker.getComparisonId()).toBe("cmp-1");
    h.dispatch({ type: "restart" });
    expect(h.tracker.getComparisonId()).toBeNull();
    h.select(CS, DS);
    h.start();
    expect(h.tracker.getComparisonId()).toBe("cmp-2");
  });

  it("going back from the first question returns to selection and ends that comparison id", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    h.dispatch({ type: "go_back" });
    expect(h.tracker.getComparisonId()).toBeNull();
    h.start();
    expect(h.of("comparison_started").map((e) => e.comparison_id)).toEqual(["cmp-1", "cmp-2"]);
  });

  it("restores a running comparison without a stored id by creating one silently (no comparison_started)", () => {
    const first = makeHarness();
    first.select(CS, DS);
    first.start();
    first.answer("Q1", "A");
    const restored = restoreComparison(serializeComparison(first.tracker.getState()));
    expect(restored?.status).toBe("answering");
    const second = makeHarness({ restored, uuid: () => "fresh-id" });
    expect(second.tracker.getComparisonId()).toBe("fresh-id");
    expect(second.events()).toEqual([]);
  });
});

describe("question events", () => {
  it("emits one question_answer for an accepted answer and nothing for stale, repeated or invalid ones", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    h.tracker.questionViewed();
    h.answer("Q1", "A");
    h.answer("Q1", "A"); // double tap on the already answered question
    h.answer("Q3", "3"); // stale / wrong question
    h.answer("Q2", "Z"); // invalid option
    expect(h.of("question_answer")).toHaveLength(1);
    expect(h.of("question_answer")[0]).toMatchObject({
      question_id: "Q1",
      question_type: "scenario",
      answer_id: "A",
      question_index: 1,
      is_tie_breaker: false,
    });
  });

  it("has no branch_id on opening questions and a canonical one on pair questions", () => {
    const h = playCase("persona_a_cs");
    const answers = h.of("question_answer");
    expect(answers.slice(0, 3).every((e) => e.branch_id === undefined)).toBe(true);
    expect(answers.slice(3).every((e) => e.branch_id === "computer_science|data_science")).toBe(true);
  });

  it("includes leading_program after each accepted answer, ending at the engine's top program", () => {
    const h = playCase("persona_b_ds");
    const answers = h.of("question_answer");
    expect(answers.every((e) => typeof e.leading_program === "string")).toBe(true);
    const completed = h.of("comparison_completed")[0]!;
    expect(answers.at(-1)!.leading_program).toBe(completed.recommended_program);
    expect(answers.at(-1)!.leading_program).toBe(DS);
  });

  it("never reports the leading program as the recommendation", () => {
    const h = playCase("persona_a_cs");
    for (const event of h.of("question_answer")) expect(event.recommended_program).toBeUndefined();
  });

  it("emits question_view once per exposure and again when Back re-shows a question", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    h.tracker.questionViewed();
    h.tracker.questionViewed(); // Strict Mode effect re-run / re-render
    expect(h.of("question_view")).toHaveLength(1);
    h.answer("Q1", "A");
    h.tracker.questionViewed();
    h.dispatch({ type: "go_back" });
    h.tracker.questionViewed();
    expect(h.of("question_view").map((e) => e.question_id)).toEqual(["Q1", "Q2", "Q1"]);
    expect(h.of("question_view")[1]).toMatchObject({ question_index: 2, is_tie_breaker: false });
  });

  it("counts Back from the result as a new exposure of the last question, even though it was shown before", () => {
    const h = playCase("persona_a_cs");
    const before = h.of("question_view").length;
    const lastQuestion = h.of("question_view").at(-1)!.question_id;
    h.dispatch({ type: "go_back" });
    h.tracker.questionViewed();
    h.tracker.questionViewed(); // Strict Mode effect re-run
    expect(h.of("question_view")).toHaveLength(before + 1);
    expect(h.of("question_view").at(-1)!.question_id).toBe(lastQuestion);
  });

  it("does not repeat question_view when a refresh restores the exact same displayed question", () => {
    const storage = memoryStorage();
    const first = makeHarness({ storage });
    first.select(CS, DS);
    first.start();
    first.tracker.questionViewed();
    first.answer("Q1", "A");
    first.tracker.questionViewed();
    const restored = restoreComparison(serializeComparison(first.tracker.getState()));
    const second = makeHarness({ storage, restored });
    second.tracker.questionViewed();
    expect(second.of("question_view")).toHaveLength(0);
    second.answer("Q2", "A");
    second.tracker.questionViewed();
    expect(second.of("question_view").map((e) => e.question_id)).toEqual(["Q3"]);
  });

  it("does not emit question_view outside a running comparison", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.tracker.questionViewed();
    expect(h.of("question_view")).toHaveLength(0);
  });
});

describe("adaptive flow events", () => {
  it("a 5-question path has 5 accepted answers, one branch selection and no tie-breaker", () => {
    const h = playCase("persona_a_cs");
    expect(h.of("question_answer")).toHaveLength(5);
    expect(h.of("question_view")).toHaveLength(5);
    expect(h.of("adaptive_branch_selected")).toMatchObject([{ branch_id: "computer_science|data_science" }]);
    expect(h.of("tie_breaker_view")).toHaveLength(0);
  });

  it("a 6-question path has 6 accepted answers", () => {
    expect(playCase("mixed_three_way").of("question_answer")).toHaveLength(6);
  });

  it("a 7-question path emits exactly one tie_breaker_view, alongside its question_view", () => {
    const h = playCase("mixed_cs_ds");
    expect(h.of("question_answer")).toHaveLength(7);
    expect(h.of("tie_breaker_view")).toHaveLength(1);
    expect(h.of("tie_breaker_view")[0]).toMatchObject({
      question_id: "TB-CSDS",
      question_index: 7,
      is_tie_breaker: true,
      branch_id: "computer_science|data_science",
    });
    const tieBreakerViews = h.of("question_view").filter((e) => e.is_tie_breaker === true);
    expect(tieBreakerViews).toHaveLength(1);
    expect(h.of("question_answer").at(-1)).toMatchObject({ question_id: "TB-CSDS", is_tie_breaker: true });
  });

  it("emits the branch selection once even though many branch questions follow", () => {
    const h = playCase("mixed_cs_ds");
    expect(h.of("adaptive_branch_selected")).toHaveLength(1);
    // Determined right after the third (last opening) answer, before the first branch question is shown.
    const names = h.names();
    const answersBefore = names
      .slice(0, names.indexOf("adaptive_branch_selected"))
      .filter((n) => n === "question_answer");
    expect(answersBefore).toHaveLength(3);
  });
});

describe("completion events", () => {
  it("emits comparison_completed and recommended_program with result metadata", () => {
    const h = playCase("persona_b_ds");
    const completed = h.of("comparison_completed")[0]!;
    expect(completed).toMatchObject({
      comparison_id: "cmp-1",
      questions_answered: 5,
      recommended_program: DS,
      secondary_program: MIS,
      main_decision_pair: "data_science|management_information_systems",
      fit_classification: "strong_fit",
      result_kind: "recommended",
      selected_program_count: 3,
      comparison_cluster: "computer_science|data_science|management_information_systems",
    });
    expect(h.of("recommended_program")).toHaveLength(1);
    expect(h.of("recommended_program")[0]).toMatchObject({ recommended_program: DS, result_kind: "recommended" });
    expect(h.names().at(-2)).toBe("comparison_completed");
    expect(h.names().at(-1)).toBe("recommended_program");
  });

  it("uses a canonical main_decision_pair, not winner-first order", () => {
    const ds = playCase("persona_b_ds").of("comparison_completed")[0]!;
    const mis = playCase("persona_c_mis").of("comparison_completed")[0]!;
    expect(ds.recommended_program).toBe(DS);
    expect(mis.recommended_program).toBe(MIS);
    expect(ds.main_decision_pair).toBe(mis.main_decision_pair);
  });

  it("marks a near tie explicitly while still reporting the engine's top program", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    for (const [questionId, answerId] of NEAR_TIE_ANSWERS) {
      h.tracker.questionViewed();
      h.answer(questionId, answerId);
    }
    const completed = h.of("comparison_completed")[0]!;
    expect(completed.result_kind).toBe("near_tie");
    expect(completed.recommended_program).toBeDefined();
    expect(h.of("recommended_program")[0]!.result_kind).toBe("near_tie");
  });

  it("reports no_strong_fit without inventing a recommendation", () => {
    const h = playCase("persona_d_no_fit");
    const completed = h.of("comparison_completed")[0]!;
    expect(completed.result_kind).toBe("no_strong_fit");
    expect(completed.fit_classification).toBe("no_strong_fit");
    expect(completed.recommended_program).toBeUndefined();
    expect(completed.main_decision_pair).toBeDefined();
    expect(h.of("recommended_program")).toHaveLength(0);
    // The leading program during the questions is analytical metadata, not a recommendation.
    expect(h.of("question_answer").every((e) => e.leading_program !== undefined)).toBe(true);
  });

  it("does not re-emit completion events after a refresh on the result page", () => {
    const storage = memoryStorage();
    const first = playCase("persona_a_cs", { storage });
    const restored = restoreComparison(serializeComparison(first.tracker.getState()));
    expect(restored?.status).toBe("completed");
    const second = makeHarness({ storage, restored });
    expect(second.events()).toEqual([]);
    expect(second.tracker.getComparisonId()).toBe(first.tracker.getComparisonId());
  });
});

describe("result interaction events", () => {
  it("reports the mirror response (yes and no) with result metadata, without touching the result", () => {
    const h = playCase("persona_a_cs");
    const before = h.tracker.getState();
    h.tracker.mirrorResponse("yes");
    h.tracker.mirrorResponse("no");
    expect(h.of("mirror_response")).toMatchObject([
      { mirror_response: "yes", comparison_id: "cmp-1", result_kind: "recommended", recommended_program: CS },
      { mirror_response: "no", comparison_id: "cmp-1" },
    ]);
    expect(h.tracker.getState()).toBe(before);
  });

  it("ignores result interactions before a result exists", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    h.tracker.mirrorResponse("yes");
    h.tracker.admissionClick();
    h.tracker.secondaryProgramViewed();
    expect(h.names()).not.toContain("mirror_response");
    expect(h.names()).not.toContain("admission_click");
    expect(h.names()).not.toContain("secondary_program_view");
  });

  it("fires secondary_program_view and each reality_check_view once per completed result", () => {
    const h = playCase("low_math_ds");
    h.tracker.secondaryProgramViewed();
    h.tracker.secondaryProgramViewed();
    expect(h.of("secondary_program_view")).toHaveLength(1);
    expect(h.of("secondary_program_view")[0]).toMatchObject({ program_id: CS, result_kind: "recommended" });

    h.tracker.realityCheckViewed(DS);
    h.tracker.realityCheckViewed(DS);
    h.tracker.realityCheckViewed(CS);
    expect(h.of("reality_check_view").map((e) => e.program_id)).toEqual([DS, CS]);
  });

  it("counts a re-completed result (after Back) as a new exposure of the result", () => {
    const h = playCase("persona_a_cs");
    h.tracker.secondaryProgramViewed();
    h.dispatch({ type: "go_back" });
    const step = nextComparisonStep(h.tracker.getState());
    if (step?.status !== "ask") throw new Error("expected a question");
    h.answer(step.question.id, step.question.options[0]!.id);
    expect(h.tracker.getState().status).toBe("completed");
    h.tracker.secondaryProgramViewed();
    expect(h.of("secondary_program_view")).toHaveLength(2);
    expect(h.of("comparison_completed")).toHaveLength(2);
  });

  it("reports admission and advisor clicks with comparison and result context", () => {
    const h = playCase("persona_b_ds");
    h.tracker.admissionClick();
    h.tracker.advisorClick();
    expect(h.of("admission_click")).toMatchObject([
      { comparison_id: "cmp-1", recommended_program: DS, secondary_program: MIS, result_kind: "recommended" },
    ]);
    expect(h.of("advisor_cta_click")).toHaveLength(1);
  });
});

describe("restart and focused comparison", () => {
  it("emits restart_comparison from the questions with the abandoned comparison's context", () => {
    const h = makeHarness();
    h.select(CS, DS);
    h.start();
    h.tracker.questionViewed();
    h.answer("Q1", "A");
    h.dispatch({ type: "restart" });
    expect(h.of("restart_comparison")).toMatchObject([
      { comparison_id: "cmp-1", questions_answered: 1, comparison_cluster: "computer_science|data_science" },
    ]);
  });

  it("emits restart_comparison from the result", () => {
    const h = playCase("persona_a_cs");
    h.dispatch({ type: "restart" });
    expect(h.of("restart_comparison")).toMatchObject([{ comparison_id: "cmp-1", questions_answered: 5 }]);
  });

  it("does not emit restart for an already empty state", () => {
    const h = makeHarness();
    h.dispatch({ type: "restart" });
    expect(h.of("restart_comparison")).toHaveLength(0);
  });

  it("represents the focused top-two comparison as restart_comparison; the preselection is not a candidate selection", () => {
    const h = playCase("persona_a_cs");
    const before = h.of("degree_selected").length;
    h.dispatch({ type: "restart" });
    h.dispatch({ type: "toggle_program", programId: CS }, { silent: true });
    h.dispatch({ type: "toggle_program", programId: DS }, { silent: true });
    expect(h.of("restart_comparison")).toHaveLength(1);
    expect(h.of("degree_selected")).toHaveLength(before);
    expect(h.tracker.getState().selectedProgramIds).toEqual([CS, DS]);
    h.start();
    expect(h.of("comparison_started").at(-1)).toMatchObject({
      comparison_id: "cmp-2",
      selected_program_count: 2,
      comparison_cluster: "computer_science|data_science",
    });
  });
});

describe("UTM capture", () => {
  const search = "?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=ad1&utm_term=cs+degree";

  it("adds UTM parameters to events", () => {
    const h = makeHarness({ search });
    h.select(CS, DS);
    h.start();
    expect(h.of("comparison_started")[0]).toMatchObject({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "spring",
      utm_content: "ad1",
      utm_term: "cs degree",
    });
    expect(h.of("degree_selected")[0]).toMatchObject({ utm_source: "google" });
  });

  it("restores UTMs after a refresh (no UTMs in the URL any more) and keeps the first touch", () => {
    const storage = memoryStorage();
    makeHarness({ storage, search });
    const refreshed = makeHarness({ storage, search: "" });
    refreshed.select(CS, DS);
    expect(refreshed.of("degree_selected")[0]).toMatchObject({ utm_source: "google", utm_campaign: "spring" });

    const later = makeHarness({ storage, search: "?utm_source=facebook&utm_campaign=other" });
    later.select(CS, DS);
    expect(later.of("degree_selected")[0]).toMatchObject({ utm_source: "google", utm_campaign: "spring" });
    expect(later.of("degree_selected")[0]!.utm_medium).toBe("cpc");
  });

  it("sends no UTM parameters when none are present, and sanitises odd values", () => {
    const plain = makeHarness();
    plain.select(CS);
    expect(Object.keys(plain.events()[0]!).some((key) => key.startsWith("utm_"))).toBe(false);

    const odd = makeHarness({ search: `?utm_source=${"x".repeat(300)}&utm_medium=%0A%20cpc%20&utm_campaign=` });
    odd.select(CS);
    const event = odd.events()[0]!;
    expect(event.utm_source).toHaveLength(100);
    expect(event.utm_medium).toBe("cpc");
    expect(event.utm_campaign).toBeUndefined();
  });

  it("keeps UTMs out of the durable comparison payload", () => {
    const h = makeHarness({ search });
    h.select(CS, DS);
    const durable = JSON.parse(serializeComparison(h.tracker.getState())!);
    expect(Object.keys(durable).sort()).toEqual(["answers", "selectedProgramIds", "version"]);
    expect(JSON.stringify(durable)).not.toMatch(/utm|comparison_id|cmp-/);
  });
});

describe("privacy and isolation", () => {
  it("emits only documented parameters with safe scalar values and no candidate-facing text", () => {
    const cases = ["persona_a_cs", "persona_b_ds", "persona_c_mis", "persona_d_no_fit", "low_math_ds", "mixed_cs_ds"];
    const allowed = new Set<string>([...ANALYTICS_PARAMS, "event"]);
    for (const id of cases) {
      const h = playCase(id);
      h.tracker.mirrorResponse("yes");
      h.tracker.admissionClick();
      h.tracker.secondaryProgramViewed();
      h.tracker.realityCheckViewed(DS);
      for (const event of h.events()) {
        for (const [key, value] of Object.entries(event)) {
          expect(allowed.has(key)).toBe(true);
          expect(["string", "number", "boolean"]).toContain(typeof value);
          if (typeof value === "string") {
            expect(value).toMatch(SAFE_VALUE);
            expect(value).not.toMatch(/[֐-׿]/);
          }
        }
      }
    }
  });

  it("keeps analytics storage separate from the product state and free of answers or results", () => {
    const storage = memoryStorage();
    playCase("persona_a_cs", { storage });
    const stored = JSON.parse(storage.data.get(ANALYTICS_STORAGE_KEY)!);
    expect(Object.keys(stored).sort()).toEqual(["comparison_id", "last_question_view", "utm", "version"]);
    expect(storage.data.get(ANALYTICS_STORAGE_KEY)).not.toMatch(/answers|result|ranking|score/);
  });

  it("never lets an analytics failure reach the product", () => {
    const host: DataLayerHost = {
      get dataLayer(): unknown[] {
        throw new Error("blocked");
      },
    };
    const h = makeHarness({ host });
    expect(() => {
      h.select(CS, DS);
      h.start();
      h.tracker.questionViewed();
      h.answer("Q1", "A");
    }).not.toThrow();
    expect(h.tracker.getState().answers).toHaveLength(1);
  });

  it("works with no storage and no dataLayer container", () => {
    const h = makeHarness({ storage: undefined });
    h.select(CS, DS);
    expect(Array.isArray(h.host.dataLayer)).toBe(true);
  });
});

describe("deterministic event sequence for a known 5-question persona", () => {
  it("persona A, three programs", () => {
    const h = makeHarness();
    h.tracker.compareViewed("view-1");
    const { programs, policy } = sanity("persona_a_cs");
    h.play(programs, policy());
    expect(h.names()).toEqual([
      "degree_compare_view",
      "degree_selected",
      "degree_selected",
      "degree_selected",
      "comparison_started",
      "question_view",
      "question_answer",
      "question_view",
      "question_answer",
      "question_view",
      "question_answer",
      "adaptive_branch_selected",
      "question_view",
      "question_answer",
      "question_view",
      "question_answer",
      "comparison_completed",
      "recommended_program",
    ]);
    expect(h.of("question_answer").map((e) => [e.question_id, e.answer_id, e.question_index])).toEqual([
      ["Q1", "A", 1],
      ["Q2", "A", 2],
      ["Q3", "5", 3],
      ["CSDS-1", "cs", 4],
      ["CSDS-2", "cs", 5],
    ]);
    expect(h.of("comparison_completed")[0]).toMatchObject({
      recommended_program: CS,
      secondary_program: DS,
      result_kind: "recommended",
      questions_answered: 5,
    });
  });
});
