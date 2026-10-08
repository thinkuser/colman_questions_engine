import { expect, type Page } from "@playwright/test";
import { v3PersonaChoice, type V3Persona } from "../tests/flow/v3Personas";

/** Helpers for the V3 (world-led) acceptance suite. Drives the real UI through stable test ids / data attributes. */

export const V3_KEY = "colman-studymatch:v3:journey";
export const V2_KEY = "colman-studymatch:v2:journey";

export const v3Cards = (page: Page) => page.locator("button[data-entry-id]");
export const worldCard = (page: Page, worldId: string) => page.locator(`button[data-world-id="${worldId}"]`);
export const v3QuestionId = (page: Page) => page.locator("section[data-question-id]").getAttribute("data-question-id");
export const v3Result = (page: Page) => page.locator('[data-result-flow="v3"]');
export const optionLabel = (page: Page, optionId: string) =>
  page.locator(`label:has(input[data-option-id="${optionId}"])`);

export async function openLanding(page: Page, search = "") {
  await page.goto(`/v3${search}`);
  await expect(page.getByTestId("v3-landing")).toBeVisible();
}

/** Landing -> worlds (the landing CTA). */
export async function enterDiscovery(page: Page) {
  await openLanding(page);
  await page.getByTestId("landing-cta").click();
  await expect(v3Cards(page).first()).toBeVisible();
}

export async function selectWorlds(page: Page, worldIds: string[]) {
  for (const id of worldIds) await worldCard(page, id).click();
}

/** Landing -> worlds -> transition. */
export async function reachTransition(page: Page, worldIds: string[]) {
  await enterDiscovery(page);
  await selectWorlds(page, worldIds);
  await page.getByTestId("discover-continue").click();
  await expect(page.getByTestId("v3-transition")).toBeVisible();
}

/** Landing -> ... -> first question. */
export async function startV3(page: Page, worldIds: string[]) {
  await reachTransition(page, worldIds);
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
    if (document.querySelector('[data-result-flow="v3"]') !== null) return true;
    const current = document.querySelector("section[data-question-id]")?.getAttribute("data-question-id");
    return current !== undefined && current !== prev;
  }, before);
}

/** Answer (select + Continue) until the V3 result is on screen; returns the question ids asked. */
export async function runPersonaV3(page: Page, persona: V3Persona): Promise<string[]> {
  const asked: string[] = [];
  for (let guard = 0; guard < 25; guard++) {
    await page.locator('section[data-question-id], [data-result-flow="v3"]').first().waitFor();
    if ((await v3Result(page).count()) > 0) break;
    const id = (await v3QuestionId(page))!;
    asked.push(id);
    await chooseAndContinue(page, v3PersonaChoice(persona, id, await v3OptionIds(page)));
  }
  await expect(v3Result(page)).toBeVisible();
  return asked;
}

export async function reachV3Result(page: Page, persona: V3Persona) {
  await startV3(page, persona.worlds);
  return runPersonaV3(page, persona);
}

export async function storedValue(page: Page, key: string) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}
