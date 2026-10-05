import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RESULT_COPY } from "@/data";
import { DIMENSIONS, type FitResult, type ProgramId, type RecordedAnswer } from "@/engine";
import { buildResultView, nextComparisonStep } from "@/flow";
import { ResultPage } from "@/ui/components/result/ResultPage";
import { ALL_PILOT, CS, DS, MIS, enumerateRuns, runFlow } from "../engine/fixtures";
import { SANITY_CASES } from "../engine/sanityCases";

const handlers = { onCompareFocused: () => {}, onRestart: () => {}, onBackToQuestion: () => {} };
const MIS_NAME = "ניהול מערכות מידע";
const MIS_QUALIFIER = "דו-חוגי עם מנהל עסקים";

function render(
  result: FitResult,
  answers: readonly RecordedAnswer[],
  programs: readonly ProgramId[],
  advisorUrl: string | null = null,
) {
  const view = buildResultView(result, answers, programs, { advisorUrl });
  return renderToStaticMarkup(createElement(ResultPage, { view, handlers }));
}

function renderCase(id: string, advisorUrl: string | null = null) {
  const sanity = SANITY_CASES.find((c) => c.id === id)!;
  const run = runFlow(sanity.programs, sanity.policy());
  return render(run.result, run.answers, sanity.programs, advisorUrl);
}

