import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { V3_PERSONAS } from "../tests/flow/v3Personas";
import { expectLayoutOk } from "./layoutHelpers";
import { fillLead, leadSubmit, mockLeadApi } from "./leadHelpers";
import {
  chooseMethod,
  openV4,
  reachMethod,
  reachV4ProjectResult,
  reachV4WorldResult,
  selectEntries,
  startV4,
} from "./v4Helpers";

/**
 * V4 layout acceptance at 320 / 390 / 1280 px (the `layout-*` projects): landing, entry-method screen, project and
 * world discovery (with the limit message and sticky bar), a question, results for both methods and the lead form.
 * Screenshots go to the git-ignored `test-results/v4-*.png`.
 */

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/v4-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

async function stickyNeverCoversLastCard(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = (await page.getByTestId("sticky-bar").boundingBox())!;
  const last = (await page.locator("button[data-entry-id]").last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
}

test.describe("V4 layout", () => {
  test("landing and entry-method screen fit", async ({ page }) => {
    await openV4(page);
    await expectLayoutOk(page, "v4 landing");
    await reachMethod(page);
    await expectLayoutOk(page, "v4 method screen");
    await shot(page, "method");
  });

  test("project discovery: none, two + limit message, sticky bar", async ({ page }) => {
    await chooseMethod(page, "projects");
    await expectLayoutOk(page, "v4 projects: none");
    await shot(page, "projects");
    await selectEntries(page, ["wolt_new_city", "nike_israel_launch"]);
    await page.locator('button[data-project-id="apple_store_space"]').click();
    await expect(page.getByTestId("limit-message")).not.toHaveText("");
    await expectLayoutOk(page, "v4 projects: two + limit");
    await stickyNeverCoversLastCard(page);
    await shot(page, "projects-two-limit");
  });

  test("world discovery: none, one, sticky bar", async ({ page }) => {
    await chooseMethod(page, "worlds");
    await expectLayoutOk(page, "v4 worlds: none");
    await selectEntries(page, ["education_future"]);
    await expectLayoutOk(page, "v4 worlds: one");
    await stickyNeverCoversLastCard(page);
    await shot(page, "worlds-one");
  });

  test("a question with a selection fits (both modes)", async ({ page }) => {
    await startV4(page, "projects", ["tiktok_endless_scroll"]);
    await page.locator("label:has(input[data-option-id])").first().click();
    await expectLayoutOk(page, "v4 projects question");
    await shot(page, "question-projects");
  });

  for (const [label, run] of [
    [
      "projects-recommended",
      (page: Page) =>
        reachV4ProjectResult(
          page,
          V2_PERSONAS.find((p) => p.id === "accounting")!,
        ),
    ],
    [
      "projects-tech",
      (page: Page) =>
        reachV4ProjectResult(
          page,
          V2_PERSONAS.find((p) => p.id === "focused_tech")!,
        ),
    ],
    [
      "worlds-near-tie",
      (page: Page) =>
        reachV4WorldResult(
          page,
          V3_PERSONAS.find((p) => p.id === "communication_tie")!,
        ),
    ],
    [
      "worlds-hr",
      (page: Page) =>
        reachV4WorldResult(
          page,
          V3_PERSONAS.find((p) => p.id === "hr_systems")!,
        ),
    ],
  ] as const) {
    test(`result: ${label}`, async ({ page }) => {
      await run(page);
      await expectLayoutOk(page, `v4 result ${label}`);
      await shot(page, `result-${label}`);
    });
  }

  test("lead form validation and success fit", async ({ page }) => {
    await mockLeadApi(page);
    await reachV4WorldResult(
      page,
      V3_PERSONAS.find((p) => p.id === "law")!,
    );
    await leadSubmit(page).click();
    await expectLayoutOk(page, "v4 lead validation");
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await expectLayoutOk(page, "v4 lead success");
  });
});
