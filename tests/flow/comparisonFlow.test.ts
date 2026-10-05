import { describe, expect, it } from "vitest";
import {
  canAccessStep,
  canStartQuestions,
  comparisonReducer,
  currentStep,
  initialComparisonState,
  type ComparisonAction,
  type ComparisonState,
} from "@/flow";

function run(actions: ComparisonAction[], state: ComparisonState = initialComparisonState): ComparisonState {
  return actions.reduce(comparisonReducer, state);
}

const toggle = (programId: string): ComparisonAction => ({ type: "toggle_program", programId });
const answer = (questionId: string, answerId: string): ComparisonAction => ({
  type: "record_answer",
  answer: { questionId, answerId },
});

describe("program selection", () => {
  it("requires 2–3 selected programs before questions can start", () => {
    expect(canStartQuestions(run([toggle("computer_science")]))).toBe(false);
    expect(canStartQuestions(run([toggle("computer_science"), toggle("data_science")]))).toBe(true);
  });

  it("ignores a fourth selection", () => {
    const state = run([toggle("a"), toggle("b"), toggle("c"), toggle("d")]);
    expect(state.selectedProgramIds).toEqual(["a", "b", "c"]);
  });

  it("toggles a selected program off", () => {
    const state = run([toggle("a"), toggle("b"), toggle("a")]);
    expect(state.selectedProgramIds).toEqual(["b"]);
  });

  it("does not start questions with too few programs", () => {
    const state = run([toggle("a"), { type: "start_questions" }]);
    expect(state.status).toBe("selecting");
  });
});

describe("select → questions → result", () => {
  const started = run([toggle("computer_science"), toggle("data_science"), { type: "start_questions" }]);

  it("moves to answering and unlocks only the questions step", () => {
    expect(started.status).toBe("answering");
    expect(canAccessStep(started, "questions")).toBe(true);
    expect(canAccessStep(started, "result")).toBe(false);
  });

  it("records answers append-only", () => {
    const state = run([answer("Q1", "A"), answer("Q2", "B")], started);
    expect(state.answers).toEqual([
      { questionId: "Q1", answerId: "A" },
      { questionId: "Q2", answerId: "B" },
    ]);
  });

  it("unlocks the result step on completion", () => {
    const state = run([{ type: "complete", result: null }], started);
    expect(state.status).toBe("completed");
    expect(canAccessStep(state, "result")).toBe(true);
    expect(canAccessStep(state, "questions")).toBe(false);
  });

  it("ignores answers and completion outside the answering state", () => {
    expect(run([answer("Q1", "A")]).answers).toEqual([]);
    expect(run([{ type: "complete", result: null }]).status).toBe("selecting");
  });

  it("clears answers and result when the program selection changes", () => {
    const state = run(
      [answer("Q1", "A"), { type: "complete", result: null }, toggle("management_information_systems")],
      started,
    );
    expect(state.status).toBe("selecting");
    expect(state.answers).toEqual([]);
    expect(state.result).toBeNull();
    expect(state.selectedProgramIds).toEqual(["computer_science", "data_science", "management_information_systems"]);
  });

  it("restarts a fresh question pass for the same selection", () => {
    const state = run([answer("Q1", "A"), { type: "start_questions" }], started);
    expect(state.status).toBe("answering");
    expect(state.answers).toEqual([]);
  });

  it("restart returns to the initial state", () => {
    expect(run([{ type: "restart" }], started)).toEqual(initialComparisonState);
  });
});

describe("step access", () => {
  it("maps each status to the step the candidate belongs on", () => {
    const answering = run([toggle("a"), toggle("b"), { type: "start_questions" }]);
    expect(currentStep(initialComparisonState)).toBe("select");
    expect(currentStep(answering)).toBe("questions");
    expect(currentStep(run([{ type: "complete", result: null }], answering))).toBe("result");
  });

  it("always allows the select step and blocks deep links into later steps", () => {
    expect(canAccessStep(initialComparisonState, "select")).toBe(true);
    expect(canAccessStep(initialComparisonState, "questions")).toBe(false);
    expect(canAccessStep(initialComparisonState, "result")).toBe(false);
  });
});