const NEAR_TIE: RecordedAnswer[] = [
  ["Q1", "A"],
  ["Q2", "A"],
  ["Q3", "1"],
  ["CSDS-1", "cs"],
  ["CSDS-2", "ds"],
  ["CSDS-3", "ds"],
  ["TB-CSDS", "cs"],
].map(([questionId, answerId]) => ({ questionId: questionId!, answerId: answerId! }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const sectionLabels = (html: string) => [...html.matchAll(/<section[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);

describe("result page structure by kind", () => {
  it("renders a normal recommendation in the intended order, with the secondary program visible", () => {
    const html = renderCase("persona_b_ds");
    expect(html).toContain('data-result-kind="recommended"');
    expect(sectionLabels(html)).toEqual([
      "למה קיבלתם את התוצאה הזאת?",
      "זה נשמע כמוכם?",
      "ההתלבטות האמיתית שלכם",
      "מה תלמדו",
      "איך זה נראה בעולם האמיתי?",
      "כיוונים אפשריים בהמשך",
      "ומה לגבי האפשרות השנייה?",
      "למה ללמוד את זה דווקא במכללה למינהל?",
      "מה עושים עכשיו?",
      "לא מרגיש לכם נכון?",
    ]);
    expect(html).toContain(RESULT_COPY.states.recommended.eyebrow_he);
    const secondary = html.slice(html.indexOf('aria-label="ומה לגבי האפשרות השנייה?"'));
    expect(secondary).toContain(MIS_NAME);
    expect(secondary).toContain(MIS_QUALIFIER);
    // Why COLMAN comes only after the fit explanation and the other option.
    expect(html.indexOf("למה ללמוד את זה דווקא")).toBeGreaterThan(html.indexOf("ההתלבטות האמיתית שלכם"));
  });

  it("renders the near tie with both programs prominent and the decisive axis", () => {
    const step = nextComparisonStep({ selectedProgramIds: [CS, DS], answers: NEAR_TIE });
    if (step?.status !== "complete") throw new Error("expected completion");
    const html = render(step.result, NEAR_TIE, [CS, DS]);
    expect(html).toContain('data-result-kind="near_tie"');
    expect(html).toContain("ההתלבטות שלכם באמת קרובה");
    expect(text(html)).toContain(RESULT_COPY.pairAxis(CS, DS)!.axisHe);
    expect(html).not.toContain(RESULT_COPY.states.recommended.eyebrow_he);
    // The second program is as prominent as the first: both appear in emphasised hero cards.
    expect((html.match(/border-2 border-brand bg-brand\/5/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // The real contrary answer is represented.
    expect(html).toContain('data-evidence-kind="mixed"');
  });

  it("renders no-strong-fit without any recommendation", () => {
    const html = renderCase("persona_d_no_fit");
    const body = text(html);
    expect(html).toContain('data-result-kind="no_strong_fit"');
    expect(body).toContain(RESULT_COPY.states.no_strong_fit.heading_he);
    expect(body).toContain(RESULT_COPY.states.no_strong_fit.alternatives_he);
    expect(body).not.toContain(RESULT_COPY.states.recommended.eyebrow_he);
    for (const absent of ["מה תלמדו", "למה ללמוד את זה דווקא", "כיוונים אפשריים בהמשך", "ומה לגבי האפשרות השנייה?"]) {
      expect(body).not.toContain(absent);
    }
    expect(body).toContain(MIS_NAME);
    expect(body).toContain(MIS_QUALIFIER);
    // Escape routes: compare again / explore other programs, plus the always-present way back.
    expect(body).toContain("לבדיקת תוכניות אחרות");
    expect(body).toContain("חזרה לשאלה האחרונה");
  });

  it("shows reality checks only when triggered, as a non-alarming section", () => {
    expect(renderCase("persona_a_cs")).not.toContain("כדאי לדעת לפני שמחליטים");
    const html = renderCase("low_math_ds");
    expect(html).toContain("כדאי לדעת לפני שמחליטים");
    expect(html).toContain('data-reality-check="ds_math_statistics_programming"');
    expect(text(html)).toContain(RESULT_COPY.evidence.get("Q3/1")!);
  });

  it("offers the advisor CTA only when a destination is configured", () => {
    expect(renderCase("persona_a_cs")).not.toContain("לשוחח עם יועץ");
    const html = renderCase("persona_a_cs", "https://example.org/advisor");
    expect(html).toContain('href="https://example.org/advisor"');
    expect(html).toContain("לשוחח עם יועץ על מדעי המחשב מול מדע הנתונים");
  });

  it("opens official links safely and keeps the way back visible", () => {
    const html = renderCase("persona_a_cs");
    expect(html).toContain('href="https://www.academy.org.il/admission/"');
    expect(html).toContain('href="https://www.colman.ac.il/academics/ba/computer-science/"');
    expect(html.match(/target="_blank"/g)?.length).toBe(html.match(/rel="noopener noreferrer"/g)?.length);
    expect(html).toContain("לא מרגיש לכם נכון?");
  });
});

describe("across many real answer paths", () => {
  const sweep: Array<[ProgramId[], ReturnType<typeof enumerateRuns>]> = [
    [ALL_PILOT, enumerateRuns(ALL_PILOT)],
    [[CS, DS], enumerateRuns([CS, DS])],
    [[CS, MIS], enumerateRuns([CS, MIS])],
    [[DS, MIS], enumerateRuns([DS, MIS])],
  ];
  const rendered = sweep.flatMap(([programs, runs]) =>
    runs
      .filter((_, index) => index % 9 === 0)
      .map((run) => ({ programs, run, html: render(run.result, run.answers, programs, "https://example.org/a") })),
  );

  it("covers every result kind", () => {
    const kinds = new Set(rendered.map(({ html }) => /data-result-kind="([a-z_]+)"/.exec(html)![1]));
    expect(kinds).toEqual(new Set(["recommended", "near_tie", "no_strong_fit"]));
  });

  it("leaks no scores, percentages, decimals, enum names or dimension ids", () => {
    const forbidden = [
      /%/,
      /\d\.\d/,
      /strong_fit|good_fit|consider_carefully|normalized|raw_fit|fitClassification/,
      new RegExp(DIMENSIONS.join("|")),
      /ציון|אחוז/,
    ];
    for (const { html } of rendered) {
      const body = text(html);
      for (const pattern of forbidden) expect(body).not.toMatch(pattern);
    }
  });

  it("always shows the MIS qualifier next to the MIS name", () => {
    let checked = 0;
    for (const { html } of rendered) {
      for (const match of html.matchAll(new RegExp(MIS_NAME, "g"))) {
        checked += 1;
        expect(html.slice(match.index, match.index + 400)).toContain(MIS_QUALIFIER);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps the second program visible in every non-tie recommendation, and never forces a winner on no-fit", () => {
    for (const { run, html } of rendered) {
      const kind = /data-result-kind="([a-z_]+)"/.exec(html)![1];
      if (kind === "no_strong_fit") {
        expect(run.result.bestFitProgram).toBeNull();
        expect(text(html)).not.toContain(RESULT_COPY.states.recommended.eyebrow_he);
      } else {
        expect(html).toContain("ומה לגבי האפשרות השנייה?");
      }
    }
  });

  it("is built for narrow screens: wrapping cards, no fixed widths, large tap targets", () => {
    for (const { html } of rendered) {
      expect(html).not.toMatch(/w-\[|min-w-\[|max-w-\[|width:|whitespace-nowrap|overflow-x/);
      for (const section of html.matchAll(/<section[^>]*>/g)) {
        expect(section[0]).toContain("min-w-0");
        expect(section[0]).toContain("break-words");
      }
      for (const button of html.matchAll(/<button[^>]*>/g)) expect(button[0]).toMatch(/min-h-1[12]/);
      for (const link of html.matchAll(/<a [^>]*>/g)) expect(link[0]).toMatch(/min-h-12/);
    }
  });
});
