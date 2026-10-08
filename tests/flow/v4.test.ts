import { describe, expect, it } from "vitest";
import { CAREER_PROJECTS, V3_WORLDS } from "@/data";
import type { RecordedAnswer, V2Step } from "@/engine";
import {
  BRAND_STRATEGY,
  DISCOVERY_STORAGE_KEY,
  V3_STORAGE_KEY,
  V4_STORAGE_KEY,
  V4_STORAGE_VERSION,
  WORLD_STRATEGY,
  buildLeadRequest,
  buildLeadWebhookPayload,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  leadContextFromResult,
  LeadRequestSchema,
  nextDiscoveryStep,
  normalizePhone,
  restoreDiscovery,
  restoreV3Journey,
  restoreV4Journey,
  serializeDiscovery,
  serializeV3Journey,
  serializeV4Journey,
  strategyForEntryMode,
  buildV3ResultView,
  type DiscoveryStrategy,
  type JourneyState,
} from "@/flow";
import { v4Allows, v4Target } from "@/ui/state/v4Rules";
import { personaChoice, V2_PERSONAS, type V2Persona } from "./v2Personas";
import { runPersona } from "./v2PersonaRun";
import { runV3Persona } from "./v3PersonaRun";
import { v3PersonaChoice, V3_PERSONAS, type V3Persona } from "./v3Personas";

/** Run a persona through a strategy with the generic journey reducer (the code path V4 uses for both entry modes). */
function runJourney(
  strategy: DiscoveryStrategy,
  selection: readonly string[],
  choose: (questionId: string, offered: readonly string[]) => string,
) {
  let state: JourneyState = selection.reduce(
    (current, entryId) => journeyReducer(strategy, current, { type: "toggle_entry", entryId }),
    initialJourneyState,
  );
  state = journeyReducer(strategy, state, { type: "start" });
  const asked: string[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const step = journeyStep(strategy, state);
    if (step?.status !== "ask") break;
    const question = step.mode === "precision" ? step.question : step.question.question;
    const answerId = choose(
      question.id,
      question.options.map((o) => o.id),
    );
    asked.push(question.id);
    state = journeyReducer(strategy, state, { type: "record_answer", answer: { questionId: question.id, answerId } });
  }
  const end = journeyStep(strategy, state)!;
  return { state, end, asked };
}
const runV4Projects = (p: V2Persona) =>
  runJourney(BRAND_STRATEGY, p.projects, (id, offered) => personaChoice(p, id, offered));
const runV4Worlds = (p: V3Persona) =>
  runJourney(WORLD_STRATEGY, p.worlds, (id, offered) => v3PersonaChoice(p, id, offered));

describe("V4 entry mode only selects the strategy", () => {
  it("maps worlds -> WORLD_STRATEGY and projects -> BRAND_STRATEGY (the existing strategies, not forks)", () => {
    expect(strategyForEntryMode("worlds")).toBe(WORLD_STRATEGY);
    expect(strategyForEntryMode("projects")).toBe(BRAND_STRATEGY);
    expect(BRAND_STRATEGY.entryIds).toEqual(CAREER_PROJECTS.map((p) => p.id));
    expect(WORLD_STRATEGY.entryIds).toEqual(V3_WORLDS.map((w) => w.id));
  });

  it("choosing a method gives no points: the first step of each strategy has zero scores and support", () => {
    for (const [strategy, selection] of [
      [BRAND_STRATEGY, ["wolt_new_city"]],
      [WORLD_STRATEGY, ["business_markets"]],
    ] as const) {
      const state = journeyReducer(
        strategy,
        journeyReducer(strategy, initialJourneyState, { type: "toggle_entry", entryId: selection[0]! }),
        { type: "start" },
      );
      const step = journeyStep(strategy, state)!;
      expect(step.state.scoredAnswerCount).toBe(0);
      expect(Object.values(step.state.scores).every((v) => v === 0)).toBe(true);
      expect(Object.values(step.state.support).every((v) => v === 0)).toBe(true);
    }
  });
});

