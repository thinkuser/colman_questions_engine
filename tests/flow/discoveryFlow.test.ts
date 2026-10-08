import { describe, expect, it } from "vitest";
import {
  DISCOVERY_STORAGE_KEY,
  DISCOVERY_STORAGE_VERSION,
  canStartDiscovery,
  discoveryReducer,
  discoveryRoute,
  discoveryStep,
  initialDiscoveryState,
  restoreDiscovery,
  serializeDiscovery,
  toStoredDiscovery,
  COMPARISON_STORAGE_KEY,
  type DiscoveryAction,
  type DiscoveryState,
} from "@/flow";

const run = (actions: DiscoveryAction[], from: DiscoveryState = initialDiscoveryState) =>
  actions.reduce(discoveryReducer, from);
const toggle = (projectId: string): DiscoveryAction => ({ type: "toggle_project", projectId });
const answer = (questionId: string, answerId: string): DiscoveryAction => ({
  type: "record_answer",
  answer: { questionId, answerId },
});

const WOLT = "wolt_new_city";
const NIKE = "nike_israel_launch";
const TIKTOK = "tiktok_endless_scroll";
const SPOTIFY = "spotify_discover_weekly";

describe("project selection", () => {
  it("allows one or two projects, prevents a third, and lets the candidate deselect", () => {
    const one = run([toggle(WOLT)]);
    expect(one.selectedProjectIds).toEqual([WOLT]);
    expect(canStartDiscovery(one)).toBe(true);

    const two = run([toggle(NIKE)], one);
    expect(two.selectedProjectIds).toEqual([WOLT, NIKE]);
    expect(canStartDiscovery(two)).toBe(true);

    expect(run([toggle(TIKTOK)], two)).toBe(two); // a third is ignored (same state object)
    expect(run([toggle(WOLT)], two).selectedProjectIds).toEqual([NIKE]);
    expect(run([toggle(WOLT), toggle(WOLT)]).selectedProjectIds).toEqual([]);
    expect(canStartDiscovery(initialDiscoveryState)).toBe(false);
  });

  it("ignores unknown projects", () => {
    expect(run([toggle("zara_launch")])).toBe(initialDiscoveryState);
  });

  it("does not let the click order change the next step", () => {
    const ab = run([toggle(WOLT), toggle(NIKE), { type: "start" }]);
    const ba = run([toggle(NIKE), toggle(WOLT), { type: "start" }]);
    const first = discoveryStep(ab);
    expect(first?.status === "ask" && first.mode === "generic" && first.question.question.id).toBe("B1");
    expect(discoveryStep(ba)).toEqual(first);
  });

  it("changing the selection discards answers collected for the previous one", () => {
    const answered = run([toggle(WOLT), { type: "start" }, answer("B1", "A")]);
    expect(answered.answers).toHaveLength(1);
    expect(run([toggle(NIKE)], answered)).toEqual({
      phase: "selecting",
      selectedProjectIds: [WOLT, NIKE],
      answers: [],
    });
  });
});

describe("answering", () => {
  const started = run([toggle(WOLT), { type: "start" }]);

  it("does not start without a valid selection", () => {
    expect(run([{ type: "start" }])).toBe(initialDiscoveryState);
  });

  it("accepts only an answer to the question the engine is asking", () => {
    expect(run([answer("B2", "A")], started)).toBe(started); // not the asked question
    expect(run([answer("B1", "Z")], started)).toBe(started); // not one of its options
    expect(run([answer("B1", "A")], started).answers).toEqual([{ questionId: "B1", answerId: "A" }]);
  });

  it("rejects a repeated answer to the same question (double submit)", () => {
    const once = run([answer("B1", "A")], started);
    expect(run([answer("B1", "A")], once)).toBe(once);
  });

  it("maps states to routes without the UI deciding", () => {
    expect(discoveryRoute(initialDiscoveryState)).toBe("select");
    expect(discoveryRoute(started)).toBe("questions");
    const done = run([answer("B1", "A"), answer("B2", "A"), answer("B3", "A")], started);
    expect(discoveryRoute(done)).toBe("result");
    expect(discoveryStep(done)?.status).toBe("complete");
  });
});

describe("Back and restart replay the journey", () => {
  const start = run([toggle(WOLT), { type: "start" }]);
  const path = [answer("B1", "B"), answer("B2", "neither"), answer("B3", "C")];

  it("Back removes the last answer and equals the state one step earlier", () => {
    const states = [start];
    for (const action of path) states.push(run([action], states.at(-1)!));
    for (let i = states.length - 1; i > 0; i--) {
      expect(run([{ type: "go_back" }], states[i]!)).toEqual(states[i - 1]);
    }
  });

  it("Back from the first question returns to project selection with the selection kept", () => {
    expect(run([{ type: "go_back" }], start)).toEqual({ phase: "selecting", selectedProjectIds: [WOLT], answers: [] });
  });

  it("Back from a result reopens the last question and the result is recomputed on the way forward", () => {
    const winning = [answer("B1", "A"), answer("B2", "A"), answer("B3", "A")];
    const done = run(winning, start);
    expect(discoveryRoute(done)).toBe("result");
    const back = run([{ type: "go_back" }], done);
    expect(discoveryRoute(back)).toBe("questions");
    expect(run([winning.at(-1)!], back)).toEqual(done);
  });

  it("Restart clears everything", () => {
    expect(run([{ type: "restart" }], run(path, start))).toEqual(initialDiscoveryState);
  });
});

