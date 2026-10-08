import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { openDiscovery, runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";
import { expectLayoutOk } from "./layoutHelpers";
import { fillLead, leadField, leadForm, leadSubmit, mockLeadApi } from "./leadHelpers";
import { enterProjects, openLanding, reachV3Result, selectV3Projects } from "./v3Helpers";

/**
 * V3 layout acceptance at 320 / 390 / 1280 px, plus V2-vs-V3 comparison screenshots (test-results/compare-*.png,
 * git-ignored) so product can put the two versions side by side. Runs in the `layout-*` projects.
 */

const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/compare-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

test.describe("V3 layout", () => {
  test("landing, discovery (none / one / two / limit message), transition and question fit", async ({ page }) => {
    await openLanding(page);
    await expectLayoutOk(page, "v3 landing");
    await shot(page, "v3-landing");

    await enterProjects(page);
    await expectLayoutOk(page, "v3 discovery: none");
    await shot(page, "v3-discovery");
    await selectV3Projects(page, ["wolt_new_city"]);
    await expectLayoutOk(page, "v3 discovery: one");
    await selectV3Projects(page, ["tiktok_endless_scroll"]);
    await page.locator('button[data-project-id="nike_israel_launch"]').click();
    await expect(page.getByTestId("limit-message")).toBeVisible();
    await expectLayoutOk(page, "v3 discovery: two + limit message");
    await shot(page, "v3-discovery-two-limit");

    await page.getByTestId("projects-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    await expectLayoutOk(page, "v3 transition");
    await shot(page, "v3-transition");
    await page.getByTestId("transition-cta").click();
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    await expectLayoutOk(page, "v3 question");
    await page.locator("label:has(input[data-option-id])").first().click();
    await expectLayoutOk(page, "v3 question with a selection");
    await shot(page, "v3-question");
  });

  for (const [id, label] of [
    ["accounting", "recommendation"],
    ["business_vs_economics", "near-tie"],
    ["communication_vs_cm", "near-tie-communication"],
    ["insufficient", "insufficient"],
    ["focused_tech", "tech-precision"],
  ] as const) {
    test(`result: ${label}`, async ({ page }) => {
      await reachV3Result(page, persona(id));
      await expectLayoutOk(page, `v3 result ${label}`);
      await shot(page, `v3-result-${label}`);
      await page
        .locator("details > summary")
        .first()
        .click()
        .catch(() => {});
      await expectLayoutOk(page, `v3 result ${label} with detail open`);
    });
  }

  test("lead form: validation, error, success and a short viewport", async ({ page }) => {
    const captured = await mockLeadApi(page, [500, 200]);
    await reachV3Result(page, persona("business_vs_economics"));
    await leadForm(page).scrollIntoViewIfNeeded();
    await leadSubmit(page).click();
    await expect(leadForm(page).getByText("נא למלא שם פרטי.")).toBeVisible();
    await expectLayoutOk(page, "v3 lead validation");
    await shot(page, "v3-lead-validation");
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toBeVisible();
    await expectLayoutOk(page, "v3 lead error");
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await expectLayoutOk(page, "v3 lead success");
    await shot(page, "v3-lead-success");
    expect(captured).toHaveLength(2);
  });

  test("the sticky bars do not cover form fields on a short (keyboard-open) viewport", async ({ page }) => {
    await reachV3Result(page, persona("accounting"));
    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 340 });
    for (const name of ["first_name", "last_name", "phone", "consent"] as const) {
      await leadField(page, name).focus();
      await leadField(page, name).scrollIntoViewIfNeeded();
      const box = (await leadField(page, name).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(341);
    }
    await expect(leadSubmit(page)).toBeVisible();
  });
});

test.describe("V2 baseline screenshots (for the side-by-side comparison)", () => {
  test("current V2 discovery, question and result", async ({ page }) => {
    await openDiscovery(page);
    await shot(page, "v2-discovery");
    await startDiscovery(page, persona("accounting").projects);
    await shot(page, "v2-question");
    await runPersonaInBrowser(page, persona("accounting"));
    await shot(page, "v2-result");
    await expect(page.locator('[data-result-flow="v2"]')).toBeVisible();
  });
});