describe("V4 engine equivalence", () => {
  it.each(V2_PERSONAS.map((p) => [p.id, p] as const))(
    "projects / %s: same outcome as the V2 brand flow for the same answers",
    (_id, persona) => {
      const v2 = runPersona(persona);
      const v4 = runV4Projects(persona);
      expect(v4.asked).toEqual(v2.asked);
      const v2End = nextDiscoveryStep({ selectedProjectIds: v2.state.selectedProjectIds, answers: v2.state.answers });
      expect(v4.end.status).toBe("complete");
      if (v4.end.status === "complete" && v2End.status === "complete") expect(v4.end.outcome).toEqual(v2End.outcome);
    },
  );

  it.each(V3_PERSONAS.map((p) => [p.id, p] as const))(
    "worlds / %s: same outcome as the V3 world flow for the same answers",
    (_id, persona) => {
      const v3 = runV3Persona(persona);
      const v4 = runV4Worlds(persona);
      expect(v4.asked).toEqual(v3.asked);
      expect(v4.end).toEqual(v3.step);
    },
  );

  it("project mode keeps V2's routing semantics: openers follow display order, not click order", () => {
    const clickOrder = ["nike_israel_launch", "tiktok_endless_scroll"];
    const step = BRAND_STRATEGY.nextStep(clickOrder, []);
    const v2 = nextDiscoveryStep({ selectedProjectIds: clickOrder, answers: [] });
    const id = (s: V2Step) => (s.status === "ask" && s.mode === "generic" ? s.question.question.id : null);
    expect(id(step)).toBe(id(v2));
    expect(id(step)).toBe("P1"); // TikTok (display order 3) before Nike (5)
  });

  it("world mode keeps V3's routing semantics: openers follow the candidate's selection order", () => {
    const id = (s: V2Step) => (s.status === "ask" && s.mode === "generic" ? s.question.question.id : null);
    expect(id(WORLD_STRATEGY.nextStep(["law_justice", "business_markets"], []))).toBe("WL1");
    expect(id(WORLD_STRATEGY.nextStep(["business_markets", "law_justice"], []))).toBe("WB1");
  });
});

describe("Tech in both V4 paths reaches the same V1 logic", () => {
  it("projects: Spotify alone hands over immediately and V1 asks its own Q1 (the V2 behaviour)", () => {
    const step = BRAND_STRATEGY.nextStep(["spotify_discover_weekly"], []);
    expect(step.status === "ask" && step.mode === "precision" && step.question.id).toBe("Q1");
  });

  it("worlds: WT1 is carried into V1 as Q1 and V1 continues at Q2 (the approved V3 behaviour)", () => {
    const step = WORLD_STRATEGY.nextStep(["technology_data"], [{ questionId: "WT1", answerId: "A" }]);
    expect(step.status === "ask" && step.mode === "precision" && step.question.id).toBe("Q2");
    expect(step.state.precision?.carriedAnswers).toEqual([{ questionId: "Q1", answerId: "A" }]);
  });

  it("the same V1 answers give the same V1 result whichever V4 path entered Tech", () => {
    const v1: RecordedAnswer[] = [
      { questionId: "Q2", answerId: "A" },
      { questionId: "Q3", answerId: "1" },
      { questionId: "CSDS-1", answerId: "cs" },
      { questionId: "CSDS-2", answerId: "cs" },
    ];
    const finish = (strategy: DiscoveryStrategy, selection: string[], first: RecordedAnswer) => {
      const answers = [first];
      let step = strategy.nextStep(selection, answers);
      for (const answer of v1) {
        if (step.status !== "ask" || step.mode !== "precision" || step.question.id !== answer.questionId) break;
        answers.push(answer);
        step = strategy.nextStep(selection, answers);
      }
      return step;
    };
    const projects = finish(BRAND_STRATEGY, ["spotify_discover_weekly"], { questionId: "Q1", answerId: "A" });
    const worlds = finish(WORLD_STRATEGY, ["technology_data"], { questionId: "WT1", answerId: "A" });
    expect(worlds.status).toBe(projects.status);
    if (worlds.status === "complete" && projects.status === "complete")
      expect(worlds.outcome).toEqual(projects.outcome);
  });
});

