import { describe, expect, it } from "vitest";
import {
  COMPARISON_STORAGE_VERSION,
  comparisonReducer,
  initialComparisonState,
  nextComparisonStep,
  restoreComparison,
  serializeComparison,
  toStoredComparison,
  type ComparisonAction,
  type ComparisonState,
} from "@/flow";
import { CS, DS, MIS, type AnswerPolicy } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";

const reduce = (state: ComparisonState, ...actions: ComparisonAction[]) => actions.reduce(comparisonReducer, state);

function playState(programs: string[], policy: AnswerPolicy, maxAnswers = Infinity): ComparisonState {
  let state = reduce(
    initialComparisonState,
    ...programs.map((programId): ComparisonAction => ({ type: "toggle_program", programId })),
    { type: "start_questions" },
  );
  while (state.status === "answering" && state.answers.length < maxAnswers) {
    const step = nextComparisonStep(state);
    if (step?.status !== "ask") break;
    state = reduce(state, {
      type: "record_answer",
      answer: { questionId: step.question.id, answerId: policy(step.question) },
    });
  }
  return state;
}

const sanity = (id: string) => SANITY_CASES.find((c) => c.id === id)!;
const json = (value: unknown) => JSON.stringify(value);

describe("what is persisted", () => {
  it("contains only version, selected programs, and answers", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const state = playState(programs, policy());
    expect(state.status).toBe("completed");
    const value = toStoredComparison(state)!;
    expect(Object.keys(value).sort()).toEqual(["answers", "selectedProgramIds", "version"]);
    expect(value.version).toBe(COMPARISON_STORAGE_VERSION);
    const serialized = serializeComparison(state)!;
    for (const derived of ["result", "ranking", "score", "branch", "normalized", "status"]) {
      expect(serialized).not.toContain(derived);
    }
  });

  it("stores nothing for an empty comparison, so the storage entry is cleared", () => {
    expect(serializeComparison(initialComparisonState)).toBeNull();
  });
});

describe("restoring after a refresh", () => {
  it("restores a mid-flow state exactly", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const state = playState(programs, policy(), 4);
    expect(state.status).toBe("answering");
    expect(restoreComparison(serializeComparison(state))).toEqual(state);
  });

  it("restores a completed state with the result recomputed by the engine", () => {
    const { programs, policy } = sanity("mixed_cs_ds");
    const state = playState(programs, policy());
    const restored = restoreComparison(serializeComparison(state));
    expect(restored).toEqual(state);
    expect(restored?.status).toBe("completed");
    expect(restored?.result?.bestFitProgram).toBe(state.result?.bestFitProgram);
  });

  it("restores a selection without answers as program selection with the choice kept", () => {
    const restored = restoreComparison(json({ version: 1, selectedProgramIds: [CS, DS], answers: [] }));
    expect(restored).toMatchObject({ status: "selecting", selectedProgramIds: [CS, DS], answers: [] });
  });

  it("never trusts stored derived data: extra keys such as a result are rejected", () => {
    const { programs, policy } = sanity("persona_b_ds");
    const stored = JSON.parse(serializeComparison(playState(programs, policy()))!);
    stored.result = { bestFitProgram: MIS };
    expect(restoreComparison(JSON.stringify(stored))).toBeNull();
  });
});

describe("corrupt or inconsistent persisted state fails safely", () => {
  const validAnswers = [
    { questionId: "Q1", answerId: "A" },
    { questionId: "Q2", answerId: "A" },
  ];
  const base = { version: 1, selectedProgramIds: [CS, DS], answers: validAnswers };
  const withAnswers = (answers: unknown[]) => json({ ...base, answers });
  const withPrograms = (selectedProgramIds: string[]) => json({ ...base, selectedProgramIds });

  it.each<[string, string | null]>([
    ["nothing stored", null],
    ["empty string", ""],
    ["not JSON", "{oops"],
    ["JSON null", "null"],
    ["JSON array", "[]"],
    ["wrong version", json({ ...base, version: 2 })],
    ["missing version", json({ selectedProgramIds: [CS, DS], answers: [] })],
    ["unknown program", withPrograms([CS, "physics"])],
    ["duplicate program", withPrograms([CS, CS])],
    ["too many programs", withPrograms([CS, DS, MIS, CS])],
    ["answers with a single program", withPrograms([CS])],
    ["answers with no program", withPrograms([])],
    ["unknown question", withAnswers([{ questionId: "Q99", answerId: "A" }])],
    ["unknown option", withAnswers([{ questionId: "Q1", answerId: "Z" }])],
    ["wrong question order", withAnswers([{ questionId: "Q2", answerId: "A" }])],
    ["malformed answer entry", withAnswers([{ questionId: "Q1" }])],
    ["extra answer fields", withAnswers([{ questionId: "Q1", answerId: "A", score: 3 }])],
    [
      "question belonging to an unselected program",
      withAnswers([...validAnswers, { questionId: "Q3", answerId: "3" }, { questionId: "DSMIS-1", answerId: "ds" }]),
    ],
  ])("%s", (_name, raw) => {
    expect(restoreComparison(raw)).toBeNull();
  });

  it("answers recorded past the end of the flow", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const finished = playState(programs, policy());
    const raw = json({
      version: 1,
      selectedProgramIds: programs,
      answers: [...finished.answers, { questionId: "Q1", answerId: "A" }],
    });
    expect(restoreComparison(raw)).toBeNull();
  });
});
