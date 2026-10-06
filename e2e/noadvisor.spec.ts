import { expect, test } from "@playwright/test";
import { PERSONAS, SCRIPTS, runPolicy, seed, startComparison } from "./helpers";

/** Runs against the build WITHOUT NEXT_PUBLIC_ADVISOR_URL: the advisor CTA must not exist anywhere. */

test("advisor CTA is hidden for a recommendation when no destination is configured", async ({ page }) => {
  await startComparison(page);
  await runPolicy(page, PERSONAS.A);
  await expect(page.getByRole("link", { name: /לשוחח עם יועץ/ })).toHaveCount(0);
  // The real CTAs remain: admissions and the official program page.
  await expect(page.getByRole("link", { name: /לבדיקת תנאי הקבלה/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /לעמוד התוכנית באתר המכללה/ })).toBeVisible();
});

test("advisor CTA is hidden for near tie and no-strong-fit too, and no advisor event can fire", async ({ page }) => {
  for (const key of ["nearTie", "personaD"]) {
    const s = SCRIPTS[key]!;
    await seed(page, s.programs, s.answers);
    await expect(page.locator("[data-result-kind]").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /לשוחח עם יועץ/ })).toHaveCount(0);
    expect(await page.locator('a[href*="example.org"]').count()).toBe(0);
  }
  // No-strong-fit still offers a way forward without an advisor.
  await expect(page.getByRole("button", { name: "לבדיקת תוכניות אחרות" })).toBeVisible();
});
