import { expect, test, type Page } from "@playwright/test";
import {
  ADVISOR_URL,
  ANSWER_GUARD_WAIT_MS,
  ALL,
  CS,
  DS,
  MIS,
  PERSONAS,
  dataLayer,
  events,
  eventNames,
  questionId,
  runPolicy,
  startComparison,
} from "./helpers";

const CLUSTER = "computer_science|data_science|management_information_systems";
const UTM = "?utm_source=qa&utm_medium=e2e&utm_campaign=thi12";
const SAFE = /^[A-Za-z0-9_|:.-]+$/;

/** Stop anchors from navigating away so the click handler (and its analytics) can be inspected in-page. */
async function neutraliseLinks(page: Page) {
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (e) =>
        (e.target as HTMLElement).closest("a")?.addEventListener("click", (ev) => ev.preventDefault(), { once: true }),
      true,
    );
  });
}

test("complete 5-question path: real-browser dataLayer sequence and payload contract", async ({ page }) => {
  await startComparison(page, ALL, UTM);

  // A real double click on the first answer must record exactly one answer (the second click must not hit Q2).
  await page.waitForTimeout(ANSWER_GUARD_WAIT_MS); // a person reads the question before answering
  await page.locator('button[data-option-id="A"]').dblclick();
  await page.waitForTimeout(500);
  expect(await questionId(page)).toBe("Q2");

  // Finish with the Persona A policy from wherever the flow is now.
  await runPolicy(page, PERSONAS.A);
  const layer = await dataLayer(page);
  const names = layer.map((e) => String(e.event));

  // Sequence contract.
  expect(names.slice(0, 5)).toEqual([
    "degree_compare_view",
    "degree_selected",
    "degree_selected",
    "degree_selected",
    "comparison_started",
  ]);
  expect(names.filter((n) => n === "adaptive_branch_selected")).toHaveLength(1);
  expect(names.filter((n) => n === "tie_breaker_view")).toHaveLength(0);
  expect(names.at(-2)).toBe("comparison_completed");
  expect(names.at(-1)).toBe("recommended_program");

  const answers = layer.filter((e) => e.event === "question_answer");
  const views = layer.filter((e) => e.event === "question_view");
  // Accepted answers only: one event per question, never duplicated by the double click.
  expect(new Set(answers.map((e) => e.question_id)).size).toBe(answers.length);
  expect(answers.length).toBeGreaterThanOrEqual(5);
  expect(answers.length).toBeLessThanOrEqual(7);
  expect(views.length).toBeGreaterThanOrEqual(answers.length - 1);
  expect(answers.map((e) => e.question_index)).toEqual(answers.map((_, i) => i + 1));
  for (const answer of answers) {
    expect(typeof answer.leading_program, `leading_program on ${answer.question_id}`).toBe("string");
    expect(typeof answer.answer_id).toBe("string");
  }

  // One comparison id from comparison_started to the end.
  const ids = new Set(
    layer.filter((e) => e.event !== "degree_compare_view" && e.event !== "degree_selected").map((e) => e.comparison_id),
  );
  expect(ids.size).toBe(1);
  expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/);
  for (const event of layer.filter((e) => e.event === "degree_selected" || e.event === "degree_compare_view")) {
    expect(event.comparison_id).toBeUndefined(); // not started yet
  }

  // From comparison_started on, every event carries the same canonical cluster.
  for (const event of layer.slice(names.indexOf("comparison_started"))) expect(event.comparison_cluster).toBe(CLUSTER);

  // Canonical values, UTMs everywhere, no free text.
  const completed = (await events(page, "comparison_completed"))[0]!;
  expect(completed).toMatchObject({
    comparison_cluster: CLUSTER,
    program_1: CS,
    program_2: DS,
    program_3: MIS,
    selected_program_count: 3,
    recommended_program: CS,
    result_kind: "recommended",
  });
  expect(String(completed.main_decision_pair).split("|")).toEqual(
    [...String(completed.main_decision_pair).split("|")].sort(),
  );
  for (const event of layer) {
    expect(event.utm_source).toBe("qa");
    expect(event.utm_medium).toBe("e2e");
    expect(event.utm_campaign).toBe("thi12");
    for (const [key, value] of Object.entries(event)) {
      if (key.startsWith("utm_")) continue;
      if (typeof value === "string") {
        expect(value, `${event.event}.${key}`).toMatch(SAFE);
        expect(value).not.toMatch(/[֐-׿]/);
      }
    }
  }
});

test("double tap on an answer records exactly one answer", async ({ page }) => {
  await startComparison(page, ALL);
  await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
  // Two rapid clicks on the SAME element (a stale tap on a question that was just answered).
  await page.locator('button[data-option-id="A"]').evaluate((el) => {
    (el as HTMLButtonElement).click();
    (el as HTMLButtonElement).click();
  });
  await expect(page.locator('[data-question-id="Q2"]')).toBeVisible();
  expect(await events(page, "question_answer")).toHaveLength(1);
  expect(await events(page, "question_view").then((v) => v.map((e) => e.question_id))).toEqual(["Q1", "Q2"]);
});

