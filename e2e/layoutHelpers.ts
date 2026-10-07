import { expect, type Page } from "@playwright/test";

/** Shared V2 layout assertions (320 / 390 / desktop): RTL, no overflow, no clipping, 44px targets, one h1. */
export async function expectLayoutOk(page: Page, label: string) {
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
