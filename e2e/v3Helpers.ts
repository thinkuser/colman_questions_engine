import { expect, type Page } from "@playwright/test";
import { personaChoice, type V2Persona } from "../tests/flow/v2Personas";

/** Helpers for the V3 acceptance suite. Drives the real UI through stable test ids / data attributes. */

export const V3_KEY = "colman-studymatch:v3:journey";
export const V2_KEY = "colman-studymatch:v2:journey";

export const v3Cards = (page: Page) => page.locator("button[data-project-id]");
export const v3QuestionId = (page: Page) => page.locator("section[data-question-id]").getAttribute("data-question-id");
export const v3Result = (page: Page) => page.locator('[data-result-flow="v3"]');
export const optionLabel = (page: Page, optionId: string) =>
  page.locator(`label:has(input[data-option-id="${optionId}"])`);

export async function openLanding(page: Page, search = "") {
  await page.goto(`/v3${search}`);
  await expect(page.getByTestId("v3-landing")).toBeVisible();
}

/** Landing -> projects (the landing CTA). */
export async function enterProjects(page: Page) {
  await openLanding(page);
  await page.getByTestId("landing-cta").click();
  await expect(v3Cards(page).first()).toBeVisible();
}

export async function selectV3Projects(page: Page, projectIds: string[]) {
  for (const id of projectIds) await page.locator(`button[data-project-id="${id}"]`).click();
}

/** Landing -> projects -> transition. Leaves the page on the transition screen. */
export async function reachTransition(page: Page, projectIds: string[]) {
  await enterProjects(page);
  await selectV3Projects(page, projectIds);
  await page.getByTestId("projects-continue").click();
  await expect(page.getByTestId("v3-transition")).toBeVisible();
}

/** Landing -> ... -> first question. */
export async function startV3(page: Page, projectIds: string[]) {
  await reachTransition(page, projectIds);
  await page.getByTestId("transition-cta").click();
  await expect(page.locator("section[data-question-id]")).toBeVisible();
}

export async function v3OptionIds(page: Page): Promise<string[]> {
  return page
    .locator("input[data-option-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-option-id")!));
}

/** Select an option, then commit with Continue; waits until the flow has moved on. */
export async function chooseAndContinue(page: Page, optionId: string) {
  const before = await v3QuestionId(page);
  await optionLabel(page, optionId).click();
  await page.getByTestId("question-continue").click();
  await page.waitForFunction((prev) => {
    // Moved on = the result is there, or ANOTHER question is shown (the question merely unmounting does not count).
    if (document.querySelector('[data-result-flow="v3"]') !== null) return true;
    const current = document.querySelector("section[data-question-id]")?.getAttribute("data-question-id");
    return current !== undefined && current !== prev;
  }, before);
}

/** Answer (select + Continue) until the V3 result is on screen; returns the question ids asked. */
export async function runPersonaV3(page: Page, persona: V2Persona): Promise<string[]> {
  const asked: string[] = [];
  for (let guard = 0; guard < 25; guard++) {
    await page.locator('section[data-question-id], [data-result-flow="v3"]').first().waitFor();
    if ((await v3Result(page).count()) > 0) break;
    const id = (await v3QuestionId(page))!;
    asked.push(id);
    await chooseAndContinue(page, personaChoice(persona, id, await v3OptionIds(page)));
  }
  await expect(v3Result(page)).toBeVisible();
  return asked;
}

export async function reachV3Result(page: Page, persona: V2Persona) {
  await startV3(page, persona.projects);
  await runPersonaV3(page, persona);
}

export async function storedValue(page: Page, key: string) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}
