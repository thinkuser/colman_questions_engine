import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PARAMS,
  DISCOVERY_ANALYTICS_STORAGE_KEY,
  DiscoveryTracker,
  type DataLayerEvent,
  type DataLayerHost,
} from "@/analytics";
import { discoveryStep, type DiscoveryAction, type DiscoveryState } from "@/flow";
import { memoryStorage } from "./harness";

const WOLT = "wolt_new_city";
const NIKE = "nike_israel_launch";
const SPOTIFY = "spotify_discover_weekly";

function harness(options: { restored?: DiscoveryState | null; search?: string } = {}) {
  const host: DataLayerHost = {};
  const storage = memoryStorage();
  let counter = 0;
  const tracker = new DiscoveryTracker({ host, storage, uuid: () => `journey-${(counter += 1)}` });
  tracker.hydrate(options.restored ?? null, options.search ?? "");
  const events = () => (host.dataLayer ?? []) as DataLayerEvent[];
  const of = (name: string) => events().filter((e) => e.event === name);
  const dispatch = (action: DiscoveryAction, silent = false) => {
    tracker.enqueue(action, { silent });
    tracker.flush();
  };
  const toggle = (projectId: string) => dispatch({ type: "toggle_project", projectId });
  const answer = (questionId: string, answerId: string) =>
    dispatch({ type: "record_answer", answer: { questionId, answerId } });
  return { tracker, events, of, dispatch, toggle, answer, storage, host };
}

describe("project selection events", () => {
  it("reports the discovery view once per mounted view, and selection / deselection with position and count", () => {
    const h = harness();
    h.tracker.discoveryViewed("view-1");
    h.tracker.discoveryViewed("view-1"); // re-render / Strict Mode re-run
    expect(h.of("career_project_discovery_view")).toEqual([
      { event: "career_project_discovery_view", flow_version: "v2", project_count_available: 7 },
    ]);

    h.toggle(WOLT);
    h.toggle(NIKE);
    h.toggle(WOLT);
    expect(h.of("career_project_selected")).toEqual([
      {
        event: "career_project_selected",
        flow_version: "v2",
        project_id: WOLT,
        selection_count: 1,
        selection_position: 1,
      },
      {
        event: "career_project_selected",
        flow_version: "v2",
        project_id: NIKE,
        selection_count: 2,
        selection_position: 2,
      },
    ]);
    expect(h.of("career_project_deselected")).toEqual([
      { event: "career_project_deselected", flow_version: "v2", project_id: WOLT, selection_count: 1 },
    ]);
  });

  it("emits nothing for a rejected third project", () => {
    const h = harness();
    ["wolt_new_city", "nike_israel_launch", "tiktok_endless_scroll"].forEach(h.toggle);
    expect(h.of("career_project_selected")).toHaveLength(2);
  });

  it("completes the selection with canonical project ids and starts a journey id", () => {
    const h = harness();
    h.toggle(WOLT);
    h.toggle(NIKE);
    h.dispatch({ type: "start" });
    expect(h.of("career_project_selection_completed")).toMatchObject([
      { flow_version: "v2", project_ids: `${NIKE}|${WOLT}`, selection_count: 2, comparison_id: "journey-1" },
    ]);
    expect(h.of("comparison_started")).toHaveLength(1);
  });
});

