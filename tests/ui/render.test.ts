import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getProgramSummary, getQuestionCopyHe, PILOT_PROGRAMS, QUESTION_BANK } from "@/data";
import { getBankQuestion } from "@/engine";
import { copy } from "@/ui/copy.he";
import { ProgramList } from "@/ui/components/ProgramList";
import { ProgramName } from "@/ui/components/ProgramName";
import { QuestionCard } from "@/ui/components/QuestionCard";
import { QuestionProgress } from "@/ui/components/QuestionProgress";
import { ALL_PILOT, CS, DS, MIS } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";
import { nextComparisonStep } from "@/flow";

const renderCard = (questionId: string) =>
  renderToStaticMarkup(
    createElement(QuestionCard, { question: getBankQuestion(QUESTION_BANK, questionId), onAnswer: () => {} }),
  );

const MIS_QUALIFIER = "דו-חוגי עם מנהל עסקים";

describe("program names (RTL, candidate-facing)", () => {
  it("renders the MIS qualifier wherever the MIS name is shown", () => {
    const mis = getProgramSummary(MIS)!;
    const html = renderToStaticMarkup(createElement(ProgramName, { program: mis }));
    expect(html).toContain("ניהול מערכות מידע");
    expect(html).toContain(MIS_QUALIFIER);
    expect(renderToStaticMarkup(createElement(ProgramList, { programIds: [MIS] }))).toContain(MIS_QUALIFIER);
  });

  it("renders the canonical Hebrew names from structured program data, with no qualifier for CS and DS", () => {
    expect(renderToStaticMarkup(createElement(ProgramName, { program: getProgramSummary(DS)! }))).toContain(
      "מדע הנתונים",
    );
    expect(renderToStaticMarkup(createElement(ProgramName, { program: getProgramSummary(CS)! }))).not.toContain(
      MIS_QUALIFIER,
    );
  });

  it("offers exactly the three pilot programs, each with a Hebrew name", () => {
    expect(PILOT_PROGRAMS.map((p) => p.id)).toEqual(ALL_PILOT);
    for (const program of PILOT_PROGRAMS) expect(program.nameHe).toMatch(/[֐-׿]/);
  });
});

describe("question card", () => {
  it("renders the prompt and one large button per option from structured Hebrew copy", () => {
    for (const question of QUESTION_BANK.questions) {
      const html = renderCard(question.id);
      const questionCopy = getQuestionCopyHe(question.id);
      expect(html).toContain(questionCopy.prompt.replace(/'/g, "&#x27;"));
      expect(html.match(/<button/g)).toHaveLength(question.options.length);
      for (const option of question.options) expect(html).toContain(`data-option-id="${option.id}"`);
      expect(html).toContain("min-h-14"); // tap target of at least 56px
    }
  });

  it("shows the neutral option on pair questions and not on opening questions or tie-breakers", () => {
    const neutral = "אף אחת מהאפשרויות לא ממש מושכת אותי";
    expect(renderCard("DSMIS-1")).toContain(neutral);
    expect(renderCard("Q1")).not.toContain(neutral);
    expect(renderCard("TB-DSMIS")).not.toContain(neutral);
  });

  it("renders no program scores or percentages", () => {
    for (const question of QUESTION_BANK.questions) {
      const text = renderCard(question.id).replace(/<[^>]+>/g, " ");
      expect(text).not.toMatch(/%\s*התאמה|התאמה\s*\d+%/);
    }
  });

  it("renders every question the engine asks for a CS+DS flow, never an MIS question", () => {
    for (const id of ["persona_b_cs_ds_only", "mixed_cs_ds"]) {
      const { policy } = SANITY_CASES.find((c) => c.id === id)!;
      const answers: { questionId: string; answerId: string }[] = [];
      const rendered: string[] = [];
      const pick = policy();
      for (let step = nextComparisonStep({ selectedProgramIds: [CS, DS], answers }); step?.status === "ask";) {
        rendered.push(renderCard(step.question.id));
        answers.push({ questionId: step.question.id, answerId: pick(step.question) });
        step = nextComparisonStep({ selectedProgramIds: [CS, DS], answers });
      }
      expect(rendered.length).toBeGreaterThanOrEqual(5);
      for (const html of rendered) expect(html).not.toMatch(/data-question-id="[^"]*MIS/);
    }
  });
});

describe("adaptive progress", () => {
  it("shows the current question number and the usual range, never a fixed denominator", () => {
    const html = renderToStaticMarkup(createElement(QuestionProgress, { questionNumber: 4 }));
    expect(html).toContain("שאלה 4");
    expect(html).toContain("בדרך כלל 5–7 שאלות");
    expect(html).not.toMatch(/4\s*\/\s*7|מתוך 7/);
  });

  it("builds progress copy from the engine bounds", () => {
    expect(copy.questions.progress(6)).toBe("שאלה 6");
    expect(copy.questions.typicalLength(5, 7)).toBe("בדרך כלל 5–7 שאלות");
  });
});