describe("V4 persistence", () => {
  const worldPersona = V3_PERSONAS.find((p) => p.id === "communication_then_people")!;
  const worlds = runV4Worlds(worldPersona).state;
  const projects = runV4Projects(V2_PERSONAS.find((p) => p.id === "accounting")!).state;

  it("uses its own key and the specified schema", () => {
    expect(V4_STORAGE_KEY).toBe("colman-studymatch:v4:journey");
    expect([DISCOVERY_STORAGE_KEY, V3_STORAGE_KEY]).not.toContain(V4_STORAGE_KEY);
    expect(V4_STORAGE_VERSION).toBe(1);
    const stored = JSON.parse(serializeV4Journey({ entryMode: "worlds", journey: worlds })!);
    expect(Object.keys(stored).sort()).toEqual(["answers", "entryMode", "flow", "phase", "selectedIds", "version"]);
    expect(stored).toMatchObject({ version: 1, flow: "v4", entryMode: "worlds", phase: "answering" });
  });

  it("round-trips both entry modes by replay (and a chosen method with nothing selected)", () => {
    expect(restoreV4Journey(serializeV4Journey({ entryMode: "worlds", journey: worlds }))).toEqual({
      entryMode: "worlds",
      journey: worlds,
    });
    expect(restoreV4Journey(serializeV4Journey({ entryMode: "projects", journey: projects }))).toEqual({
      entryMode: "projects",
      journey: projects,
    });
    expect(restoreV4Journey(serializeV4Journey({ entryMode: "projects", journey: initialJourneyState }))).toEqual({
      entryMode: "projects",
      journey: initialJourneyState,
    });
    expect(serializeV4Journey({ entryMode: null, journey: initialJourneyState })).toBeNull();
  });

  it("never reads V2 or V3 state, and V2/V3 never read V4 state", () => {
    const v4 = serializeV4Journey({ entryMode: "worlds", journey: worlds })!;
    expect(restoreDiscovery(v4)).toBeNull();
    expect(restoreV3Journey(WORLD_STRATEGY, v4)).toBeNull();
    expect(restoreV4Journey(serializeV3Journey(WORLD_STRATEGY, worlds))).toBeNull();
    expect(
      restoreV4Journey(serializeDiscovery({ phase: "selecting", selectedProjectIds: ["wolt_new_city"], answers: [] })),
    ).toBeNull();
  });

  it("rejects ids of the other mode and inconsistent state", () => {
    const bad = (entryMode: string, selectedIds: string[]) =>
      JSON.stringify({ version: 1, flow: "v4", entryMode, phase: "selecting", selectedIds, answers: [] });
    expect(restoreV4Journey(bad("worlds", ["wolt_new_city"]))).toBeNull();
    expect(restoreV4Journey(bad("projects", ["law_justice"]))).toBeNull();
    expect(restoreV4Journey(bad("other", []))).toBeNull();
    expect(
      restoreV4Journey(
        JSON.stringify({
          version: 1,
          flow: "v4",
          entryMode: null,
          phase: "selecting",
          selectedIds: ["law_justice"],
          answers: [],
        }),
      ),
    ).toBeNull();
  });
});

describe("V4 routing rules (back behaviour)", () => {
  const empty = initialJourneyState;
  const selected = journeyReducer(WORLD_STRATEGY, empty, { type: "toggle_entry", entryId: "law_justice" });
  const started = journeyReducer(WORLD_STRATEGY, selected, { type: "start" });

  it("no method yet -> landing; method chosen -> its discovery screen; then the V3 rules", () => {
    expect(v4Target(null, empty, false)).toBe("landing");
    expect(v4Target("worlds", empty, false)).toBe("discover");
    expect(v4Target("worlds", selected, false)).toBe("discover");
    expect(v4Target("worlds", started, false)).toBe("ready");
    expect(v4Target("worlds", started, true)).toBe("questions");
    // Back from the first question returns to the chosen discovery screen.
    const back = journeyReducer(WORLD_STRATEGY, started, { type: "go_back" });
    expect(v4Target("worlds", back, true)).toBe("discover");
  });

  it("the method screen is reachable from the landing and from discovery, never mid-questions", () => {
    expect(v4Allows("start", "landing")).toBe(true);
    expect(v4Allows("start", "discover")).toBe(true);
    expect(v4Allows("start", "questions")).toBe(false);
    expect(v4Allows("discover", "landing")).toBe(true); // a direct /v4/worlds or /v4/projects link
    expect(v4Allows("result", "questions")).toBe(false);
    expect(v4Allows("questions", "questions")).toBe(true);
  });
});

