import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PARAMS,
  FEEDBACK_FIT_VALUES,
  FEEDBACK_HELPFULNESS_VALUES,
  hasSubmittedResultFeedback,
  JourneyTracker,
  rememberResultFeedback,
  RESULT_FEEDBACK_STORAGE_KEY,
  resultFeedbackKey,
  STUDYMATCH_OUTBOUND_UTM,
  trackEvent,
  UI_DESTINATION_TYPES,
  UI_ELEMENT_IDS,
  UI_ELEMENT_TYPES,
  UI_SCREEN_IDS,
  withStudyMatchOutboundUtm,
  type DataLayerEvent,
  type DataLayerHost,
} from "@/analytics";
import { V5_FEEDBACK_COPY, V5_PROJECTS } from "@/data";
import {
  initialJourneyState,
  journeyReducer,
  journeyStep,
  PROJECT_STRATEGY,
  strategyForV5EntryMode,
  V5_STORAGE_KEY,
  type JourneyAction,
} from "@/flow";
import { gtmContainerId } from "@/ui/analytics/GtmLoader";
import { masculineHits } from "../flow/inclusiveScan";
import { memoryStorage } from "./harness";

/** V5 pilot measurement layer (DEC-038). */

describe("outbound UTMs (withStudyMatchOutboundUtm)", () => {
  const fixed = "utm_source=study_match&utm_medium=questionaire&utm_campaign=ai_tools";

  it("uses exactly the agreed values (questionaire is intentionally spelled this way)", () => {
    expect(STUDYMATCH_OUTBOUND_UTM).toEqual({
      utm_source: "study_match",
      utm_medium: "questionaire",
      utm_campaign: "ai_tools",
    });
  });

  it("adds all three parameters to an http(s) URL", () => {
    expect(withStudyMatchOutboundUtm("https://www.colman.ac.il/programs/law")).toBe(
      `https://www.colman.ac.il/programs/law?${fixed}`,
    );
    expect(withStudyMatchOutboundUtm("http://example.org")).toBe(`http://example.org?${fixed}`);
  });

  it("preserves existing query parameters (as written) and the fragment", () => {
    expect(withStudyMatchOutboundUtm("https://academy.org.il/x?lang=he&a=%D7%90#apply")).toBe(
      `https://academy.org.il/x?lang=he&a=%D7%90&${fixed}#apply`,
    );
  });

  it("overrides conflicting utm_source / medium / campaign but keeps other UTMs", () => {
    expect(
      withStudyMatchOutboundUtm(
        "https://colman.ac.il/p?utm_source=old&utm_medium=x&utm_campaign=y&utm_content=keep&UTM_SOURCE=dup",
      ),
    ).toBe(`https://colman.ac.il/p?utm_content=keep&${fixed}`);
  });

  it("leaves internal, relative, anchor and non-http links (and malformed / empty values) unchanged", () => {
    for (const url of [
      "/v5/result",
      "v5/start",
      "#v3-lead",
      "tel:+972501234567",
      "mailto:info@colman.ac.il",
      "javascript:void(0)",
      "https://",
      "http:// broken",
      "",
      "   ",
    ])
      expect(withStudyMatchOutboundUtm(url), url).toBe(url);
    expect(withStudyMatchOutboundUtm(null)).toBeNull();
    expect(withStudyMatchOutboundUtm(undefined)).toBeUndefined();
  });

  it("is idempotent (applying it twice gives the same URL)", () => {
    const once = withStudyMatchOutboundUtm("https://colman.ac.il/p?x=1#h");
    expect(withStudyMatchOutboundUtm(once)).toBe(once);
  });
});

function v5Harness(mode: "worlds" | "projects" = "projects") {
  const host: DataLayerHost = {};
  const tracker = new JourneyTracker({
    host,
    storage: memoryStorage(),
    strategy: strategyForV5EntryMode(mode),
    flowVersion: "v5",
    storageKey: `colman-studymatch:analytics-v5:${mode}`,
    baseParams: { entry_mode: mode },
    uuid: () => "j-1",
  });
  tracker.hydrate(null, "?utm_source=newsletter&utm_campaign=open_day");
  const events = () => (host.dataLayer ?? []) as DataLayerEvent[];
  const dispatch = (action: JourneyAction) => {
    tracker.enqueue(action);
    tracker.flush();
  };
  return { tracker, events, dispatch };
}