test("result interactions: mirror, secondary view, admission, advisor (configured), restart", async ({ page }) => {
  await startComparison(page, ALL, UTM);
  await runPolicy(page, PERSONAS.A);
  await neutraliseLinks(page);
  const base = (await eventNames(page)).length;

  await page.getByRole("button", { name: "כן, זה נשמע כמוני" }).click();
  await page.getByRole("region", { name: "ומה לגבי האפשרות השנייה?" }).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await events(page, "secondary_program_view")).length).toBe(1);
  await page.getByRole("link", { name: /לבדיקת תנאי הקבלה/ }).click();
  await page.getByRole("link", { name: /לשוחח עם יועץ/ }).click();

  const mirror = (await events(page, "mirror_response"))[0]!;
  expect(mirror).toMatchObject({ mirror_response: "yes", result_kind: "recommended", recommended_program: CS });
  const secondary = (await events(page, "secondary_program_view"))[0]!;
  expect(secondary).toMatchObject({ program_id: DS, result_kind: "recommended" });
  expect(await events(page, "admission_click")).toHaveLength(1);
  expect(await events(page, "advisor_cta_click")).toHaveLength(1);
  // The same comparison id as the run itself.
  const runId = (await events(page, "comparison_started"))[0]!.comparison_id;
  for (const name of ["mirror_response", "secondary_program_view", "admission_click", "advisor_cta_click"]) {
    expect((await events(page, name))[0]!.comparison_id).toBe(runId);
  }
  expect((await eventNames(page)).length).toBeGreaterThan(base);

  // Re-scrolling the same section does not repeat the view event.
  await page.getByRole("region", { name: "מה עושים עכשיו?" }).scrollIntoViewIfNeeded();
  await page.getByRole("region", { name: "ומה לגבי האפשרות השנייה?" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  expect(await events(page, "secondary_program_view")).toHaveLength(1);

  await page.getByRole("button", { name: "התחלה מחדש", exact: true }).click();
  const restarts = await events(page, "restart_comparison");
  expect(restarts).toHaveLength(1);
  expect(restarts[0]).toMatchObject({ comparison_id: runId, comparison_cluster: CLUSTER });
});

test("mirror 'not exactly' is reported too, and does not change the result", async ({ page }) => {
  await startComparison(page, ALL);
  await runPolicy(page, PERSONAS.B);
  const before = await page.locator("h1").first().innerText();
  await page.getByRole("button", { name: "לא בדיוק" }).click();
  expect((await events(page, "mirror_response"))[0]).toMatchObject({ mirror_response: "no" });
  expect(await page.locator("h1").first().innerText()).toBe(before);
});

test("reality_check_view fires once per exposed check and only when a check exists", async ({ page }) => {
  await startComparison(page, ALL);
  await runPolicy(page, PERSONAS.A);
  await page.getByRole("region", { name: "מה עושים עכשיו?" }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  expect(await events(page, "reality_check_view")).toHaveLength(0);

  await page.getByRole("button", { name: "התחלה מחדש", exact: true }).click();
  await startComparison(page, ALL);
  await runPolicy(page, PERSONAS.lowMathDS);
  const checks = page.locator("[data-reality-check]");
  const count = await checks.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count; i++) await checks.nth(i).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await events(page, "reality_check_view")).length).toBe(count);
  for (let i = 0; i < count; i++) await checks.nth(i).scrollIntoViewIfNeeded(); // again: no repeats
  await page.waitForTimeout(300);
  const views = await events(page, "reality_check_view");
  expect(views).toHaveLength(count);
  expect(new Set(views.map((e) => e.program_id)).size).toBe(count);
  for (const view of views) expect([CS, DS, MIS]).toContain(view.program_id);
});

test("no_strong_fit emits completion without inventing a recommendation", async ({ page }) => {
  await startComparison(page, ALL);
  await runPolicy(page, PERSONAS.D);
  const completed = (await events(page, "comparison_completed"))[0]!;
  expect(completed).toMatchObject({ result_kind: "no_strong_fit", fit_classification: "no_strong_fit" });
  expect(completed.recommended_program).toBeUndefined();
  expect(completed.secondary_program).toBeDefined(); // analytical rank #2 is kept
  expect(await events(page, "recommended_program")).toHaveLength(0);
  expect(await events(page, "tie_breaker_view")).toHaveLength(0);
});

test("the advisor CTA exists in this build (configured) and links to the configured URL", async ({ page }) => {
  await startComparison(page, ALL);
  await runPolicy(page, PERSONAS.A);
  await expect(page.getByRole("link", { name: /לשוחח עם יועץ/ })).toHaveAttribute("href", ADVISOR_URL);
});