describe("V4 lead payload", () => {
  const worldRun = runV4Worlds(V3_PERSONAS.find((p) => p.id === "law")!);
  const projectRun = runV4Projects(V2_PERSONAS.find((p) => p.id === "accounting")!);
  const context = (run: typeof worldRun, strategyId: "worlds" | "brand_projects") => {
    if (run.end.status !== "complete") throw new Error("not complete");
    return leadContextFromResult(
      buildV3ResultView(run.end, run.state.selectedIds, run.state.answers, { strategyId }).base,
    );
  };
  const base = {
    firstName: "דנה",
    lastName: "לוי",
    phone: "0501234567",
    consent: true,
    website: "",
    comparisonId: "j",
  };
  const worldsBody = buildLeadRequest({
    ...base,
    flowVersion: "v4",
    entryMode: "worlds",
    context: context(worldRun, "worlds"),
    selectedProjectIds: [],
    selectedWorldIds: worldRun.state.selectedIds,
  });
  const projectsBody = buildLeadRequest({
    ...base,
    flowVersion: "v4",
    entryMode: "projects",
    context: context(projectRun, "brand_projects"),
    selectedProjectIds: projectRun.state.selectedIds,
  });
  const payload = (body: Record<string, unknown>) =>
    buildLeadWebhookPayload(LeadRequestSchema.parse(body), normalizePhone("0501234567")!, new Date(0));

  it("V4 worlds: entry_mode worlds, world ids, empty project ids", () => {
    expect(worldsBody).toMatchObject({
      flow_version: "v4",
      entry_mode: "worlds",
      selected_project_ids: [],
      selected_world_ids: ["law_justice"],
    });
    expect(payload(worldsBody)).toMatchObject({
      flow_version: "v4",
      entry_mode: "worlds",
      selected_project_ids: [],
      selected_world_ids: ["law_justice"],
    });
  });

  it("V4 projects: entry_mode projects, project ids, empty world ids", () => {
    expect(projectsBody).toMatchObject({
      flow_version: "v4",
      entry_mode: "projects",
      selected_project_ids: ["wolt_new_city"],
      selected_world_ids: [],
    });
    expect(payload(projectsBody)).toMatchObject({
      entry_mode: "projects",
      selected_project_ids: ["wolt_new_city"],
      selected_world_ids: [],
    });
  });

  it("rejects mixed, mismatched, missing and invalid selections", () => {
    const bad = [
      { ...worldsBody, selected_project_ids: ["wolt_new_city"] }, // both lists populated
      { ...worldsBody, entry_mode: "projects" }, // projects mode with world ids
      { ...projectsBody, entry_mode: "worlds" }, // worlds mode with project ids
      { ...projectsBody, selected_world_ids: ["law_justice"] }, // both lists populated
      { ...worldsBody, entry_mode: undefined }, // V4 without an entry mode
      { ...worldsBody, selected_world_ids: ["wolt_new_city"] }, // a project id as a world
      { ...projectsBody, selected_project_ids: ["law_justice"] }, // a world id as a project
      { ...worldsBody, selected_world_ids: [] }, // worlds mode with nothing selected
    ];
    for (const body of bad)
      expect(LeadRequestSchema.safeParse(body).success, JSON.stringify(body).slice(0, 80)).toBe(false);
  });

  it("keeps V2 and V3 payloads valid and unchanged (no entry_mode allowed there)", () => {
    const v2 = buildLeadRequest({
      ...base,
      flowVersion: "v2",
      context: context(projectRun, "brand_projects"),
      selectedProjectIds: ["wolt_new_city"],
    });
    const v3 = buildLeadRequest({
      ...base,
      flowVersion: "v3",
      context: context(worldRun, "worlds"),
      selectedProjectIds: [],
      selectedWorldIds: ["law_justice"],
    });
    expect(LeadRequestSchema.safeParse(v2).success).toBe(true);
    expect(LeadRequestSchema.safeParse(v3).success).toBe(true);
    expect(v2).not.toHaveProperty("entry_mode");
    expect(v3).not.toHaveProperty("entry_mode");
    expect(payload(v2)).not.toHaveProperty("entry_mode");
    expect(payload(v2)).not.toHaveProperty("selected_world_ids");
    expect(payload(v3)).not.toHaveProperty("entry_mode");
    expect(LeadRequestSchema.safeParse({ ...v3, entry_mode: "worlds" }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...v2, entry_mode: "projects" }).success).toBe(false);
  });
});
