import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PARAMS,
  DISCOVERY_ANALYTICS_STORAGE_KEY,
  JourneyTracker,
  type DataLayerEvent,
  type DataLayerHost,
} from "@/analytics";
import { BRAND_STRATEGY, journeyStep, WORLD_STRATEGY, type JourneyAction } from "@/flow";
import { v3PersonaChoice, V3_PERSONAS } from "../flow/v3Personas";
import { memoryStorage } from "./harness";

const V3_KEY = "colman-studymatch:analytics-v3";

function harness() {
  const host: DataLayerHost = {};
  const storage = memoryStorage();
  let counter = 0;
  const tracker = new JourneyTracker({
    host,
    storage,
    strategy: WORLD_STRATEGY,
    flowVersion: "v3",
    storageKey: V3_KEY,
    uuid: () => `v3-journey-${(counter += 1)}`,
  });
  tracker.hydrate(null, "");
  const events = () => (host.dataLayer ?? []) as DataLayerEvent[];
  const of = (name: string) => events().filter((e) => e.event === name);
  const dispatch = (action: JourneyAction) => {
    tracker.enqueue(action);
    tracker.flush();
  };
  return { tracker, events, of, dispatch, storage };
}

function complete(h: ReturnType<typeof harness>, personaId: string) {
  const persona = V3_PERSONAS.find((p) => p.id === personaId)!;
  for (const entryId of persona.worlds) h.dispatch({ type: "toggle_entry", entryId });
  h.dispatch({ type: "start" });
  for (let guard = 0; guard < 30; guard++) {
    const step = journeyStep(WORLD_STRATEGY, h.tracker.getState());
    if (step?.status !== "ask") break;
    const question = step.mode === "precision" ? step.question : step.question.question;
    h.tracker.questionContinued();
    h.dispatch({
      type: "record_answer",
      answer: {
        questionId: question.id,
        answerId: v3PersonaChoice(
          persona,
          question.id,
          question.options.map((o) => o.id),
        ),
      },
    });
  }
}

describe("V3 world discovery events", () => {
  it("are part of the analytics vocabulary", () => {
    for (const event of [
      "career_world_discovery_view",
      "career_world_selected",
      "career_world_deselected",
      "career_world_selection_completed",
    ]) {
      expect(ANALYTICS_EVENTS).toContain(event);
    }
    for (const param of ["world_id", "world_ids", "selected_world_count", "world_count_available"]) {
      expect(ANALYTICS_PARAMS as readonly string[]).toContain(param);
    }
  });

  it("report view / select / deselect / completion with world ids, never career_project_* events", () => {
    const h = harness();
    h.tracker.discoveryViewed("view");
    h.tracker.discoveryViewed("view");
    h.dispatch({ type: "toggle_entry", entryId: "law_justice" });
    h.dispatch({ type: "toggle_entry", entryId: "business_markets" });
    h.dispatch({ type: "toggle_entry", entryId: "design_spaces" }); // a third is rejected: no event
    h.dispatch({ type: "toggle_entry", entryId: "law_justice" });
    h.dispatch({ type: "toggle_entry", entryId: "law_justice" });
    h.dispatch({ type: "start" });

    expect(h.of("career_world_discovery_view")).toEqual([
      { event: "career_world_discovery_view", flow_version: "v3", world_count_available: 9 },
    ]);
    expect(
      h.of("career_world_selected").map((e) => [e.world_id, e.selected_world_count, e.selection_position]),
    ).toEqual([
      ["law_justice", 1, 1],
      ["business_markets", 2, 2],
      ["law_justice", 2, 2],
    ]);
    expect(h.of("career_world_deselected")).toEqual([
      { event: "career_world_deselected", flow_version: "v3", world_id: "law_justice", selected_world_count: 1 },
    ]);
    const [completed] = h.of("career_world_selection_completed");
    expect(completed).toMatchObject({
      flow_version: "v3",
      world_ids: "business_markets|law_justice",
      selected_world_count: 2,
      selection_count: 2,
    });
    expect(h.events().some((e) => String(e.event).startsWith("career_project_"))).toBe(false);
    expect(h.events().some((e) => "project_ids" in e || "project_id" in e || "selected_project_count" in e)).toBe(
      false,
    );
  });

  it("stamps flow_version v3 on every event and keeps its own session key", () => {
    const h = harness();
    h.tracker.landingViewed("l");
    h.tracker.started();
    complete(h, "law");
    h.tracker.resultViewed();
    h.tracker.resultProgramClick("law", "primary", "hero");
    h.tracker.resultContactClick("sticky");
    h.tracker.resultAllProgramsClick();
    h.tracker.resultDetailExpanded("why_result");
    h.tracker.leadFormViewed();
    h.tracker.leadFormSubmitted();
    h.tracker.leadFormSucceeded();
    expect(h.events().length).toBeGreaterThan(10);
    for (const event of h.events()) expect(event.flow_version, String(event.event)).toBe("v3");
    expect(h.storage.getItem(V3_KEY)).toBeTruthy();
    expect(h.storage.getItem(DISCOVERY_ANALYTICS_STORAGE_KEY)).toBeNull();
    const [view] = h.of("studymatch_result_view");
    expect(view).toMatchObject({ result_kind: "recommended", recommended_program: "law", selected_world_count: 1 });
    expect(view).toMatchObject({ world_ids: "law_justice" });
  });

  it("answer events fire once per commit (question_continue precedes question_answer for the same question)", () => {
    const h = harness();
    complete(h, "communication_then_people");
    const continues = h.of("question_continue").map((e) => e.question_id);
    const answers = h.of("question_answer").map((e) => e.question_id);
    expect(answers).toEqual(continues);
    expect(answers.slice(0, 2)).toEqual(["WC1", "WP1"]); // the candidate's world order
  });

  it("reports the Tech handoff with the carried world answer", () => {
    const h = harness();
    complete(h, "tech_build");
    expect(h.of("precision_module_handoff")).toMatchObject([
      { flow_version: "v3", module_id: "v1_tech", seeded_answer_count: 1 },
    ]);
  });

  it("never carries personal data", () => {
    const h = harness();
    complete(h, "accounting");
    h.tracker.leadFormSubmitted();
    h.tracker.leadFormFailed("server");
    for (const event of h.events()) {
      for (const forbidden of ["first_name", "last_name", "phone", "email", "consent", "name"]) {
        expect(event).not.toHaveProperty(forbidden);
      }
    }
  });
});