/** Answers with the first option until the V5 projects journey completes. */
function completeJourney(h: ReturnType<typeof v5Harness>, ids: string[]) {
  for (const entryId of ids) h.dispatch({ type: "toggle_entry", entryId });
  h.dispatch({ type: "start" });
  for (let i = 0; i < 30; i++) {
    const step = journeyStep(PROJECT_STRATEGY, h.tracker.getState());
    if (step?.status !== "ask") break;
    const q = step.mode === "precision" ? step.question : step.question.question;
    h.dispatch({ type: "record_answer", answer: { questionId: q.id, answerId: q.options[0]!.id } });
  }
}

describe("ui_click (V5)", () => {
  it("is a documented event with a small, closed vocabulary of documented parameters", () => {
    expect(ANALYTICS_EVENTS).toEqual(
      expect.arrayContaining(["ui_click", "result_feedback_view", "result_feedback_submit"]),
    );
    for (const param of ["element_id", "element_type", "screen_id", "destination_type"])
      expect(ANALYTICS_PARAMS as readonly string[]).toContain(param);
    expect(UI_ELEMENT_TYPES).toEqual(["button", "link", "card", "answer_option", "detail_toggle"]);
    expect(UI_SCREEN_IDS).toHaveLength(9);
    expect(UI_DESTINATION_TYPES).toHaveLength(8);
    for (const id of UI_ELEMENT_IDS) expect(id).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it("carries the journey context and the contextual id, never a label", () => {
    const h = v5Harness();
    h.tracker.uiClick({
      element_id: "discovery_project_card",
      element_type: "card",
      screen_id: "projects",
      project_id: "people_retention",
    });
    const [click] = h.events();
    expect(click).toMatchObject({
      event: "ui_click",
      flow_version: "v5",
      entry_mode: "projects",
      element_id: "discovery_project_card",
      element_type: "card",
      screen_id: "projects",
      project_id: "people_retention",
      utm_source: "newsletter", // inbound acquisition context, unchanged
    });
    const card = V5_PROJECTS.find((p) => p.id === "people_retention")!;
    expect(JSON.stringify(click)).not.toContain(card.titleHe);
    expect(JSON.stringify(click)).not.toContain(card.cardHe);
  });

  it("on a question screen adds the question position; on the result screen adds the result context", () => {
    const h = v5Harness();
    h.dispatch({ type: "toggle_entry", entryId: "nike_launch" });
    h.dispatch({ type: "start" });
    h.tracker.uiClick({
      element_id: "answer_option",
      element_type: "answer_option",
      screen_id: "question",
      question_id: "V5-NIKE",
      answer_id: "B",
    });
    expect(h.events().at(-1)).toMatchObject({
      element_id: "answer_option",
      question_id: "V5-NIKE",
      answer_id: "B",
      question_index: 1,
      question_mode: "generic",
      question_kind: "scenario",
      comparison_id: "j-1",
      project_ids: "nike_launch",
    });

    const r = v5Harness();
    completeJourney(r, ["accounting_gap"]);
    r.tracker.uiClick({
      element_id: "result_program",
      element_type: "link",
      screen_id: "result",
      destination_type: "program",
      program_id: "accounting",
      link_role: "primary",
      cta_position: "hero",
    });
    const click = r.events().at(-1)!;
    expect(click).toMatchObject({ event: "ui_click", destination_type: "program", link_role: "primary" });
    expect(click.result_kind).toBeDefined();
    expect(click.total_answer_count).toBeGreaterThan(0);
  });

  it("omits non-applicable parameters instead of sending empty strings", () => {
    const h = v5Harness();
    h.tracker.uiClick({ element_id: "landing_start", element_type: "button", screen_id: "landing", project_id: "" });
    const [click] = h.events();
    expect(click).not.toHaveProperty("project_id");
    expect(click).not.toHaveProperty("comparison_id");
    expect(Object.values(click!).every((value) => value !== "")).toBe(true);
  });

  it("the transport still drops anything that is not a documented parameter (labels, names, phone)", () => {
    const host: DataLayerHost = {};
    const payload = trackEvent(
      "ui_click",
      { element_id: "lead_submit", label: "חזרו אליי", first_name: "דנה", phone: "0501234567" } as never,
      host,
    )!;
    expect(payload).toEqual({ event: "ui_click", element_id: "lead_submit" });
  });
});

describe("pilot feedback events", () => {
  it("result_feedback_submit carries canonical values and the full result context, once per result state", () => {
    const h = v5Harness();
    completeJourney(h, ["accounting_gap"]);
    h.tracker.resultFeedbackViewed();
    h.tracker.resultFeedbackViewed();
    h.tracker.resultFeedbackSubmitted({ fit: "quite_suitable", helpfulness: "somewhat" });
    const views = h.events().filter((e) => e.event === "result_feedback_view");
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ feedback_version: "v1", flow_version: "v5", entry_mode: "projects" });
    const [submit] = h.events().filter((e) => e.event === "result_feedback_submit");
    expect(submit).toMatchObject({
      flow_version: "v5",
      entry_mode: "projects",
      comparison_id: "j-1",
      feedback_fit: "quite_suitable",
      feedback_helpfulness: "somewhat",
      feedback_version: "v1",
      project_ids: "accounting_gap",
    });
    expect(submit!.result_kind).toBeDefined();
    expect(submit!.scored_answer_count).toBeGreaterThan(0);
    expect(submit!.total_answer_count).toBeGreaterThan(0);
    // No scores are exposed.
    expect(Object.keys(submit!).some((key) => /score(?!d_answer_count)/.test(key))).toBe(false);
  });

  it("never sends an empty or unknown value; helpfulness-only submissions carry no feedback_fit", () => {
    const h = v5Harness();
    completeJourney(h, ["accounting_gap"]);
    h.tracker.resultFeedbackSubmitted({});
    h.tracker.resultFeedbackSubmitted({ fit: "great" as never, helpfulness: "maybe" as never });
    expect(h.events().filter((e) => e.event === "result_feedback_submit")).toHaveLength(0);
    h.tracker.resultFeedbackSubmitted({ helpfulness: "yes" });
    const [submit] = h.events().filter((e) => e.event === "result_feedback_submit");
    expect(submit).toMatchObject({ feedback_helpfulness: "yes" });
    expect(submit).not.toHaveProperty("feedback_fit");
  });

  it("emits nothing outside a completed result (feedback cannot exist without a result)", () => {
    const h = v5Harness();
    h.dispatch({ type: "toggle_entry", entryId: "nike_launch" });
    h.tracker.resultFeedbackSubmitted({ helpfulness: "yes" });
    expect(h.events().filter((e) => e.event === "result_feedback_submit")).toHaveLength(0);
  });

  it("the feedback copy offers exactly the canonical values, is inclusive and has no free text", () => {
    expect(V5_FEEDBACK_COPY.fit.question).toBe("עד כמה הכיוון שקיבלת מרגיש מתאים?");
    expect(V5_FEEDBACK_COPY.fit.options.map((o) => o.value)).toEqual([...FEEDBACK_FIT_VALUES]);
    expect(V5_FEEDBACK_COPY.fit.options.map((o) => o.label)).toEqual(["מאוד מתאים", "די מתאים", "לא בטוח", "לא מתאים"]);
    expect(V5_FEEDBACK_COPY.helpfulness.question).toBe("האם התהליך עזר לצמצם את האפשרויות?");
    expect(V5_FEEDBACK_COPY.helpfulness.insufficientQuestion).toBe("האם התהליך עזר להבין קצת יותר מה מתאים ומה פחות?");
    expect(V5_FEEDBACK_COPY.helpfulness.options.map((o) => o.value)).toEqual([...FEEDBACK_HELPFULNESS_VALUES]);
    const texts = [
      V5_FEEDBACK_COPY.title,
      V5_FEEDBACK_COPY.note,
      V5_FEEDBACK_COPY.fit.question,
      V5_FEEDBACK_COPY.helpfulness.question,
      V5_FEEDBACK_COPY.helpfulness.insufficientQuestion,
      V5_FEEDBACK_COPY.submit,
      V5_FEEDBACK_COPY.thanks,
      ...V5_FEEDBACK_COPY.fit.options.map((o) => o.label),
      ...V5_FEEDBACK_COPY.helpfulness.options.map((o) => o.label),
    ];
    expect(texts.filter((text) => masculineHits(text).length > 0)).toEqual([]);
  });
});

