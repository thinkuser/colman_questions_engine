import { expect, test, type Page } from "@playwright/test";
import {
  ADVISOR_URL,
  ALL,
  ANSWER_GUARD_WAIT_MS,
  CS,
  DS,
  MIS,
  SCRIPTS,
  open,
  questionId,
  runPolicy,
  seed,
  PERSONAS,
  startComparison,
} from "./helpers";

/** Link / CTA smoke and basic accessibility sanity (not a WCAG audit). */

test.describe("links and CTAs", () => {
  test("result links: official targets, safe target/rel, advisor when configured", async ({ page }) => {
    await startComparison(page, ALL);
    await runPolicy(page, PERSONAS.A);
    const links = await page.locator("main a").evaluateAll((els) =>
      els.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        target: a.getAttribute("target"),
        rel: a.getAttribute("rel"),
        name: (a.textContent ?? "").trim(),
      })),
    );
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain("https://www.academy.org.il/admission/");
    expect(hrefs).toContain("https://www.colman.ac.il/academics/ba/computer-science/");
    expect(hrefs).toContain(ADVISOR_URL);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
      expect(link.rel).toContain("noreferrer");
      expect(link.name.length).toBeGreaterThan(0);
      expect(link.href).toMatch(/^https:\/\//); // no insecure or relative external links
    }
  });

  const officialPages: Record<string, string> = {
    personaC: "https://www.colman.ac.il/academics/ba/management-information-systems/",
    lowMathDS: "https://www.colman.ac.il/academics/ba/data-science/",
  };
  for (const [script, url] of Object.entries(officialPages)) {
    test(`official program page link matches the recommendation (${script})`, async ({ page }) => {
      const s = SCRIPTS[script]!;
      await seed(page, s.programs, s.answers);
      await expect(page.locator("[data-result-kind]").first()).toBeVisible();
      await expect(page.getByRole("link", { name: /לעמוד התוכנית באתר המכללה/ })).toHaveAttribute("href", url);
    });
  }

  test("internal routes respond, redirect safely, and the app has no dead internal links", async ({
    page,
    request,
  }) => {
    for (const route of ["/", "/questions", "/result"]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    }
    const s = SCRIPTS["personaC"]!;
    await seed(page, s.programs, s.answers);
    const internal = await page
      .locator("a[href]")
      .evaluateAll((els) =>
        els.map((a) => (a as HTMLAnchorElement).href).filter((href) => new URL(href).origin === location.origin),
      );
    for (const href of internal) expect((await request.get(href)).status(), href).toBeLessThan(400);
    expect((await request.get("/definitely-not-a-route")).status()).toBe(404);
  });
});

