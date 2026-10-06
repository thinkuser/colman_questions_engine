import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/** Shared helpers for the pilot acceptance suite. Drives the real UI by stable ids; never touches engine code. */

export const CS = "computer_science";
export const DS = "data_science";
export const MIS = "management_information_systems";
export const ALL = [CS, DS, MIS];

export const MIS_NAME = "ניהול מערכות מידע";
export const MIS_QUALIFIER = "דו-חוגי עם מנהל עסקים";
export const DURABLE_KEY = "colman-studymatch:comparison";
export const ANALYTICS_KEY = "colman-studymatch:analytics";
export const ANSWER_GUARD_WAIT_MS = 400;
export const ADVISOR_URL = "https://example.org/advisor";

/** Candidate wording for each answer (questionId/answerId), read from the shipped copy file. */
export const EVIDENCE: Record<string, string> = JSON.parse(
  readFileSync("src/data/content/result_copy/evidence.json", "utf8"),
).answers;

export interface Policy {
  /** Answers to Q1, Q2, Q3. */
  opening: [string, string, string];
  /** For every later question, the first of these option ids that the question offers. */
  preference: string[];
}

/** Persona answer policies (same traits as tests/engine/sanityCases.ts and docs/PERSONAS_AND_TESTS.md). */
export const PERSONAS = {
  A: { opening: ["A", "A", "5"], preference: ["cs", "ds", "mis"] },
  B: { opening: ["B", "B", "4"], preference: ["ds", "cs", "mis"] },
  C: { opening: ["C", "C", "3"], preference: ["mis", "ds", "cs"] },
  D: { opening: ["C", "C", "1"], preference: ["neither", "mis", "ds", "cs"] },
  lowMathCS: { opening: ["A", "A", "1"], preference: ["cs", "ds", "mis"] },
  lowMathDS: { opening: ["B", "B", "1"], preference: ["ds", "cs", "mis"] },
} satisfies Record<string, Policy>;

/** A known CS+DS path that ends in a near tie after the single tie-breaker. */
export const NEAR_TIE_SCRIPT: Array<[string, string]> = [
  ["Q1", "A"],
  ["Q2", "A"],
  ["Q3", "1"],
  ["CSDS-1", "cs"],
  ["CSDS-2", "ds"],
  ["CSDS-3", "ds"],
  ["TB-CSDS", "cs"],
];

export async function selectPrograms(page: Page, programs: string[]) {
  for (const id of programs) await page.locator(`label[data-program-id="${id}"] input`).check();
}

export async function open(page: Page, search = "") {
  await page.goto(`/${search}`);
  await expect(page.locator("h1")).toBeVisible();
}

/** Open the app, select programs and press start. Leaves the page on the first question. */
export async function startComparison(page: Page, programs: string[] = ALL, search = "") {
  await open(page, search);
  await selectPrograms(page, programs);
  await page.getByRole("button", { name: "התחילו בהשוואה" }).click();
  await expect(page.locator("[data-question-id]")).toBeVisible();
}

export const questionId = (page: Page) => page.locator("[data-question-id]").getAttribute("data-question-id");

async function optionIds(page: Page): Promise<string[]> {
  return page
    .locator("button[data-option-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-option-id")!));
}

/** Click an option and wait until the flow has moved on (next question or result). */
export async function answer(page: Page, optionId: string) {
  const before = await questionId(page);
  // Taps within ANSWER_TAP_GUARD_MS of a question appearing are deliberately ignored (double-tap protection).
  await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
  await page.locator(`button[data-option-id="${optionId}"]`).click();
  await page.waitForFunction(
    (prev) =>
      location.pathname === "/result" ||
      document.querySelector("[data-question-id]")?.getAttribute("data-question-id") !== prev,
    before,
  );
}

/** Answer until the result page; returns the question ids asked, in order. */
export async function runPolicy(page: Page, policy: Policy): Promise<string[]> {
  const asked: string[] = [];
  for (let guard = 0; guard < 12; guard++) {
    // Either the next question or the result is on screen (client-side navigation makes page.url() lag).
    await page.locator("[data-question-id], [data-result-kind]").first().waitFor();
    if ((await page.locator("[data-result-kind]").count()) > 0) break;
    const id = (await questionId(page))!;
    asked.push(id);
    const index = ["Q1", "Q2", "Q3"].indexOf(id);
    const offered = await optionIds(page);
    const choice = index >= 0 ? policy.opening[index]! : policy.preference.find((option) => offered.includes(option));
    expect(choice, `no policy answer for ${id} (offered ${offered.join(",")})`).toBeDefined();
    await answer(page, choice!);
  }
  await expect(page.locator("[data-result-kind]").first()).toBeVisible();
  return asked;
}

