import { expect, test } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { openDiscovery, selectProjects } from "./discoveryHelpers";
import { expectLayoutOk } from "./layoutHelpers";
import { fillLead, leadField, leadForm, leadSubmit, mockLeadApi, reachResult } from "./leadHelpers";

/**
 * V2 lead form + COLMAN branding layout acceptance. Runs at 320 px, 390 px and 1280 px (the `layout.spec` projects):
 * discovery states, the lead form on every result kind, validation errors, success, a server error and a short
 * (keyboard-open) viewport. Screenshots go to the git-ignored `test-results/`.
 */

const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;
const shot = (page: import("@playwright/test").Page, name: string) =>
  page.screenshot({ path: `test-results/v2-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

test.describe("V2 discovery visuals", () => {
  test("none, one and two selected; the selected card stays obvious and readable", async ({ page }) => {
    await openDiscovery(page);
    await expectLayoutOk(page, "discovery: none selected");
    await shot(page, "discovery-none");

    await selectProjects(page, ["spotify_discover_weekly"]);
    await expectLayoutOk(page, "discovery: one selected");
    await shot(page, "discovery-one");

    await selectProjects(page, ["tiktok_endless_scroll"]);
    await expectLayoutOk(page, "discovery: two selected");
    await shot(page, "discovery-two");

    const card = page.locator('button[data-project-id="spotify_discover_weekly"]');
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `test-results/v2-selected-card-${page.viewportSize()!.width}.png` });
    await expect(card).toContainText("נבחר");
  });
});

test.describe("V2 results with the lead form", () => {
  for (const [id, label] of [
    ["accounting", "recommended"],
    ["business_vs_economics", "near tie"],
    ["insufficient", "insufficient"],
    ["focused_tech", "tech precision"],
  ] as const) {
    test(`${label}: result + lead form fit`, async ({ page }) => {
      await reachResult(page, persona(id));
      await expectLayoutOk(page, `${label} result with lead form`);
      await leadForm(page).scrollIntoViewIfNeeded();
      await shot(page, `lead-${id}`);
    });
  }

  test("validation errors, a server error and the success state all fit", async ({ page }) => {
    const captured = await mockLeadApi(page, [500, 200]);
    await reachResult(page, persona("business_vs_economics"));

    await leadSubmit(page).click();
    await expect(leadForm(page).getByText("נא למלא שם פרטי.")).toBeVisible();
    await expectLayoutOk(page, "lead validation errors");
    await leadForm(page).scrollIntoViewIfNeeded();
    await shot(page, "lead-validation");

    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toBeVisible();
    await expectLayoutOk(page, "lead server error");
    await shot(page, "lead-error");

    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await expectLayoutOk(page, "lead success");
    await shot(page, "lead-success");
    expect(captured).toHaveLength(2);
  });

  test("a long name and a short (keyboard-open) viewport keep every field reachable without overflow", async ({
    page,
  }) => {
    await reachResult(page, persona("accounting"));
    await leadField(page, "first_name").fill("אֲבִיגָיִל".repeat(5));
    await leadField(page, "phone").fill("+972 (0)52-765 4321");
    await expectLayoutOk(page, "lead with long values");

    // A soft keyboard roughly halves the visible height: the focused field and the button must stay reachable.
    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 320 });
    for (const name of ["first_name", "last_name", "phone", "consent"] as const) {
      await leadField(page, name).focus();
      await leadField(page, name).scrollIntoViewIfNeeded();
      const box = (await leadField(page, name).boundingBox())!;
      expect(box.y, `${name} is on screen`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${name} is on screen`).toBeLessThanOrEqual(320 + 1);
    }
    await leadSubmit(page).scrollIntoViewIfNeeded();
    await expect(leadSubmit(page)).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
});

test.describe("V2 touch", () => {
  test.use({ hasTouch: true });

  test("the lead form can be completed by tapping", async ({ page }) => {
    await mockLeadApi(page);
    await reachResult(page, persona("accounting"));
    await leadField(page, "first_name").tap();
    await page.keyboard.type("דנה");
    await leadField(page, "last_name").tap();
    await page.keyboard.type("לוי");
    await leadField(page, "phone").tap();
    await page.keyboard.type("0501234567");
    await leadForm(page).getByText("אני מאשר/ת ומסכים/ה").tap();
    await leadSubmit(page).tap();
    await expect(page.getByTestId("lead-success")).toBeVisible();
  });
});
