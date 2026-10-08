import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { V3_PERSONAS } from "../tests/flow/v3Personas";
import { openDiscovery, runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";
import { expectLayoutOk } from "./layoutHelpers";
import { fillLead, leadField, leadForm, leadSubmit, mockLeadApi } from "./leadHelpers";
import { enterDiscovery, openLanding, reachV3Result, selectWorlds, v3Cards, worldCard } from "./v3Helpers";

/**
 * V3 (world-led) layout acceptance at 320 / 390 / 1280 px, plus V2 (brand-led) vs V3 comparison screenshots in the
 * git-ignored `test-results/compare-*.png`. Runs in the `layout-*` projects.
 */

const persona = (id: string) => V3_PERSONAS.find((p) => p.id === id)!;
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/compare-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

test.describe("V3 layout", () => {
  test("landing, worlds (none / one / two / limit message), transition and question fit", async ({ page }) => {
    await openLanding(page);
    await expectLayoutOk(page, "v3 landing");
    await shot(page, "v3-landing");

    await enterDiscovery(page);
    await expect(v3Cards(page)).toHaveCount(9);
    await expectLayoutOk(page, "v3 worlds: none");
    await shot(page, "v3-worlds");
    await selectWorlds(page, ["technology_data"]);
    await expectLayoutOk(page, "v3 worlds: one");
    await selectWorlds(page, ["people_organizations"]);
    await worldCard(page, "design_spaces").click();
    await expect(page.getByTestId("limit-message")).not.toHaveText("");
    await expectLayoutOk(page, "v3 worlds: two + limit message");
    await shot(page, "v3-worlds-two-limit");

    // The sticky bar never covers the last card.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = (await page.getByTestId("sticky-bar").boundingBox())!;
    const last = (await v3Cards(page).last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);

    await page.getByTestId("discover-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    await expectLayoutOk(page, "v3 transition");
    await shot(page, "v3-transition");
    await page.getByTestId("transition-cta").click();
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    await page.locator("label:has(input[data-option-id])").first().click();
    await expectLayoutOk(page, "v3 question with a selection");
    await shot(page, "v3-question");
  });

  for (const [id, label] of [
    ["accounting", "recommendation"],
    ["business_markets_tie", "near-tie"],
    ["communication_tie", "near-tie-communication"],
    ["insufficient", "insufficient"],
    ["tech_build", "tech-precision"],
    ["hr_systems", "hr-world"],
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

  test("lead form: validation, error, success and a short (keyboard-open) viewport", async ({ page }) => {
    const captured = await mockLeadApi(page, [500, 200]);
    await reachV3Result(page, persona("communication_tie"));
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
    expect(captured).toHaveLength(2);

    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 340 });
    await page.reload();
    await leadForm(page).scrollIntoViewIfNeeded();
    for (const name of ["first_name", "last_name", "phone", "consent"] as const) {
      await leadField(page, name).focus();
      await leadField(page, name).scrollIntoViewIfNeeded();
      const box = (await leadField(page, name).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(341);
    }
  });
});

test.describe("V2 baseline screenshots (brand-led, for the side-by-side comparison)", () => {
  test("current V2 discovery, question and result", async ({ page }) => {
    const v2 = V2_PERSONAS.find((p) => p.id === "accounting")!;
    await openDiscovery(page);
    await shot(page, "v2-discovery");
    await startDiscovery(page, v2.projects);
    await shot(page, "v2-question");
    await runPersonaInBrowser(page, v2);
    await shot(page, "v2-result");
    await expect(page.locator('[data-result-flow="v2"]')).toBeVisible();
  });
});