describe("feedback dedupe (presentation state only)", () => {
  it("one submission per result state; a new result after Back + different answers gets a new key", () => {
    const storage = memoryStorage();
    const a = resultFeedbackKey("j-1", ["nike_launch"], [{ questionId: "V5-NIKE", answerId: "A" }]);
    const b = resultFeedbackKey("j-1", ["nike_launch"], [{ questionId: "V5-NIKE", answerId: "B" }]);
    expect(a).not.toBe(b);
    expect(hasSubmittedResultFeedback(storage, a)).toBe(false);
    rememberResultFeedback(storage, a);
    expect(hasSubmittedResultFeedback(storage, a)).toBe(true);
    expect(hasSubmittedResultFeedback(storage, b)).toBe(false);
  });

  it("uses its own storage key, never the V5 journey payload, and survives broken storage", () => {
    expect(RESULT_FEEDBACK_STORAGE_KEY).not.toBe(V5_STORAGE_KEY);
    const storage = memoryStorage();
    rememberResultFeedback(storage, "k");
    expect([...storage.data.keys()]).toEqual([RESULT_FEEDBACK_STORAGE_KEY]);
    storage.setItem(RESULT_FEEDBACK_STORAGE_KEY, "{not json");
    expect(hasSubmittedResultFeedback(storage, "k")).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberResultFeedback(broken, "k")).not.toThrow();
    expect(hasSubmittedResultFeedback(broken, "k")).toBe(false);
  });

  it("feedback never enters the engine: the journey reducer state has no feedback anywhere", () => {
    const state = journeyReducer(PROJECT_STRATEGY, initialJourneyState, {
      type: "toggle_entry",
      entryId: "nike_launch",
    });
    expect(Object.keys(state).sort()).toEqual(["answers", "phase", "selectedIds"]);
  });
});