describe("Tech handoff through the same journey", () => {
  it("Spotify alone starts in the V1 module (Q1 asked once, by V1)", () => {
    const state = run([toggle(SPOTIFY), { type: "start" }]);
    const first = discoveryStep(state);
    expect(first?.status === "ask" && first.mode === "precision" && first.question.id).toBe("Q1");
    const next = run([answer("Q1", "A")], state);
    const second = discoveryStep(next);
    expect(second?.status === "ask" && second.mode === "precision" && second.question.id).toBe("Q2");
  });

  it("Spotify + another project carries T1 into V1 as Q1 and never asks Q1 again; Back crosses the boundary", () => {
    let state = run([toggle(WOLT), toggle(SPOTIFY), { type: "start" }]);
    const asked: string[] = [];
    for (let guard = 0; guard < 6; guard++) {
      const step = discoveryStep(state);
      if (step?.status !== "ask") break;
      const id = step.mode === "precision" ? step.question.id : step.question.question.id;
      asked.push(id);
      if (step.mode === "precision") break;
      // T1 = Data Science; B1 = Business Administration; the generated focus question then picks Data Science (B).
      state = run([answer(id, id === "B1" ? "A" : "B")], state);
    }
    expect(asked[0]).toBe("T1");
    expect(asked.at(-1)).toBe("Q2");
    expect(asked).not.toContain("Q1");
    // Back from the first precision question removes the last generic answer; the flow replays deterministically.
    const back = run([{ type: "go_back" }], state);
    expect(back.answers).toHaveLength(state.answers.length - 1);
    expect(run([answer(state.answers.at(-1)!.questionId, state.answers.at(-1)!.answerId)], back)).toEqual(state);
  });
});

describe("durable journey (persistence)", () => {
  const journey = run([toggle(WOLT), toggle(NIKE), { type: "start" }, answer("B1", "A"), answer("C1", "B")]);

  it("stores only the flow version, phase, projects and answers: nothing derived", () => {
    const stored = toStoredDiscovery(journey)!;
    expect(Object.keys(stored).sort()).toEqual(["answers", "flow", "phase", "selectedProjectIds", "version"]);
    const text = serializeDiscovery(journey)!;
    expect(text).not.toMatch(/score|support|ranking|shortlist|recommend|result|branch/i);
    expect(stored).toMatchObject({ version: DISCOVERY_STORAGE_VERSION, flow: "v2", phase: "answering" });
  });

  it("restores by replaying the answers, to the very same state", () => {
    expect(restoreDiscovery(serializeDiscovery(journey))).toEqual(journey);
    const done = run([answer("B2", "A"), answer("B3", "A")], run([toggle(WOLT), { type: "start" }, answer("B1", "A")]));
    const restoredDone = restoreDiscovery(serializeDiscovery(done));
    expect(restoredDone).toEqual(done);
    expect(discoveryRoute(restoredDone!)).toBe("result");
  });

  it("keeps a started journey on its first question across a refresh", () => {
    const first = run([toggle(WOLT), { type: "start" }]);
    expect(restoreDiscovery(serializeDiscovery(first))).toEqual(first);
    const selecting = run([toggle(WOLT)]);
    expect(restoreDiscovery(serializeDiscovery(selecting))).toEqual(selecting);
  });

  it("stores nothing for an empty journey", () => {
    expect(serializeDiscovery(initialDiscoveryState)).toBeNull();
  });

  it("is namespaced away from V1: different key, and a V1 payload is never a V2 journey", () => {
    expect(DISCOVERY_STORAGE_KEY).not.toBe(COMPARISON_STORAGE_KEY);
    const v1 = JSON.stringify({ version: 1, selectedProgramIds: ["computer_science", "data_science"], answers: [] });
    expect(restoreDiscovery(v1)).toBeNull();
  });

  it("restores invalid, stale or inconsistent data to null instead of throwing", () => {
    const good = JSON.parse(serializeDiscovery(journey)!);
    const bad = (patch: object) => restoreDiscovery(JSON.stringify({ ...good, ...patch }));
    expect(restoreDiscovery("not json")).toBeNull();
    expect(restoreDiscovery("{}")).toBeNull();
    expect(restoreDiscovery(null)).toBeNull();
    expect(bad({ version: 2 })).toBeNull();
    expect(bad({ flow: "v1" })).toBeNull();
    expect(bad({ selectedProjectIds: [WOLT, NIKE, TIKTOK] })).toBeNull(); // three projects
    expect(bad({ selectedProjectIds: [WOLT, WOLT] })).toBeNull(); // duplicate
    expect(bad({ selectedProjectIds: ["zara_launch"] })).toBeNull(); // unknown project
    expect(bad({ selectedProjectIds: [] })).toBeNull(); // answering without a project
    expect(bad({ answers: [{ questionId: "B2", answerId: "A" }] })).toBeNull(); // not the asked question
    expect(bad({ answers: [{ questionId: "B1", answerId: "Z" }] })).toBeNull(); // unknown option
    expect(bad({ phase: "selecting" })).toBeNull(); // selecting with answers
    expect(bad({ extra: true })).toBeNull(); // unexpected field
    const done = JSON.parse(
      serializeDiscovery(
        run([toggle(WOLT), { type: "start" }, answer("B1", "A"), answer("B2", "A"), answer("B3", "A")]),
      )!,
    );
    expect(
      restoreDiscovery(JSON.stringify({ ...done, answers: [...done.answers, { questionId: "B4", answerId: "A" }] })),
    ).toBeNull(); // past the end
  });
});