describe("question events", () => {
  const started = () => {
    const h = harness();
    h.toggle(WOLT);
    h.dispatch({ type: "start" });
    return h;
  };

  it("tags authored questions with flow, mode, kind and a neutral flag, with no text or scores", () => {
    const h = started();
    h.tracker.questionViewed();
    h.answer("B1", "A");
    h.tracker.questionViewed();
    h.answer("B2", "neither");
    expect(h.of("question_view")[0]).toMatchObject({
      flow_version: "v2",
      question_id: "B1",
      question_mode: "generic",
      question_kind: "scenario",
      is_generated_focus: false,
      question_index: 1,
    });
    expect(h.of("question_answer")).toMatchObject([
      { question_id: "B1", answer_id: "A", is_neutral: false, question_kind: "scenario", question_index: 1 },
      { question_id: "B2", answer_id: "neither", is_neutral: true, question_kind: "focus", question_index: 2 },
    ]);
  });

  it("does not duplicate a question view on a re-render and treats Back as a new exposure", () => {
    const h = started();
    h.tracker.questionViewed();
    h.tracker.questionViewed();
    expect(h.of("question_view")).toHaveLength(1);
    h.answer("B1", "A");
    h.tracker.questionViewed();
    h.dispatch({ type: "go_back" });
    h.tracker.questionViewed();
    expect(h.of("question_view").map((e) => e.question_id)).toEqual(["B1", "B2", "B1"]);
    expect(h.of("discovery_back")).toMatchObject([{ flow_version: "v2", questions_answered: 1 }]);
  });

  it("emits no answer event for a double submit or a stale answer", () => {
    const h = started();
    h.answer("B1", "A");
    h.answer("B1", "A");
    h.answer("B3", "A");
    expect(h.of("question_answer")).toHaveLength(1);
  });

  it("marks generated focus questions with the number of programs compared", () => {
    const h = harness();
    h.toggle("tiktok_endless_scroll");
    h.toggle(NIKE);
    h.dispatch({ type: "start" });
    h.answer("P1", "B");
    h.answer("C1", "B");
    h.tracker.questionViewed();
    expect(h.of("question_view").at(-1)).toMatchObject({
      question_id: "focus:behavioral_science|communication_and_management:0",
      is_generated_focus: true,
      focus_program_count: 2,
      question_kind: "focus",
    });
  });
});

describe("precision handoff", () => {
  it("Spotify alone enters the V1 module unseeded", () => {
    const h = harness();
    h.toggle(SPOTIFY);
    h.dispatch({ type: "start" });
    expect(h.of("precision_module_handoff")).toMatchObject([
      { flow_version: "v2", module_id: "v1_tech", seeded_answer_count: 0 },
    ]);
  });

  it("Spotify + another project hands off once, seeded with the carried answer, and V1 questions keep V1 tagging", () => {
    const h = harness();
    h.toggle(WOLT);
    h.toggle(SPOTIFY);
    h.dispatch({ type: "start" });
    h.answer("T1", "B");
    h.answer("B1", "A");
    expect(h.of("precision_module_handoff")).toHaveLength(0);
    h.answer("focus:business_administration|data_science:0", "B");
    expect(h.of("precision_module_handoff")).toMatchObject([{ module_id: "v1_tech", seeded_answer_count: 1 }]);
    h.tracker.questionViewed();
    expect(h.of("question_view").at(-1)).toMatchObject({ question_id: "Q2", question_mode: "precision" });
    expect(h.of("question_view").at(-1)).not.toHaveProperty("question_kind");
  });
});

