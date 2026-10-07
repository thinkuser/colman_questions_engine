import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAREER_PROJECTS, getCareerProjectCopy } from "@/data";
import { buildV2ResultView, discoveryReducer, discoveryStep, initialDiscoveryState } from "@/flow";
import { ChoiceQuestionCard } from "@/ui/components/ChoiceQuestionCard";
import { GenericResultPage } from "@/ui/discovery/GenericResultPage";
import { ProjectCard } from "@/ui/discovery/ProjectCard";
import { ProjectIcon } from "@/ui/discovery/ProjectIcon";

const noop = () => {};
const handlers = {
  onAdmissionClick: noop,
  onAdvisorClick: noop,
  onOfficialProgramClick: noop,
  onSecondaryView: noop,
  onRealityCheckView: noop,
  onBackToQuestion: noop,
  onRestart: noop,
};

function resultMarkup(projects: string[], answers: Array<[string, string]>, advisorUrl: string | null = null) {
  let state = projects.reduce(
    (current, projectId) => discoveryReducer(current, { type: "toggle_project", projectId }),
    initialDiscoveryState,
  );
  state = discoveryReducer(state, { type: "start" });
  for (const [questionId, answerId] of answers) {
    state = discoveryReducer(state, { type: "record_answer", answer: { questionId, answerId } });
  }
  const step = discoveryStep(state);
  if (step?.status !== "complete") throw new Error("not complete");
  const view = buildV2ResultView(step, state.selectedProjectIds, state.answers, { advisorUrl });
  if (view.type !== "generic") throw new Error("expected generic");
  return renderToStaticMarkup(createElement(GenericResultPage, { view, handlers }));
}

describe("project cards", () => {
  const wolt = CAREER_PROJECTS.find((p) => p.id === "wolt_new_city")!;
  const copy = getCareerProjectCopy(wolt.id)!;
  const render = (selected: boolean, blocked = false) =>
    renderToStaticMarkup(
      createElement(ProjectCard, { projectId: wolt.id, project: copy, selected, blocked, onToggle: noop }),
    );

  it("is a button with aria-pressed, the company as text, and no image", () => {
    const html = render(false);
    expect(html).toContain("<button");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Wolt");
    expect(html).not.toContain("<img");
  });

  it("shows the selected state with a word and an icon, not colour alone", () => {
    const html = render(true);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("נבחר");
    expect(html).toContain("<svg");
  });

  it("marks a blocked card aria-disabled while keeping it a focusable button", () => {
    const html = render(false, true);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/ disabled(=|>| )/);
  });

  it("has a neutral decorative icon for every project, and none uses a brand image", () => {
    for (const project of CAREER_PROJECTS) {
      const icon = getCareerProjectCopy(project.id)!.icon;
      const html = renderToStaticMarkup(createElement(ProjectIcon, { icon }));
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toContain('<path d=""');
      expect(html).toContain("<svg");
    }
  });
});

describe("question card", () => {
  it("renders prompt and options with stable ids, and the neutral option like any other", () => {
    const html = renderToStaticMarkup(
      createElement(ChoiceQuestionCard, {
        questionId: "B2",
        prompt: "שאלה?",
        options: [
          { id: "A", label: "תשובה" },
          { id: "neither", label: "אף אחת מהאפשרויות לא ממש מושכת אותי" },
        ],
        onAnswer: noop,
      }),
    );
    expect(html).toContain('data-question-id="B2"');
    expect(html).toContain('data-option-id="neither"');
    expect(html).toContain("<h1");
    // The neutral option is not visually de-emphasised relative to the others.
    expect(html.match(/opacity|text-slate-400|italic/g)).toBeNull();
  });
});

describe("generic result page (static markup)", () => {
  const recommended = resultMarkup(
    ["wolt_new_city"],
    [
      ["B1", "C"],
      ["B2", "C"],
      ["B3", "C"],
      ["BR1", "C"],
    ],
  );
  const nearTie = resultMarkup(
    ["wolt_new_city"],
    [
      ["B1", "A"],
      ["B2", "B"],
      ["B3", "A"],
      ["B4", "B"],
      ["B5", "neither"],
    ],
  );
  const insufficient = resultMarkup(
    ["wolt_new_city"],
    [
      ["B1", "A"],
      ["B2", "neither"],
      ["B3", "neither"],
      ["B4", "neither"],
      ["B5", "neither"],
    ],
  );

  it("renders each kind with its root marker and exactly one h1", () => {
    for (const [html, kind] of [
      [recommended, "recommended"],
      [nearTie, "near_tie"],
      [insufficient, "insufficient_positive_evidence"],
    ] as const) {
      expect(html).toContain(`data-result-kind="${kind}"`);
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).not.toContain("<img");
      expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/%|d/); // visible text only (class names contain digits)
    }
  });

  it("shows a near tie symmetrically with a link for each program and no recommendation wording", () => {
    expect(nearTie).toContain("שני כיוונים חזקים");
    expect(nearTie.match(/data-link-role="peer"/g)).toHaveLength(2);
    expect(nearTie).not.toContain("הכיוון שהכי בולט אצלכם");
  });

  it("shows the reality check as a calm note", () => {
    expect(recommended).toContain('data-reality-level="negative"');
    expect(recommended).toContain("נקודה שכדאי לקחת בחשבון");
  });

  it("offers no recommendation heading for insufficient evidence", () => {
    expect(insufficient).toContain("לא קיבלנו עדיין כיוון מספיק ברור");
    expect(insufficient).not.toContain("הכיוון שהכי בולט אצלכם");
  });

  it("hides the advisor CTA without a destination and shows it with one", () => {
    expect(recommended).not.toContain("יועץ");
    const withAdvisor = resultMarkup(
      ["wolt_new_city"],
      [
        ["B1", "A"],
        ["B2", "neither"],
        ["B3", "neither"],
        ["B4", "neither"],
        ["B5", "neither"],
      ],
      "https://example.org/advisor",
    );
    expect(withAdvisor).toContain('href="https://example.org/advisor"');
    expect(withAdvisor).toContain("לשוחח עם יועץ");
  });

  it("repeats the brand disclaimer", () => {
    expect(recommended).toContain("לצורך המחשה בלבד");
  });
});
