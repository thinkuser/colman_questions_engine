import { describe, expect, it } from "vitest";
import {
  canAccessStep,
  comparisonReducer,
  currentStep,
  initialComparisonState,
  nextComparisonStep,
  type ComparisonAction,
  type ComparisonState,
} from "@/flow";
import { ALL_PILOT, CS, DS, MIS, type AnswerPolicy } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";

/**
 * Drives the flow the way the UI does: ask the flow for the next question, answer it, repeat. The reducer
 * (backed by the engine) alone decides the next question and completion.
 */
const reduce = (state: ComparisonState, ...actions: ComparisonAction[]) => actions.reduce(comparisonReducer, state);
const select = (...ids: string[]) =>
  reduce(initialComparisonState, ...ids.map((programId): ComparisonAction => ({ type: "toggle_program", programId })), {
    type: "start_questions",
  });
const record = (questionId: string, answerId: string): ComparisonAction => ({
  type: "record_answer",
  answer: { questionId, answerId },
});

function answerNext(state: ComparisonState, policy: AnswerPolicy): ComparisonState {
  const step = nextComparisonStep(state);
  if (step?.status !== "ask") throw new Error("no question to answer");
  return reduce(state, record(step.question.id, policy(step.question)));
}

function play(programs: string[], policy: AnswerPolicy) {
  let state = select(...programs);
  const asked: string[] = [];
  while (state.status === "answering") {
    const step = nextComparisonStep(state);
    if (step?.status === "ask") asked.push(step.question.id);
    state = answerNext(state, policy);
  }
  return { state, asked };
}

const sanity = (id: string) => SANITY_CASES.find((c) => c.id === id)!;
const askedId = (state: ComparisonState) => {
  const step = nextComparisonStep(state);
  return step?.status === "ask" ? step.question.id : null;
};

describe("adaptive path lengths drive the flow to completion", () => {
  it.each([
    ["persona_a_cs", 5],
    ["mixed_three_way", 6],
    ["mixed_cs_ds", 7],
  ])("%s completes after %i questions", (id, expected) => {
    const { programs, policy } = sanity(id);
    const { state, asked } = play(programs, policy());
    expect(asked).toHaveLength(expected);
    expect(state.answers).toHaveLength(expected);
    expect(state.status).toBe("completed");
    expect(state.result).not.toBeNull();
    expect(currentStep(state)).toBe("result");
  });

  it("asks exactly the questions that were recorded, in order (no UI-side routing)", () => {
    const { programs, policy } = sanity("mixed_cs_ds");
    const { state, asked } = play(programs, policy());
    expect(asked).toEqual(state.answers.map((a) => a.questionId));
  });

  it("a CS+DS comparison never asks an MIS question", () => {
    for (const id of ["persona_b_cs_ds_only", "mixed_cs_ds"]) {
      const { asked } = play([CS, DS], sanity(id).policy());
      expect(asked.filter((q) => /MIS/.test(q))).toEqual([]);
    }
  });

  it("a CS+MIS comparison never asks a DS question, and DS+MIS never a CS question", () => {
    expect(play([CS, MIS], sanity("persona_c_cs_mis_only").policy()).asked.filter((q) => /DS/.test(q))).toEqual([]);
    const dsMis = play([DS, MIS], (question) => (question.id === "Q3" ? "3" : question.options[0]!.id));
    expect(dsMis.asked.filter((q) => /CS/.test(q))).toEqual([]);
  });
});

describe("recording answers", () => {
  const started = select(CS, DS);

  it("accepts the answer to the question being asked", () => {
    expect(reduce(started, record("Q1", "A")).answers).toEqual([{ questionId: "Q1", answerId: "A" }]);
  });

  it("ignores an answer to a different question, an unknown option, and a repeated answer", () => {
    const answered = reduce(started, record("Q1", "A"));
    for (const attempt of [record("Q3", "3"), record("Q2", "Z"), record("Q1", "A")]) {
      expect(reduce(answered, attempt)).toBe(answered);
    }
  });

  it("does not accept answers once completed", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const { state } = play(programs, policy());
    expect(reduce(state, record("Q1", "A"))).toBe(state);
  });
});

describe("back", () => {
  it("removes the last answer and shows that question again", () => {
    const state = reduce(select(CS, DS), record("Q1", "A"), record("Q2", "A"), { type: "go_back" });
    expect(state.answers).toEqual([{ questionId: "Q1", answerId: "A" }]);
    expect(askedId(state)).toBe("Q2");
  });

  it("from the first question returns to program selection and keeps the selection", () => {
    const state = reduce(select(CS, DS), { type: "go_back" });
    expect(state.status).toBe("selecting");
    expect(state.selectedProgramIds).toEqual([CS, DS]);
    expect(state.answers).toEqual([]);
    expect(currentStep(state)).toBe("select");
  });

  it("from the completion screen reopens the last question and clears the result", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const { state } = play(programs, policy());
    const back = reduce(state, { type: "go_back" });
    expect(back.status).toBe("answering");
    expect(back.result).toBeNull();
    expect(back.answers).toHaveLength(state.answers.length - 1);
    expect(canAccessStep(back, "questions")).toBe(true);
  });

  it("recomputes the path when an earlier answer changes instead of keeping the old branch", () => {
    let state = reduce(select(...ALL_PILOT), record("Q1", "A"), record("Q2", "A"), record("Q3", "5"));
    const before = askedId(state);
    expect(before).toMatch(/^CS/);

    state = reduce(state, { type: "go_back" }, { type: "go_back" }, { type: "go_back" });
    expect(state.answers).toEqual([]);
    state = reduce(state, record("Q1", "C"), record("Q2", "C"), record("Q3", "3"));
    const after = askedId(state);
    expect(after).toMatch(/MIS/);
    expect(after).not.toBe(before);
  });
});

describe("restart", () => {
  it("clears selection, answers, and result from any step", () => {
    const { programs, policy } = sanity("persona_a_cs");
    const { state: completed } = play(programs, policy());
    const midway = reduce(select(CS, DS), record("Q1", "A"));
    for (const state of [completed, midway, select(CS, DS)]) {
      expect(reduce(state, { type: "restart" })).toEqual(initialComparisonState);
    }
  });
});
