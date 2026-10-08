import { expect, test, type Page } from "@playwright/test";
import { V3_PERSONAS } from "../tests/flow/v3Personas";
import { expectLayoutOk } from "./layoutHelpers";
import { fillLead, mockLeadApi } from "./leadHelpers";
import { v4LeadSubmit } from "./v4Helpers";
import {
  answerUntilV5Result,
  chooseV5Method,
  openV5,
  reachV5Method,
  reachV5ProjectResult,
  reachV5WorldResult,
  selectEntries,
  startV5,
  v5QuestionId,
  V5_PATHS_TO,
} from "./v5Helpers";

/**
 * V5 layout acceptance at 320 / 390 / 1280 px (the `layout-*` projects): landing, method screen, the ten project cards
 * (none, two + limit warning, sticky bar), worlds, transition, a generic and a Tech question, every result kind, and
 * the lead form (validation and success). Screenshots go to the git-ignored `test-results/v5-*.png`.
 */

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/v5-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

async function stickyNeverCoversLastCard(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = (await page.getByTestId("sticky-bar").boundingBox())!;
  const last = (await page.locator("button[data-entry-id]").last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
}

test.describe("V5 layout", () => {
  test("landing and method screen fit", async ({ page }) => {
    await openV5(page);
    await expectLayoutOk(page, "v5 landing");
    await reachV5Method(page);
    await expectLayoutOk(page, "v5 method screen");
    await shot(page, "method");
  });

  test("the ten project cards: none, two + third-selection warning, sticky bar; every card is a usable target", async ({
    page,
  }) => {
    await chooseV5Method(page, "projects");
    await expect(page.locator("button[data-project-id]")).toHaveCount(10);
    await expectLayoutOk(page, "v5 projects: none");
    for (const box of await page
      .locator("button[data-project-id]")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(200);
    }
    await shot(page, "projects");
    await selectEntries(page, ["people_retention", "ai_legal_case"]);
    await page.locator('button[data-project-id="apple_store_space"]').click();
    await expect(page.getByTestId("limit-message")).not.toHaveText("");
    await expectLayoutOk(page, "v5 projects: two + limit");
    await stickyNeverCoversLastCard(page);
    await shot(page, "projects-two-limit");
  });

  test("world discovery: none, one, sticky bar", async ({ page }) => {
    await chooseV5Method(page, "worlds");
    await expectLayoutOk(page, "v5 worlds: none");
    await selectEntries(page, ["education_future"]);
    await expectLayoutOk(page, "v5 worlds: one");
    await stickyNeverCoversLastCard(page);
  });

  test("transition, a generic question and a Tech question fit", async ({ page }) => {
    await chooseV5Method(page, "projects");
    await selectEntries(page, ["spotify_discovery"]);
    await page.getByTestId("discover-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    await expectLayoutOk(page, "v5 transition");
    await page.getByTestId("transition-cta").click();
    expect(await v5QuestionId(page)).toBe("V5-SPOTIFY");
    await page.locator("label:has(input[data-option-id])").first().click();
    await expectLayoutOk(page, "v5 generic question (opener)");
    await shot(page, "question-opener");
    await page.getByTestId("question-continue").click();
    await expect.poll(() => v5QuestionId(page)).toBe("Q2");
    await page.locator("label:has(input[data-option-id])").first().click();
    await expectLayoutOk(page, "v5 Tech question");
    await shot(page, "question-tech");
  });

  for (const [label, run] of [
    ["projects-recommended", (page: Page) => reachV5ProjectResult(page, V5_PATHS_TO.recommended)],
    ["projects-near-tie", (page: Page) => reachV5ProjectResult(page, V5_PATHS_TO.nearTie)],
    ["projects-insufficient", (page: Page) => reachV5ProjectResult(page, V5_PATHS_TO.insufficient)],
    [
      "projects-tech",
      async (page: Page) => {
        await startV5(page, "projects", ["spotify_discovery"]);
        return answerUntilV5Result(page, (_id, offered) => offered[0]!);
      },
    ],
    [
      "worlds-hr",
      (page: Page) =>
        reachV5WorldResult(
          page,
          V3_PERSONAS.find((p) => p.id === "hr_systems")!,
        ),
    ],
  ] as const) {
    test(`result: ${label}`, async ({ page }) => {
      await run(page);
      await expectLayoutOk(page, `v5 result ${label}`);
      await shot(page, `result-${label}`);
    });
  }

  test("lead form validation and success fit", async ({ page }) => {
    await mockLeadApi(page);
    await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
    await v4LeadSubmit(page).click();
    await expectLayoutOk(page, "v5 lead validation");
    await fillLead(page);
    await v4LeadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await expectLayoutOk(page, "v5 lead success");
  });
});