/** Follow an exact script, asserting the adaptive flow asks exactly these questions. */
export async function runScript(page: Page, script: Array<[string, string]>) {
  for (const [expectedQuestion, optionId] of script) {
    expect(await questionId(page)).toBe(expectedQuestion);
    await answer(page, optionId);
  }
  await expect(page.locator("[data-result-kind]").first()).toBeVisible();
}

export const resultKind = (page: Page) => page.locator("[data-result-kind]").first().getAttribute("data-result-kind");
export const mainText = (page: Page) => page.locator("main").innerText();

export async function dataLayer(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (window as unknown as { dataLayer?: Array<Record<string, unknown>> }).dataLayer ?? []);
}

export async function events(page: Page, name: string) {
  return (await dataLayer(page)).filter((e) => e.event === name);
}

export async function eventNames(page: Page) {
  return (await dataLayer(page)).map((e) => String(e.event));
}

/** Seed the durable comparison state and open a route (fast path for layout and result checks). */
export async function seed(page: Page, selected: string[], answers: Array<[string, string]>, route = "/result") {
  await open(page);
  // Let the app finish hydrating (it saves its own empty state once) so it cannot overwrite what we seed.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await page.evaluate(
    ([key, selectedProgramIds, pairs]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          version: 1,
          selectedProgramIds,
          answers: (pairs as string[][]).map(([questionId, answerId]) => ({ questionId, answerId })),
        }),
      );
    },
    [DURABLE_KEY, selected, answers] as const,
  );
  await page.goto(route);
  // The seeded state must really restore (a rejected state silently falls back to selection).
  if (route === "/result") {
    await expect(page.locator("[data-result-kind]").first(), "seeded state should restore to a result").toBeVisible();
  } else if (route === "/questions") {
    await expect(page.locator("[data-question-id]"), "seeded state should restore to a question").toBeVisible();
  } else {
    await expect(page.locator("main h1").first()).toBeVisible();
  }
}

/** Known full answer scripts used to seed result pages. */
export const SCRIPTS: Record<string, { programs: string[]; answers: Array<[string, string]> }> = {
  personaC: {
    programs: ALL,
    answers: [
      ["Q1", "C"],
      ["Q2", "C"],
      ["Q3", "3"],
      ["DSMIS-1", "mis"],
      ["DSMIS-2", "mis"],
    ],
  },
  personaD: {
    programs: ALL,
    answers: [
      ["Q1", "C"],
      ["Q2", "C"],
      ["Q3", "1"],
      ["DSMIS-1", "neither"],
      ["DSMIS-2", "neither"],
      ["DSMIS-3", "neither"],
    ],
  },
  nearTie: { programs: [CS, DS], answers: NEAR_TIE_SCRIPT },
  lowMathDS: {
    programs: ALL,
    answers: [
      ["Q1", "B"],
      ["Q2", "B"],
      ["Q3", "1"],
      ["DSMIS-1", "ds"],
      ["DSMIS-2", "ds"],
    ],
  },
};

const FORBIDDEN_LEAKS = [
  /%/,
  /\d\.\d/,
  /strong_fit|good_fit|consider_carefully|no_strong_fit|normalized|raw_fit|recommended_program/,
  /software_building|data_modeling|business_context|math_affinity|coding_depth|statistical_thinking|systems_process|bridge_role|abstract_problem_solving/,
  /ציון|אחוז/,
];

/** No scores, percentages, enum names, dimension ids or score vocabulary in candidate-visible text. */
export function expectNoLeaks(text: string) {
  for (const pattern of FORBIDDEN_LEAKS) expect(text, `leak ${pattern}`).not.toMatch(pattern);
}

/** Every candidate-facing MIS name is followed by its qualifier. */
export function expectMisQualified(text: string) {
  const occurrences = [...text.matchAll(new RegExp(MIS_NAME, "g"))];
  for (const match of occurrences) {
    expect(text.slice(match.index, match.index + 160), `MIS qualifier near "${match[0]}"`).toContain(MIS_QUALIFIER);
  }
  return occurrences.length;
}