describe("GTM loader guard", () => {
  it("accepts only a valid container id; nothing otherwise", () => {
    expect(gtmContainerId("GTM-ABC1234")).toBe("GTM-ABC1234");
    expect(gtmContainerId(" gtm-abc1234 ")).toBe("GTM-ABC1234");
    for (const bad of [undefined, "", "UA-123", "GTM-", "GTM-abc<script>", "G-ABC1234"])
      expect(gtmContainerId(bad)).toBeNull();
  });
});

describe("machine-readable event matrix (docs/analytics/v5_event_matrix.json)", () => {
  it("only names documented events and parameters, so a GTM build from it can never drift from the code", async () => {
    const matrix = (await import("../../docs/analytics/v5_event_matrix.json")).default as {
      events: Array<{ event_name: string; required_params: string[]; optional_params: string[] }>;
      context_groups: Record<string, string[]>;
    };
    const events = new Set<string>(ANALYTICS_EVENTS);
    const params = new Set<string>(ANALYTICS_PARAMS);
    for (const entry of matrix.events) {
      expect(events.has(entry.event_name), entry.event_name).toBe(true);
      for (const param of [...entry.required_params, ...entry.optional_params])
        expect(params.has(param), `${entry.event_name}.${param}`).toBe(true);
    }
    for (const group of Object.values(matrix.context_groups))
      for (const param of group) expect(params.has(param), param).toBe(true);
    for (const name of ["ui_click", "result_feedback_view", "result_feedback_submit", "studymatch_result_view"])
      expect(matrix.events.some((entry) => entry.event_name === name)).toBe(true);
  });
});
