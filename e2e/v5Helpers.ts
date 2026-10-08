import { expect, type Page } from "@playwright/test";
import { v3PersonaChoice, type V3Persona } from "../tests/flow/v3Personas";
import { masculineOnScreen } from "./v4Helpers";

/** Helpers for the V5 (balanced project-led discovery, DEC-037) acceptance suite. */

export const V5_KEY = "colman-studymatch:v5:journey";

/** The ten V5 projects in display order. */
export const V5_PROJECT_IDS = [
  "spotify_discovery",
  "wolt_city_expansion",
  "tiktok_behavior",
  "duolingo_persistence",
  "people_retention",
  "people_change",
  "ai_legal_case",
  "accounting_gap",
  "nike_launch",
  "apple_store_space",
];

export const v5Result = (page: Page) => page.locator('[data-result-flow="v5"]');
export const v5QuestionId = (page: Page) => page.locator("section[data-question-id]").getAttribute("data-question-id");
export const methodOption = (page: Page, mode: "worlds" | "projects") =>
  page.locator(`button[data-entry-mode="${mode}"]`);

export async function openV5(page: Page) {
  await page.goto("/v5");
  await expect(page.getByTestId("v3-landing")).toBeVisible();
}

/** Landing -> method screen. */
export async function reachV5Method(page: Page) {
  await openV5(page);
  await page.getByTestId("landing-cta").click();
  await expect(page.getByTestId("v4-method")).toBeVisible();
  await expect(page).toHaveURL(/\/v5\/start$/);
}

/** Landing -> method -> the chosen discovery screen. */
export async function chooseV5Method(page: Page, mode: "worlds" | "projects") {
  await reachV5Method(page);
  await methodOption(page, mode).click();
  await expect(page).toHaveURL(new RegExp(`/v5/${mode}$`));
  await expect(page.locator("button[data-entry-id]").first()).toBeVisible();
}

export async function selectEntries(page: Page, ids: string[]) {
  for (const id of ids) await page.locator(`button[data-entry-id="${id}"]`).click();
}

/** Method -> discovery -> transition -> first question. */
export async function startV5(page: Page, mode: "worlds" | "projects", ids: string[]) {
  await chooseV5Method(page, mode);
  await selectEntries(page, ids);
  await page.getByTestId("discover-continue").click();
  await expect(page.getByTestId("v3-transition")).toBeVisible();
  await page.getByTestId("transition-cta").click();
  await expect(page.locator("section[data-question-id]")).toBeVisible();
}

export async function v5OptionIds(page: Page): Promise<string[]> {
  return page
    .locator("input[data-option-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-option-id")!));
}

export async function chooseAndContinueV5(page: Page, optionId: string) {
  const before = await v5QuestionId(page);
  await page.locator(`label:has(input[data-option-id="${optionId}"])`).click();
  await page.getByTestId("question-continue").click();
  await page.waitForFunction((prev) => {
    if (document.querySelector('[data-result-flow="v5"]') !== null) return true;
    const current = document.querySelector("section[data-question-id]")?.getAttribute("data-question-id");
    return current !== undefined && current !== prev;
  }, before);
}

/** Answer until the V5 result; `choose` picks the option for a question. Returns the asked question ids. */
export async function answerUntilV5Result(
  page: Page,
  choose: (id: string, offered: string[], turn: number) => string,
  onQuestion?: (id: string) => Promise<void>,
): Promise<string[]> {
  const asked: string[] = [];
  for (let turn = 0; turn < 25; turn++) {
    await page.locator('section[data-question-id], [data-result-flow="v5"]').first().waitFor();
    if ((await v5Result(page).count()) > 0) break;
    const id = (await v5QuestionId(page))!;
    asked.push(id);
    if (onQuestion) await onQuestion(id);
    await chooseAndContinueV5(page, choose(id, await v5OptionIds(page), turn));
  }
  await expect(v5Result(page)).toBeVisible();
  return asked;
}

/** A scripted answer sequence (question id -> option id), first option for anything unscripted. */
export const scripted =
  (script: Record<string, string>) =>
  (id: string, offered: string[]): string =>
    script[id] && offered.includes(script[id]!) ? script[id]! : offered[0]!;

/** Deterministic V5 project paths to each result kind (from the engine; see tests/flow/v5.test.ts). */
export const V5_PATHS_TO = {
  recommended: {
    ids: ["accounting_gap"],
    script: { "V5-ACCOUNTING": "C", B2: "neither", B3: "neither", B4: "neither", B5: "A" },
  },
  nearTie: {
    ids: ["ai_legal_case"],
    script: { "V5-LAW": "C", L3: "neither", L5: "neither", L6: "neither", C2: "C" },
  },
  insufficient: {
    ids: ["accounting_gap"],
    script: { "V5-ACCOUNTING": "C", B2: "neither", B3: "neither", B4: "neither", B5: "neither" },
  },
} as const;

export async function reachV5ProjectResult(
  page: Page,
  path: { ids: readonly string[]; script: Record<string, string> },
) {
  await startV5(page, "projects", [...path.ids]);
  return answerUntilV5Result(page, scripted(path.script));
}

export async function reachV5WorldResult(page: Page, persona: V3Persona) {
  await startV5(page, "worlds", persona.worlds);
  return answerUntilV5Result(page, (id, offered) => v3PersonaChoice(persona, id, offered));
}

export async function stored(page: Page, key: string) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);
}

/** Forget the V5 journey without racing the V5 app (cleared from a page that never touches V5 storage). */
export async function resetV5(page: Page) {
  await page.goto("/v2");
  await page.evaluate((key) => localStorage.removeItem(key), V5_KEY);
}

/**
 * Two V5 card lines are kept verbatim from the product spec although they use the impersonal "רוצים" about third
 * parties (flagged for Hebrew review; see tests/flow/v5InclusiveCopy.test.ts). Everything else must be inclusive.
 */
const VERBATIM_THIRD_PERSON = [
  "להבין למה עובדים טובים עוזבים ואיך ליצור מקום שרוצים להישאר בו.",
  "להפוך חלל ריק למקום שאנשים רוצים להיכנס אליו, להשתמש בו ולזכור אותו.",
];

export async function v5MasculineOnScreen(page: Page): Promise<string[]> {
  return (await masculineOnScreen(page)).filter((hit) => !VERBATIM_THIRD_PERSON.some((text) => hit.startsWith(text)));
}