describe("V4 trackers (entry_mode on every event)", () => {
  function v4Harness(mode: "worlds" | "projects") {
    const host: DataLayerHost = {};
    const tracker = new JourneyTracker({
      host,
      storage: memoryStorage(),
      strategy: mode === "projects" ? BRAND_STRATEGY : WORLD_STRATEGY,
      flowVersion: "v4",
      storageKey: `colman-studymatch:analytics-v4:${mode}`,
      baseParams: { entry_mode: mode },
      uuid: () => `v4-${mode}`,
    });
    tracker.hydrate(null, "");
    const events = () => (host.dataLayer ?? []) as DataLayerEvent[];
    const dispatch = (action: JourneyAction) => {
      tracker.enqueue(action);
      tracker.flush();
    };
    return { tracker, events, dispatch };
  }

  it("world mode emits career_world_* with flow_version v4 and entry_mode worlds", () => {
    const h = v4Harness("worlds");
    h.tracker.discoveryViewed("v");
    h.dispatch({ type: "toggle_entry", entryId: "law_justice" });
    h.dispatch({ type: "start" });
    h.tracker.questionViewed();
    const names = h.events().map((e) => e.event);
    expect(names).toEqual(
      expect.arrayContaining([
        "career_world_discovery_view",
        "career_world_selected",
        "career_world_selection_completed",
        "question_view",
      ]),
    );
    expect(names.some((n) => String(n).startsWith("career_project_"))).toBe(false);
    for (const event of h.events()) expect(event).toMatchObject({ flow_version: "v4", entry_mode: "worlds" });
  });

  it("project mode emits career_project_* with flow_version v4 and entry_mode projects", () => {
    const h = v4Harness("projects");
    h.tracker.discoveryViewed("v");
    h.dispatch({ type: "toggle_entry", entryId: "wolt_new_city" });
    h.dispatch({ type: "start" });
    h.dispatch({ type: "record_answer", answer: { questionId: "B1", answerId: "A" } });
    const names = h.events().map((e) => e.event);
    expect(names).toEqual(
      expect.arrayContaining([
        "career_project_discovery_view",
        "career_project_selected",
        "career_project_selection_completed",
        "question_answer",
      ]),
    );
    expect(names.some((n) => String(n).startsWith("career_world_"))).toBe(false);
    for (const event of h.events()) expect(event).toMatchObject({ flow_version: "v4", entry_mode: "projects" });
    const [selected] = h.events().filter((e) => e.event === "career_project_selected");
    expect(selected).toMatchObject({ project_id: "wolt_new_city", selected_project_count: 1 });
    for (const event of h.events())
      for (const k of ["first_name", "last_name", "phone", "email"]) expect(event).not.toHaveProperty(k);
  });

  it("entry_mode and the method events are part of the analytics vocabulary", () => {
    expect(ANALYTICS_PARAMS as readonly string[]).toContain("entry_mode");
    expect(ANALYTICS_EVENTS).toContain("discovery_method_view");
    expect(ANALYTICS_EVENTS).toContain("discovery_method_selected");
  });

  it("a V3 tracker (no baseParams) still emits no entry_mode", () => {
    const h = harness();
    h.tracker.discoveryViewed("v");
    expect(h.events()[0]).not.toHaveProperty("entry_mode");
  });
});
