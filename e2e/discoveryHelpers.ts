import { expect, type Page } from "@playwright/test";
import { personaChoice, type V2Persona } from "../tests/flow/v2Personas";

/** Shared helpers for the V2 discovery acceptance suite. Drives the real UI by stable data attributes. */

export const V2_KEY = "colman-studymatch:v2:journey";
export const V2_ANALYTICS_KEY = "colman-studymatch:analytics-v2";
export const GUARD_WAIT_MS = 400;

export const projectCards = (page: Page) => page.locator("button[data-project-id]");
export const questionIdOf = (page: Page) => page.locator("[data-question-id]").getAttribute("data-question-id");
export const resultRoot = (page: Page) => page.locator("[data-result-kind]").first();

export async function openDiscovery(page: Page, search = "") {
  await page.goto(`/v2${search}`);
  await expect(projectCards(page).first()).toBeVisible();
}

export async function selectProjects(page: Page, projectIds: string[]) {
  for (const id of projectIds) await page.locator(`button[data-project-id="${id}"]`).click();
}

/** Open V2, pick projects and press start. Leaves the page on the first question. */
export async function startDiscovery(page: Page, projectIds: string[], search = "") {
  await openDiscovery(page, search);
  await selectProjects(page, projectIds);
  await page.getByRole("button", { name: "בואו נתחיל" }).click();
  await expect(page.locator("[data-question-id]")).toBeVisible();
}

export async function optionIds(page: Page): Promise<string[]> {
  return page
    .locator("button[data-option-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-option-id")!));
}

/** Click an option and wait until the flow has moved on (next question or result). */
export async function answerV2(page: Page, optionId: string) {
  const before = await questionIdOf(page);
  // Taps within the guard window of a question appearing are deliberately ignored (double-tap protection).
  await page.waitForTimeout(GUARD_WAIT_MS);
  await page.locator(`button[data-option-id="${optionId}"]`).click();
  await page.waitForFunction(
    (prev) =>
      document.querySelector("[data-result-kind]") !== null ||
      document.querySelector("[data-question-id]")?.getAttribute("data-question-id") !== prev,
    before,
  );
}

/** Answer until the result is on screen; returns the question ids asked, in order. */
export async function runPersonaInBrowser(page: Page, persona: V2Persona): Promise<string[]> {
  const asked: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    await page.locator("[data-question-id], [data-result-kind]").first().waitFor();
    if ((await page.locator("[data-result-kind]").count()) > 0) break;
    const id = (await questionIdOf(page))!;
    asked.push(id);
    await answerV2(page, personaChoice(persona, id, await optionIds(page)));
  }
  await expect(resultRoot(page)).toBeVisible();
  return asked;
}

export async function storedJourney(page: Page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, V2_KEY);
}

/** Seed a durable V2 journey and open `route`; the app must restore it (a rejected state falls back to selection). */
export async function seedJourney(
  page: Page,
  projects: string[],
  answers: Array<[string, string]>,
  route: "/v2/questions" | "/v2/result",
) {
  await page.goto("/v2");
  await expect(projectCards(page).first()).toBeVisible();
  await page.evaluate(
    ([key, selectedProjectIds, stored]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          version: 1,
          flow: "v2",
          phase: "answering",
          selectedProjectIds,
          answers: (stored as Array<[string, string]>).map(([questionId, answerId]) => ({ questionId, answerId })),
        }),
      );
    },
    [V2_KEY, projects, answers] as const,
  );
  await page.goto(route);
  if (route === "/v2/result") await expect(resultRoot(page), "seeded state should restore to a result").toBeVisible();
  else await expect(page.locator("[data-question-id]"), "seeded state should restore to a question").toBeVisible();
}

export function personaAnswers(persona: V2Persona, asked: string[]): Array<[string, string]> {
  return asked.map((id) => [id, persona.script[id] ?? persona.prefer[0] ?? "A"] as [string, string]);
}

export async function dataLayer(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as never);
}