describe("result events", () => {
  function finish(script: Array<[string, string]>) {
    const h = harness();
    h.toggle(WOLT);
    h.dispatch({ type: "start" });
    for (const [q, a] of script) h.answer(q, a);
    return h;
  }

  it("reports completion, the recommendation and a single result view with safe counts", () => {
    const h = finish([
      ["B1", "A"],
      ["B2", "A"],
      ["B3", "A"],
    ]);
    expect(h.of("comparison_completed")).toMatchObject([
      {
        flow_version: "v2",
        result_kind: "recommended",
        recommended_program: "business_administration",
        selected_project_count: 1,
        scored_answer_count: 3,
        total_answer_count: 3,
      },
    ]);
    expect(h.of("recommended_program")).toHaveLength(1);
    h.tracker.resultViewed();
    h.tracker.resultViewed();
    expect(h.of("studymatch_result_view")).toMatchObject([
      { result_kind: "recommended", recommended_program: "business_administration", total_answer_count: 3 },
    ]);
  });

  it("reports near ties and insufficient evidence without a recommended program", () => {
    const tie = finish([
      ["B1", "A"],
      ["B2", "B"],
      ["B3", "A"],
      ["B4", "B"],
      ["B5", "neither"],
    ]);
    expect(tie.of("comparison_completed")[0]).toMatchObject({
      result_kind: "near_tie",
      alternative_programs: "business_administration|economics_and_management",
    });
    expect(tie.of("comparison_completed")[0]).not.toHaveProperty("recommended_program");
    expect(tie.of("recommended_program")).toHaveLength(0);

    const weak = finish([
      ["B1", "A"],
      ["B2", "neither"],
      ["B3", "neither"],
      ["B4", "neither"],
      ["B5", "neither"],
    ]);
    expect(weak.of("comparison_completed")[0]).toMatchObject({ result_kind: "insufficient_positive_evidence" });
  });

  it("tags the V1 precision result and the official program click", () => {
    const h = harness();
    h.toggle(SPOTIFY);
    h.dispatch({ type: "start" });
    for (const [q, a] of [
      ["Q1", "A"],
      ["Q2", "A"],
      ["Q3", "5"],
      ["CSDS-1", "cs"],
      ["CSDS-2", "cs"],
    ])
      h.answer(q!, a!);
    expect(h.of("comparison_completed")[0]).toMatchObject({
      result_kind: "v1_precision_result",
      recommended_program: "computer_science",
      total_answer_count: 5,
    });
    h.tracker.officialProgramClick("computer_science", "primary");
    expect(h.of("official_program_click")).toMatchObject([
      { program_id: "computer_science", link_role: "primary", result_kind: "v1_precision_result" },
    ]);
  });

  it("emits restart with the answers given, and result events only while a result is shown", () => {
    const h = harness();
    h.tracker.admissionClick(); // no result yet: nothing
    h.toggle(WOLT);
    h.dispatch({ type: "start" });
    h.answer("B1", "A");
    h.dispatch({ type: "restart" });
    expect(h.of("restart_comparison")).toMatchObject([{ flow_version: "v2", questions_answered: 1 }]);
    expect(h.of("admission_click")).toHaveLength(0);
  });
});

describe("privacy and robustness", () => {
  it("only ever sends documented parameter names and scalar values, never text or scores", () => {
    const h = harness({ search: "?utm_source=newsletter" });
    h.tracker.discoveryViewed("v");
    h.toggle(WOLT);
    h.dispatch({ type: "start" });
    for (const [q, a] of [
      ["B1", "A"],
      ["B2", "A"],
      ["B3", "A"],
    ]) {
      h.tracker.questionViewed();
      h.answer(q!, a!);
    }
    h.tracker.resultViewed();
    const allowed = new Set<string>([...ANALYTICS_PARAMS, "event"]);
    for (const event of h.events()) {
      for (const [key, value] of Object.entries(event)) {
        expect(allowed.has(key), `${event.event}.${key}`).toBe(true);
        expect(["string", "number", "boolean"]).toContain(typeof value);
        if (typeof value === "string") expect(value).not.toMatch(/[֐-׿]/);
      }
      // Counts of answers are fine; fit scores, support counts and shortlist internals are never sent.
      for (const key of Object.keys(event))
        expect(key).not.toMatch(/^(score|scores|support|shortlist|ranking|points)$/);
    }
    expect(h.of("career_project_selected")[0]).toMatchObject({ utm_source: "newsletter" });
  });

  it("emits nothing when hydrating a refreshed journey, and restores the journey id", () => {
    const first = harness();
    first.toggle(WOLT);
    first.dispatch({ type: "start" });
    first.answer("B1", "A");
    const restoredState = first.tracker.getState();
    const second = new DiscoveryTracker({ host: {}, storage: first.storage, uuid: () => "other" });
    second.hydrate(restoredState, "");
    expect(second.getJourneyId()).toBe("journey-1");
    expect(first.storage.data.has(DISCOVERY_ANALYTICS_STORAGE_KEY)).toBe(true);
  });

  it("swallows failures and never needs a dataLayer", () => {
    const tracker = new DiscoveryTracker({ host: null, storage: null });
    tracker.hydrate(null);
    tracker.enqueue({ type: "toggle_project", projectId: WOLT });
    expect(() => tracker.flush()).not.toThrow();
    expect(() => tracker.questionViewed()).not.toThrow();
    expect(discoveryStep(tracker.getState())).toBeNull();
  });
});
