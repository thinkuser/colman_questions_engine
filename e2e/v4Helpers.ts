import { expect, type Page } from "@playwright/test";
import { personaChoice, type V2Persona } from "../tests/flow/v2Personas";
import { v3PersonaChoice, type V3Persona } from "../tests/flow/v3Personas";

/** Helpers for the V4 dual-entry acceptance suite. */

export const V4_KEY = "colman-studymatch:v4:journey";
export const V3_KEY = "colman-studymatch:v3:journey";
export const V2_KEY = "colman-studymatch:v2:journey";

export const v4Result = (page: Page) => page.locator('[data-result-flow="v4"]');
export const v4QuestionId = (page: Page) => page.locator("section[data-question-id]").getAttribute("data-question-id");
export const methodOption = (page: Page, mode: "worlds" | "projects") =>
  page.locator(`button[data-entry-mode="${mode}"]`);

export async function openV4(page: Page) {
  await page.goto("/v4");
  await expect(page.getByTestId("v3-landing")).toBeVisible();
}

/** Landing -> method screen. */
export async function reachMethod(page: Page) {
  await openV4(page);
  await page.getByTestId("landing-cta").click();
  await expect(page.getByTestId("v4-method")).toBeVisible();
}

/** Landing -> method -> the chosen discovery screen. */
export async function chooseMethod(page: Page, mode: "worlds" | "projects") {
  await reachMethod(page);
  await methodOption(page, mode).click();
  await expect(page).toHaveURL(new RegExp(`/v4/${mode}$`));
  await expect(page.locator("button[data-entry-id]").first()).toBeVisible();
}

export async function selectEntries(page: Page, ids: string[]) {
  for (const id of ids) await page.locator(`button[data-entry-id="${id}"]`).click();
}

/** Method -> discovery -> transition -> first question. */
export async function startV4(page: Page, mode: "worlds" | "projects", ids: string[]) {
  await chooseMethod(page, mode);
  await selectEntries(page, ids);
  await page.getByTestId("discover-continue").click();
  await expect(page.getByTestId("v3-transition")).toBeVisible();
  await page.getByTestId("transition-cta").click();
  await expect(page.locator("section[data-question-id]")).toBeVisible();
}

export async function v4OptionIds(page: Page): Promise<string[]> {
  return page
    .locator("input[data-option-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-option-id")!));
}

export async function chooseAndContinue(page: Page, optionId: string) {
  const before = await v4QuestionId(page);
  await page.locator(`label:has(input[data-option-id="${optionId}"])`).click();
  await page.getByTestId("question-continue").click();
  await page.waitForFunction((prev) => {
    if (document.querySelector('[data-result-flow="v4"]') !== null) return true;
    const current = document.querySelector("section[data-question-id]")?.getAttribute("data-question-id");
    return current !== undefined && current !== prev;
  }, before);
}

/** Answer until the V4 result; `choose` picks the option for a question. */
export async function answerUntilResult(
  page: Page,
  choose: (id: string, offered: string[]) => string,
): Promise<string[]> {
  const asked: string[] = [];
  for (let guard = 0; guard < 25; guard++) {
    await page.locator('section[data-question-id], [data-result-flow="v4"]').first().waitFor();
    if ((await v4Result(page).count()) > 0) break;
    const id = (await v4QuestionId(page))!;
    asked.push(id);
    await chooseAndContinue(page, choose(id, await v4OptionIds(page)));
  }
  await expect(v4Result(page)).toBeVisible();
  return asked;
}

export async function reachV4ProjectResult(page: Page, persona: V2Persona) {
  await startV4(page, "projects", persona.projects);
  return answerUntilResult(page, (id, offered) => personaChoice(persona, id, offered));
}

export async function reachV4WorldResult(page: Page, persona: V3Persona) {
  await startV4(page, "worlds", persona.worlds);
  return answerUntilResult(page, (id, offered) => v3PersonaChoice(persona, id, offered));
}

export async function stored(page: Page, key: string) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

/** Forget the V4 journey without racing the V4 app (cleared from a page that never touches V4 storage). */
export async function resetV4(page: Page) {
  await page.goto("/v2");
  await page.evaluate((key) => localStorage.removeItem(key), V4_KEY);
}