test.describe("keyboard and focus", () => {
  test("a keyboard-only candidate can select programs, start and answer; focus follows each new question", async ({
    page,
  }) => {
    await open(page);
    // Tab to the first program checkbox.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "checkbox")) break;
    }
    expect(await page.evaluate(() => document.activeElement?.closest("label")?.getAttribute("data-program-id"))).toBe(
      CS,
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await expect(page.locator("label[data-program-id] input:checked")).toHaveCount(2);

    // A visible focus indicator on the checkbox.
    const checkboxOutline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(checkboxOutline.style).not.toBe("none");

    await page.keyboard.press("Tab"); // MIS checkbox
    await page.keyboard.press("Tab"); // start button
    await expect(page.getByRole("button", { name: "התחילו בהשוואה" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible();

    // Focus moves to the new question's heading, and options are keyboard-operable with a visible focus ring.
    for (const expected of ["Q1", "Q2", "Q3"]) {
      expect(await questionId(page)).toBe(expected);
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("H1");
      expect(await page.evaluate(() => document.activeElement?.closest("[data-question-id]") !== null)).toBe(true);
      await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
      await page.keyboard.press("Tab"); // first option
      const ring = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return {
          tag: document.activeElement?.tagName,
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      expect(ring.tag).toBe("BUTTON");
      expect(ring.style).not.toBe("none");
      expect(ring.width).toBeGreaterThanOrEqual(2);
      await page.keyboard.press("Enter");
    }
    expect(await questionId(page)).toMatch(/^CSDS-1$|^CSDS-/);
  });

  test("Back and restart controls are reachable by keyboard", async ({ page }) => {
    await startComparison(page, [CS, DS]);
    await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
    const names: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      names.push(await page.evaluate(() => (document.activeElement?.textContent ?? "").trim()));
    }
    expect(names).toContain("חזרה");
    expect(names).toContain("התחלה מחדש");
  });
});

test.describe("semantics and readability", () => {
  async function headingLevels(page: Page) {
    return page
      .locator("main h1, main h2, main h3, main h4")
      .evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  }

  function expectSensibleHeadings(levels: number[]) {
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++)
      expect(levels[i]!, `heading order ${levels.join(",")}`).toBeLessThanOrEqual(levels[i - 1]! + 1);
  }

  const pages: Array<[string, (page: Page) => Promise<void>]> = [
    ["selection", async (page) => void (await open(page))],
    ["question", async (page) => void (await startComparison(page, ALL))],
    [
      "result (MIS recommended)",
      async (page) => seed(page, SCRIPTS["personaC"]!.programs, SCRIPTS["personaC"]!.answers),
    ],
    ["result (near tie)", async (page) => seed(page, SCRIPTS["nearTie"]!.programs, SCRIPTS["nearTie"]!.answers)],
    ["result (no strong fit)", async (page) => seed(page, SCRIPTS["personaD"]!.programs, SCRIPTS["personaD"]!.answers)],
    ["result (low-math DS)", async (page) => seed(page, SCRIPTS["lowMathDS"]!.programs, SCRIPTS["lowMathDS"]!.answers)],
  ];

  for (const [name, setup] of pages) {
    test(`${name}: sensible heading order and accessible names`, async ({ page }) => {
      await setup(page);
      await expect(page.locator("main h1")).toHaveCount(1);
      expectSensibleHeadings(await headingLevels(page));

      const unnamed = await page.locator("main button, main a, main input").evaluateAll((els) =>
        els
          .filter((el) => {
            const label = (el as HTMLElement).getAttribute("aria-label") ?? "";
            const text = (el.textContent ?? "").trim();
            const viaLabel = (el.closest("label")?.textContent ?? "").trim();
            return !(label || text || viaLabel);
          })
          .map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unnamed).toEqual([]);
      // Landmarks: document language and direction are set for assistive technology.
      expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual([
        "he",
        "rtl",
      ]);
    });

    test(`${name}: text contrast meets 4.5:1 (3:1 for large text)`, async ({ page }) => {
      await setup(page);
      const violations = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const rgba = (css: string): [number, number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = "#000";
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
        };
        const over = (top: number[], bottom: number[]) => {
          const a = top[3]!;
          return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a));
        };
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            const s = v! / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        const background = (el: Element) => {
          const layers: number[][] = [];
          for (let node: Element | null = el; node; node = node.parentElement) {
            const bg = rgba(getComputedStyle(node).backgroundColor);
            if (bg[3] > 0) layers.push(bg);
            if (bg[3] === 1) break;
          }
          let result = [255, 255, 255];
          for (const layer of layers.reverse()) result = over(layer, result);
          return result;
        };
        const bad: string[] = [];
        let inspected = 0;
        for (const el of document.querySelectorAll("main *")) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
          if (!own) continue;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;
          if ((el as HTMLButtonElement).disabled || el.closest("[disabled]")) continue; // disabled controls are exempt
          inspected += 1;
          const fg = rgba(style.color);
          const bg = background(el);
          const text = over(fg, bg);
          const [l1, l2] = [lum(text), lum(bg)].sort((a, b) => b - a);
          const ratio = (l1! + 0.05) / (l2! + 0.05);
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5))
            bad.push(`${ratio.toFixed(2)} ${size}px "${(el.textContent ?? "").trim().slice(0, 40)}"`);
        }
        return { bad, inspected };
      });
      expect(violations.inspected).toBeGreaterThan(5);
      expect(violations.bad).toEqual([]);
    });
  }

  test("the MIS qualifier is exposed to assistive technology next to the name", async ({ page }) => {
    await open(page);
    const label = page.locator(`label[data-program-id="${MIS}"]`);
    await expect(label).toContainText("ניהול מערכות מידע");
    await expect(label).toContainText("דו-חוגי עם מנהל עסקים");
  });
});
