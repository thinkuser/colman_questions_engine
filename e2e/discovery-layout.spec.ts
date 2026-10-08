import { expect, test } from "@playwright/test";
import { expectLayoutOk } from "./layoutHelpers";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import {
  openDiscovery,
  personaAnswers,
  projectCards,
  resultRoot,
  runPersonaInBrowser,
  seedJourney,
  selectProjects,
  startDiscovery,
} from "./discoveryHelpers";

/**
 * V2 mobile + RTL layout acceptance. Runs in three projects (320px, 390px, 1280px desktop), so every check holds at
 * each width: no horizontal overflow or clipped Hebrew, usable targets, readable line length on desktop.
 */

const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;

test.describe("V2 layout", () => {
  test("project discovery: cards, helper, disclaimer and CTA fit; a full selection stays usable", async ({ page }) => {
    await openDiscovery(page);
    await expectLayoutOk(page, "discovery");
    await expect(projectCards(page)).toHaveCount(7);
    await selectProjects(page, ["wolt_new_city", "nike_israel_launch"]);
    await expectLayoutOk(page, "discovery with two selected");
    await expect(page.getByRole("button", { name: "בואו נתחיל" })).toBeEnabled();
    await page.screenshot({ path: `test-results/v2-discovery-${page.viewportSize()!.width}.png`, fullPage: true });
  });

  test("question screens: authored, neutral option and generated focus fit", async ({ page }) => {
    await startDiscovery(page, ["tiktok_endless_scroll", "nike_israel_launch"]);
    await expectLayoutOk(page, "scenario question");
    await page.waitForTimeout(400);
    await page.locator('button[data-option-id="B"]').click();
    await page.waitForTimeout(400);
    await page.locator('button[data-option-id="B"]').click();
    await expect(page.locator('button[data-option-id="neither"]')).toBeVisible();
    await expectLayoutOk(page, "generated focus question");
    await page.screenshot({ path: `test-results/v2-question-${page.viewportSize()!.width}.png`, fullPage: true });
  });

  test("a V1 Tech precision question fits inside the V2 shell", async ({ page }) => {
    await startDiscovery(page, ["spotify_discover_weekly"]);
    await expectLayoutOk(page, "precision question");
  });

  for (const id of ["accounting", "business_vs_economics", "insufficient", "law", "tiktok_nike", "focused_tech"]) {
    test(`result: ${id}`, async ({ page }) => {
      const p = persona(id);
      await startDiscovery(page, p.projects);
      const asked = await runPersonaInBrowser(page, p);
      await expectLayoutOk(page, `result ${id}`);
      await page.screenshot({ path: `test-results/v2-result-${id}-${page.viewportSize()!.width}.png`, fullPage: true });
      // Reloading a seeded copy of the same journey gives the same layout (deterministic restore).
      await seedJourney(page, p.projects, personaAnswers(p, asked), "/v2/result");
      await expect(resultRoot(page)).toBeVisible();
      await expectLayoutOk(page, `restored result ${id}`);
    });
  }
});
