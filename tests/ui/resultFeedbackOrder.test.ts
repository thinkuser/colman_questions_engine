import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V5_FEEDBACK_COPY } from "@/data";
import { ResultFeedback } from "@/ui/v3/ResultFeedback";
import { ResultPage } from "@/ui/v3/ResultPage";
import { runV3Persona } from "../flow/v3PersonaRun";
import { V3_PERSONAS } from "../flow/v3Personas";

/** V5 feedback is the LAST normal content block of the result page (DEC-039); V3/V4 render no feedback. */

const noop = () => {};
const handlers = {
  onProgramClick: noop,
  onContactClick: noop,
  onAllProgramsClick: noop,
  onDetailExpanded: noop,
  onSecondaryView: noop,
  onRestart: noop,
};
const FEEDBACK_MARK = '<div data-testid="feedback-slot"></div>';

function render(personaId: string, withFeedback: boolean) {
  const { view } = runV3Persona(V3_PERSONAS.find((persona) => persona.id === personaId)!);
  return {
    view,
    html: renderToStaticMarkup(
      createElement(ResultPage, {
        view,
        handlers,
        flow: "v5",
        leadForm: createElement("div", { "data-testid": "lead-form-slot" }),
        feedback: withFeedback ? createElement("div", { "data-testid": "feedback-slot" }) : undefined,
      }),
    ),
  };
}

describe("result page order", () => {
  for (const persona of ["tech_build", "communication_tie", "law"]) {
    it(`${persona}: feedback comes after the lead form, the all-programs link and the disclaimer`, () => {
      const { html, view } = render(persona, true);
      const at = (needle: string) => html.indexOf(needle);
      expect(at(FEEDBACK_MARK)).toBeGreaterThan(-1);
      expect(at(FEEDBACK_MARK)).toBeGreaterThan(at('data-testid="lead-form-slot"'));
      expect(at(FEEDBACK_MARK)).toBeGreaterThan(at('data-testid="all-programs"'));
      expect(at(FEEDBACK_MARK)).toBeGreaterThan(at('data-testid="colman-section"'));
      expect(at(FEEDBACK_MARK)).toBeGreaterThan(at('data-testid="not-right"'));
      if (view.disclaimerHe) expect(at(FEEDBACK_MARK)).toBeGreaterThan(at(view.disclaimerHe));
      if (view.chosenHe.length > 0 || view.notes.some((note) => !note.important))
        expect(at(FEEDBACK_MARK)).toBeGreaterThan(at('data-testid="details"'));
    });

    it(`${persona}: nothing but the sticky mobile bar (an overlay) follows the feedback`, () => {
      const { html } = render(persona, true);
      const after = html.slice(html.indexOf(FEEDBACK_MARK) + FEEDBACK_MARK.length);
      expect(after).toContain('data-testid="sticky-contact"');
      for (const testId of ["lead-anchor", "all-programs", "not-right", "colman-section", "hero-actions", "why"])
        expect(after).not.toContain(`data-testid="${testId}"`);
      // The sticky contact button is still a normal control inside the mobile-only wrapper.
      expect(after).toContain('class="md:hidden"');
    });
  }

  it("without the feedback prop (V3/V4) the page renders no feedback block", () => {
    expect(render("law", false).html).not.toContain("feedback-slot");
  });
});

describe("ResultFeedback component (initial markup)", () => {
  const props = {
    resultKey: "k",
    copy: V5_FEEDBACK_COPY,
    onView: noop,
    onSubmit: async () => true,
  };
  const markup = (kind: "recommended" | "near_tie" | "insufficient_positive_evidence") =>
    renderToStaticMarkup(createElement(ResultFeedback, { ...props, kind }));

  it("asks both questions for recommended and near tie, only helpfulness for insufficient evidence", () => {
    for (const kind of ["recommended", "near_tie"] as const) {
      const html = markup(kind);
      expect(html).toContain("עד כמה הכיוון שקיבלת מרגיש מתאים?");
      expect(html).toContain("האם התהליך עזר לצמצם את האפשרויות?");
      expect(html).toContain("קשה לי לדעת");
    }
    const insufficient = markup("insufficient_positive_evidence");
    expect(insufficient).toContain("האם התהליך עזר להבין קצת יותר מה מתאים ומה פחות?");
    expect(insufficient).not.toContain("עד כמה הכיוון שקיבלת מרגיש מתאים?");
  });

  it("starts with submit disabled, no error, and no free-text control", () => {
    const html = markup("recommended");
    expect(html).toMatch(/data-testid="result-feedback-submit"[^>]*disabled/);
    expect(html).not.toContain("result-feedback-error");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('type="text"');
  });
});
