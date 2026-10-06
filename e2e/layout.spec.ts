import { expect, test, type Page } from "@playwright/test";
import {
  ALL,
  ANSWER_GUARD_WAIT_MS,
  MIS_NAME,
  MIS_QUALIFIER,
  SCRIPTS,
  answer,
  open,
  questionId,
  seed,
  selectPrograms,
  startComparison,
} from "./helpers";

/**
 * Mobile + RTL layout acceptance. This spec runs in three projects (320px, 390px, 1280px desktop), so every
 * check below holds at each width. Screenshots are written to test-results/ for manual review.
 */

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
    const clippedText = [...main.querySelectorAll("*")]
      .filter(visible)
      .filter(
        (el) =>
          getComputedStyle(el).overflowX === "visible" && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
      )
      .filter((el) => !el.closest("ul.flex") && el.children.length === 0)
      .slice(0, 5)
      .map((el) => `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`);
    const smallTargets = [...main.querySelectorAll("button, a[href]")]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 44 || r.width < 44;
      })
      .map(
        (el) =>
          `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
      );
    const smallCards = [...main.querySelectorAll("label[data-program-id]")]
      .filter((el) => el.getBoundingClientRect().height < 44)
      .map((el) => el.getAttribute("data-program-id"));
    const rtl = [...main.querySelectorAll("h1, h2, p, li, button")]
      .filter(visible)
      // Official English career labels intentionally use dir="auto" so Latin text keeps its own direction.
      .filter((el) => !el.closest('[dir="auto"]'))
      .filter((el) => getComputedStyle(el).direction !== "rtl")
      .slice(0, 3)
      .map((el) => el.tagName);
    return {
      lang: doc.lang,
      dir: doc.dir,
      overflowX: doc.scrollWidth > vw,
      scrollWidth: doc.scrollWidth,
      vw,
      outside,
      clippedText,
      smallTargets,
      smallCards,
      rtl,
      mainWidth: Math.round(main.getBoundingClientRect().width),
    };
  });
  expect([report.lang, report.dir], label).toEqual(["he", "rtl"]);
  expect(report.overflowX, `${label}: horizontal overflow (scrollWidth ${report.scrollWidth} > ${report.vw})`).toBe(
    false,
  );
  expect(report.outside, `${label}: elements outside the viewport`).toEqual([]);
  expect(report.clippedText, `${label}: clipped text`).toEqual([]);
  expect(report.smallTargets, `${label}: tap targets under 44px`).toEqual([]);
  expect(report.smallCards, `${label}: program cards under 44px`).toEqual([]);
  expect(report.rtl, `${label}: non-RTL text direction`).toEqual([]);
  if (width >= 1024) expect(report.mainWidth, `${label}: readable measure on desktop`).toBeLessThanOrEqual(672);
  return report;
}

async function shot(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  await page.screenshot({ path: `test-results/layout-${width}-${name}.png`, fullPage: true });
}

test("program selection: three cards, MIS name and qualifier wrap safely", async ({ page }) => {
  await open(page);
  await selectPrograms(page, ALL);
  await expectLayoutOk(page, "selection");
  const mis = page.locator(`label[data-program-id="management_information_systems"]`);
  await expect(mis).toContainText(MIS_NAME);
  await expect(mis).toContainText(MIS_QUALIFIER);
  expect((await mis.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await shot(page, "selection");
});

test("questions: long Hebrew prompts and options wrap; focus lands on each new question", async ({ page }) => {
  await startComparison(page);
  await expectLayoutOk(page, "Q1 (longest options)");
  await shot(page, "q1");
  for (const [expected, option] of [
    ["Q1", "C"],
    ["Q2", "C"],
    ["Q3", "3"],
  ] as const) {
    expect(await questionId(page)).toBe(expected);
    // Focus moved to the question heading.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H1");
    await answer(page, option);
  }
  await expect(page.locator('[data-question-id="DSMIS-1"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("H1");
  await expectLayoutOk(page, "pair question with neutral option");
  await shot(page, "pair-question");
  await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
  await expectLayoutOk(page, "pair question (after guard)");
});

test.describe("results", () => {
  test("MIS recommendation: long name + qualifier, long evidence cards, long page stays usable", async ({ page }) => {
    const s = SCRIPTS["personaC"]!;
    await seed(page, s.programs, s.answers);
    await expectLayoutOk(page, "MIS result");
    const h1 = page.locator("h1").first();
    await expect(h1).toContainText(MIS_NAME);
    await expect(h1).toContainText(MIS_QUALIFIER);

    // Every evidence card fits within the viewport.
    const cards = page.locator("[data-evidence-kind]");
    for (let i = 0; i < (await cards.count()); i++) {
      expect((await cards.nth(i).boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }

    // A long page: the last action is reachable and not covered by anything.
    const restart = page.getByRole("button", { name: "התחלה מחדש", exact: true });
    await restart.scrollIntoViewIfNeeded();
    const covered = await restart.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(top === el || el.contains(top));
    });
    expect(covered).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(
      page.viewportSize()!.height,
    );
    await shot(page, "result-mis");
  });

  test("near tie: both program cards fit side by side or stacked, second stays prominent", async ({ page }) => {
    const s = SCRIPTS["nearTie"]!;
    await seed(page, s.programs, s.answers);
    await expectLayoutOk(page, "near tie");
    const cards = page.locator("header[data-result-kind] div.border-brand");
    await expect(cards).toHaveCount(2);
    const vw = page.viewportSize()!.width;
    for (let i = 0; i < 2; i++) {
      const box = (await cards.nth(i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vw);
    }
    await shot(page, "near-tie");
  });

  test("no strong fit with multiple reality checks fits", async ({ page }) => {
    const s = SCRIPTS["personaD"]!;
    await seed(page, s.programs, s.answers);
    await expectLayoutOk(page, "no strong fit");
    const checks = page.locator("[data-reality-check]");
    expect(await checks.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await checks.count()); i++) {
      expect((await checks.nth(i).boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await shot(page, "no-fit");
  });

  test("low-math DS: multiple reality checks fit", async ({ page }) => {
    const s = SCRIPTS["lowMathDS"]!;
    await seed(page, s.programs, s.answers);
    await expectLayoutOk(page, "low-math DS");
    expect(await page.locator("[data-reality-check]").count()).toBeGreaterThanOrEqual(2);
    await shot(page, "low-math-ds");
  });
});
