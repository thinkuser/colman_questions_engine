import { describe, expect, it } from "vitest";
import { nextComparisonStep } from "@/flow";

describe("nextComparisonStep (contract for THI-9)", () => {
  it("returns null until 2–3 programs are selected", () => {
    expect(nextComparisonStep({ selectedProgramIds: ["computer_science"], answers: [] })).toBeNull();
  });

  it("asks Q1 first for a valid selection", () => {
    const step = nextComparisonStep({ selectedProgramIds: ["computer_science", "data_science"], answers: [] });
    expect(step?.status).toBe("ask");
    expect(step?.status === "ask" && step.question.id).toBe("Q1");
  });

  it("completes with a fit result once the flow stops", () => {
    const answers = [
      { questionId: "Q1", answerId: "B" },
      { questionId: "Q2", answerId: "B" },
      { questionId: "Q3", answerId: "4" },
      { questionId: "CSDS-1", answerId: "ds" },
      { questionId: "CSDS-2", answerId: "ds" },
    ];
    const step = nextComparisonStep({ selectedProgramIds: ["computer_science", "data_science"], answers });
    expect(step).toMatchObject({ status: "complete", questionsAsked: 5, stopReason: "pair_answers_agree" });
    expect(step?.status === "complete" && step.result.bestFitProgram).toBe("data_science");
  });
});
