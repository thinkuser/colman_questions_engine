import { expect, test, type Page } from "@playwright/test";
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

async function expectLayoutOk(page: Page, label: string) {
  const width = page.viewportSize()!.width;
  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const main = document.querySelector("main")!;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const outside = [...main.querySelectorAll("*")]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > vw + 1 || r.left < -1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`);
    const clipped = [...main.querySelectorAll("*")]
      .filter(visible)
      .filter(
        (el) =>
          getComputedStyle(el).overflowX === "visible" && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
      )
      .filter((el) => el.children.length === 0 && !el.closest("svg"))
      .slice(0, 5)
      .map((el) => `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`);
    const small = [...main.querySelectorAll("button, a[href]")]
      .filter(visible)
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`);
    const headings = [...main.querySelectorAll("h1")].length;
    return {
      pageOverflow: doc.scrollWidth - vw,
      outside,
      clipped,
      small,
      headings,
      dir: getComputedStyle(doc).direction,
      lang: doc.lang,
      mainWidth: main.getBoundingClientRect().width,
    };
  });
  expect(report.dir, `${label}: RTL`).toBe("rtl");
  expect(report.lang, `${label}: language`).toBe("he");
  expect(report.pageOverflow, `${label}: horizontal page overflow`).toBeLessThanOrEqual(1);
  expect(report.outside, `${label}: elements outside the viewport`).toEqual([]);
  expect(report.clipped, `${label}: clipped text`).toEqual([]);
  expect(report.small, `${label}: tap targets under 44px`).toEqual([]);
  expect(report.headings, `${label}: exactly one h1`).toBe(1);
  if (width >= 1000) expect(report.mainWidth, `${label}: line length stays readable`).toBeLessThanOrEqual(700);
}

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
