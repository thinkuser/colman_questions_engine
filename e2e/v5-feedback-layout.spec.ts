import { expect, test, type Page } from "@playwright/test";
import { expectLayoutOk } from "./layoutHelpers";
import { mockFeedbackApi, reachV5ProjectResult, V5_PATHS_TO } from "./v5Helpers";

/**
 * V5 pilot feedback layout at 320 / 390 / 1280 px (the `layout-*` projects), for the three generic result kinds:
 * no overflow, every choice is a comfortable tap target, the block stays light (it does not dominate the result), the
 * lead CTAs stay available and the mobile sticky contact still works. Screenshots: `test-results/v5-feedback-*.png`.
 */

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/v5-feedback-${name}-${page.viewportSize()!.width}.png`, fullPage: true });

test.beforeEach(async ({ page }) => {
  await mockFeedbackApi(page);
});

for (const [label, path] of [
  ["recommended", V5_PATHS_TO.recommended],
  ["near-tie", V5_PATHS_TO.nearTie],
  ["insufficient", V5_PATHS_TO.insufficient],
] as const) {
  test(`feedback block: ${label}`, async ({ page }) => {
    await reachV5ProjectResult(page, path);
    const block = page.getByTestId("result-feedback");
    await block.scrollIntoViewIfNeeded();
    await expect(block).toBeVisible();
    await expectLayoutOk(page, `v5 feedback ${label}`);

    for (const box of await block
      .locator("button")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // DEC-039: the feedback block is the last normal content block (below the lead form and all-programs link).
    const top = (await block.boundingBox())!.y;
    expect(top).toBeGreaterThanOrEqual((await page.getByTestId("lead-anchor").boundingBox())!.y);
    expect(top).toBeGreaterThanOrEqual((await page.getByTestId("all-programs").boundingBox())!.y);
    // Light: well under a viewport tall on desktop, never taller than ~1.6 viewports on the smallest phone.
    const height = (await block.boundingBox())!.height;
    expect(height).toBeLessThan(page.viewportSize()!.height * 1.6);

    // The lead path is never gated: the hero contact button and the form are present.
    await expect(page.getByTestId("hero-contact")).toBeEnabled();
    await expect(page.getByTestId("lead-form")).toHaveCount(1);
    if (page.viewportSize()!.width < 768) {
      // Mobile sticky contact is still offered while the form is off screen.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByTestId("sticky-contact")).toBeVisible();
    }
    await shot(page, label);

    // After submitting, the thanks state also fits.
    await block.locator("button[data-feedback-value]").last().click();
    await page.getByTestId("result-feedback-submit").click();
    await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    await expectLayoutOk(page, `v5 feedback ${label} thanks`);
  });
}
