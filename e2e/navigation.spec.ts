import { expect, test, type Page } from "@playwright/test";
import {
  ALL,
  ANSWER_GUARD_WAIT_MS,
  ANALYTICS_KEY,
  CS,
  DS,
  DURABLE_KEY,
  PERSONAS,
  answer,
  dataLayer,
  events,
  eventNames,
  open,
  questionId,
  resultKind,
  runPolicy,
  seed,
  startComparison,
} from "./helpers";

const back = (page: Page) => page.getByRole("button", { name: "חזרה", exact: true });
const restart = (page: Page) => page.getByRole("button", { name: "התחלה מחדש", exact: true });

const stored = (page: Page, key: string, area: "localStorage" | "sessionStorage" = "localStorage") =>
  page.evaluate(([k, a]) => window[a as "localStorage"].getItem(k as string), [key, area] as const);

const storedJson = async (page: Page, key: string, area: "localStorage" | "sessionStorage" = "localStorage") => {
  const raw = await stored(page, key, area);
  return raw ? JSON.parse(raw) : null;
};

const comparisonIds = async (page: Page) => (await events(page, "comparison_started")).map((e) => e.comparison_id);
const exposures = async (page: Page) => (await events(page, "question_view")).map((e) => e.question_id);

test.describe("Back", () => {
  test("Q2 → Q1: the question is shown again as a new exposure and the answer can be changed", async ({ page }) => {
    await startComparison(page);
    await answer(page, "A");
    expect(await questionId(page)).toBe("Q2");

    await back(page).click();
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible();
    expect((await storedJson(page, DURABLE_KEY)).answers).toEqual([]);
    expect(await exposures(page)).toEqual(["Q1", "Q2", "Q1"]);

    await answer(page, "B");
    expect(await questionId(page)).toBe("Q2");
    expect((await storedJson(page, DURABLE_KEY)).answers).toEqual([{ questionId: "Q1", answerId: "B" }]);
  });

  test("branch question → previous question; changing earlier answers recomputes the branch (no stale branch)", async ({
    page,
  }) => {
    await startComparison(page);
    for (const [q, a] of [
      ["Q1", "A"],
      ["Q2", "A"],
      ["Q3", "5"],
    ] as const) {
      expect(await questionId(page)).toBe(q);
      await answer(page, a);
    }
    // A builder profile is routed to the CS/DS branch.
    expect(await questionId(page)).toBe("CSDS-1");

    await back(page).click();
    await expect(page.locator('[data-question-id="Q3"]')).toBeVisible();
    await back(page).click();
    await expect(page.locator('[data-question-id="Q2"]')).toBeVisible();
    await back(page).click();
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible();
    expect((await storedJson(page, DURABLE_KEY)).answers).toEqual([]);

    // Re-answer as a business-minded candidate: the old CS/DS branch must not survive.
    await answer(page, "C");
    await answer(page, "C");
    await answer(page, "3");
    expect(await questionId(page)).toBe("DSMIS-1");

    const branches = (await events(page, "adaptive_branch_selected")).map((e) => e.branch_id);
    expect(branches).toEqual(["computer_science|data_science", "data_science|management_information_systems"]);
    // Every re-shown question counted as a new logical exposure.
    expect(await exposures(page)).toEqual(["Q1", "Q2", "Q3", "CSDS-1", "Q3", "Q2", "Q1", "Q2", "Q3", "DSMIS-1"]);
  });

  test("result → last question: the stale result is gone and the path recomputes from the changed answer", async ({
    page,
  }) => {
    await startComparison(page);
    await runPolicy(page, PERSONAS.A);
    expect(await resultKind(page)).toBe("recommended");
    expect(await events(page, "comparison_completed")).toHaveLength(1);

    await page.getByRole("button", { name: "חזרה לשאלה האחרונה" }).click();
    await expect(page.locator('[data-question-id="CSDS-2"]')).toBeVisible();
    await expect(page.locator("[data-result-kind]")).toHaveCount(0);
    expect((await storedJson(page, DURABLE_KEY)).answers).toHaveLength(4);

    // "Neither" breaks the agreement that justified stopping at 5: the flow must now ask one more question.
    await answer(page, "neither");
    expect(await questionId(page)).toBe("CSDS-3");
    await answer(page, "cs");
    await expect(page.locator("[data-result-kind]").first()).toBeVisible();
    expect((await storedJson(page, DURABLE_KEY)).answers).toHaveLength(6);

    expect(await exposures(page)).toContain("CSDS-2");
    expect((await exposures(page)).filter((id) => id === "CSDS-2")).toHaveLength(2);
    expect(await events(page, "comparison_completed")).toHaveLength(2);
    // Same comparison throughout.
    expect(new Set((await dataLayer(page)).map((e) => e.comparison_id).filter(Boolean)).size).toBe(1);
  });
});

test.describe("Restart", () => {
  test("from the questions: clears state safely and the next comparison gets a new comparison_id", async ({ page }) => {
    await startComparison(page);
    await answer(page, "A");
    const [first] = await comparisonIds(page);
    expect(first).toBeTruthy();

    await restart(page).click();
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    expect(await stored(page, DURABLE_KEY)).toBeNull();
    expect((await storedJson(page, ANALYTICS_KEY, "sessionStorage")).comparison_id).toBeNull();
    await expect(page.locator("label[data-program-id] input:checked")).toHaveCount(0);
    expect(await events(page, "restart_comparison")).toHaveLength(1);

    await page.locator(`label[data-program-id="${CS}"] input`).check();
    await page.locator(`label[data-program-id="${DS}"] input`).check();
    await page.getByRole("button", { name: "התחילו בהשוואה" }).click();
    const ids = await comparisonIds(page);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(first);
  });

  test("from the result: clears everything and the next comparison gets a new comparison_id", async ({ page }) => {
    await startComparison(page);
    await runPolicy(page, PERSONAS.B);
    const [first] = await comparisonIds(page);

    await page.getByRole("button", { name: "התחלה מחדש", exact: true }).click();
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    expect(await stored(page, DURABLE_KEY)).toBeNull();
    await expect(page.locator("label[data-program-id] input:checked")).toHaveCount(0);

    for (const id of ALL) await page.locator(`label[data-program-id="${id}"] input`).check();
    await page.getByRole("button", { name: "התחילו בהשוואה" }).click();
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible();
    const ids = await comparisonIds(page);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(first);
    expect((await storedJson(page, ANALYTICS_KEY, "sessionStorage")).comparison_id).toBe(ids[1]);
  });

  test("focused top-two comparison preselects only the top two, without fake degree_selected events", async ({
    page,
  }) => {
    await startComparison(page, ALL);
    await runPolicy(page, PERSONAS.A); // top two: CS and DS (MIS is third)
    const selectedBefore = (await events(page, "degree_selected")).length;
    const [first] = await comparisonIds(page);

    await page.getByRole("button", { name: "השוואה ממוקדת בין שתי האפשרויות הקרובות" }).click();
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    const checked = await page
      .locator("label[data-program-id] input:checked")
      .evaluateAll((els) => els.map((el) => el.closest("label")!.getAttribute("data-program-id")));
    expect(checked.sort()).toEqual([CS, DS]);
    await expect(page.locator(`label[data-program-id="management_information_systems"] input`)).not.toBeChecked();

    // Tracked as restart_comparison; the preselection is programmatic, not a candidate selection.
    expect(await events(page, "restart_comparison")).toHaveLength(1);
    expect(await events(page, "degree_selected")).toHaveLength(selectedBefore);

    await page.getByRole("button", { name: "התחילו בהשוואה" }).click();
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible();
    const started = await events(page, "comparison_started");
    expect(started.at(-1)).toMatchObject({
      comparison_cluster: "computer_science|data_science",
      selected_program_count: 2,
    });
    expect(started.at(-1)!.comparison_id).not.toBe(first);
    // CS/DS only: never an MIS question.
    const ids = await exposures(page);
    expect(ids.slice(-1)[0]).toBe("Q1");
  });
});

test.describe("Refresh and persistence", () => {
  async function expectRestoredQuietly(page: Page, expectedQuestion: string) {
    await page.reload();
    await expect(page.locator(`[data-question-id="${expectedQuestion}"]`)).toBeVisible();
    // Fresh window: nothing in the dataLayer may claim a new comparison, selection or duplicate exposure.
    const names = await eventNames(page);
    expect(names).not.toContain("comparison_started");
    expect(names).not.toContain("degree_selected");
    expect(names).not.toContain("question_view");
    expect(names).not.toContain("adaptive_branch_selected");
  }

  test("during the opening questions", async ({ page }) => {
    await startComparison(page);
    await answer(page, "A");
    await answer(page, "A");
    const before = await storedJson(page, ANALYTICS_KEY, "sessionStorage");

    await expectRestoredQuietly(page, "Q3");
    expect((await storedJson(page, DURABLE_KEY)).answers).toHaveLength(2);
    expect((await storedJson(page, ANALYTICS_KEY, "sessionStorage")).comparison_id).toBe(before.comparison_id);

    // The comparison simply continues: the next exposure is Q4's predecessor chain, not a repeat of Q3.
    await answer(page, "5");
    expect(await questionId(page)).toBe("CSDS-1");
    expect(await exposures(page)).toEqual(["CSDS-1"]);
  });

  test("during an adaptive branch", async ({ page }) => {
    await startComparison(page);
    for (const a of ["A", "A", "5"]) await answer(page, a);
    await answer(page, "cs"); // CSDS-1 -> CSDS-2
    const before = await storedJson(page, ANALYTICS_KEY, "sessionStorage");

    await expectRestoredQuietly(page, "CSDS-2");
    expect((await storedJson(page, DURABLE_KEY)).answers).toHaveLength(4);
    expect((await storedJson(page, ANALYTICS_KEY, "sessionStorage")).comparison_id).toBe(before.comparison_id);
  });

  test("on the result: the result is recomputed, not stored, and nothing is re-emitted", async ({ page }) => {
    await startComparison(page);
    await runPolicy(page, PERSONAS.C);
    const heading = await page.locator("h1").first().innerText();
    const before = await storedJson(page, ANALYTICS_KEY, "sessionStorage");

    await page.reload();
    await expect(page.locator("[data-result-kind]").first()).toBeVisible();
    expect(await page.locator("h1").first().innerText()).toBe(heading);
    expect(await resultKind(page)).toBe("recommended");

    const durable = await storedJson(page, DURABLE_KEY);
    expect(Object.keys(durable).sort()).toEqual(["answers", "selectedProgramIds", "version"]);
    expect(JSON.stringify(durable)).not.toMatch(/result|ranking|score|utm|comparison_id/);
    expect((await storedJson(page, ANALYTICS_KEY, "sessionStorage")).comparison_id).toBe(before.comparison_id);
    const names = await eventNames(page);
    expect(names).not.toContain("comparison_started");
    expect(names).not.toContain("comparison_completed");
    expect(names).not.toContain("recommended_program");
  });

  test("analytics context stays in sessionStorage, separate from the durable comparison state", async ({ page }) => {
    await startComparison(page, ALL, "?utm_source=qa&utm_medium=e2e");
    await answer(page, "A");
    expect(await stored(page, ANALYTICS_KEY, "localStorage")).toBeNull();
    expect(await stored(page, DURABLE_KEY, "sessionStorage")).toBeNull();
    const analytics = await storedJson(page, ANALYTICS_KEY, "sessionStorage");
    expect(Object.keys(analytics).sort()).toEqual(["comparison_id", "last_question_view", "utm", "version"]);
    expect(analytics.utm).toEqual({ utm_source: "qa", utm_medium: "e2e" });
    expect(JSON.stringify(analytics)).not.toMatch(/answers|result|ranking/);
  });
});

test.describe("Corrupt or inconsistent durable state", () => {
  const cases: Array<[string, string]> = [
    ["not JSON", "{oops"],
    ["wrong version", JSON.stringify({ version: 9, selectedProgramIds: ["computer_science"], answers: [] })],
    ["unknown program", JSON.stringify({ version: 1, selectedProgramIds: ["physics", CS], answers: [] })],
    [
      "unknown option",
      JSON.stringify({ version: 1, selectedProgramIds: [CS, DS], answers: [{ questionId: "Q1", answerId: "ZZZ" }] }),
    ],
    [
      "extra derived data",
      JSON.stringify({ version: 1, selectedProgramIds: [CS, DS], answers: [], result: { bestFitProgram: "x" } }),
    ],
  ];
  for (const [name, raw] of cases) {
    test(`falls back safely: ${name}`, async ({ page }) => {
      await open(page);
      await page.evaluate(([key, value]) => localStorage.setItem(key as string, value as string), [DURABLE_KEY, raw]);
      for (const route of ["/", "/questions", "/result"]) {
        await page.goto(route);
        await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
        expect(new URL(page.url()).pathname).toBe("/");
      }
      expect(await stored(page, DURABLE_KEY)).toBeNull(); // the corrupt entry is removed
      await expect(page.locator("label[data-program-id] input:checked")).toHaveCount(0);
      // The app is usable again.
      await startComparison(page, [CS, DS]);
      expect(await questionId(page)).toBe("Q1");
    });
  }

  test("a deep link to /result or /questions without a comparison redirects to selection", async ({ page }) => {
    await page.goto("/result");
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    await page.goto("/questions");
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    await seed(page, [CS, DS], [["Q1", "A"]], "/questions");
    await expect(page.locator('[data-question-id="Q2"]')).toBeVisible();
  });
});

test.describe("double tap protection", () => {
  test.use({ hasTouch: true });

  async function expectSingleAnswer(page: Page) {
    await page.waitForTimeout(500);
    expect(await questionId(page)).toBe("Q2");
    const answers = await events(page, "question_answer");
    expect(answers.map((e) => `${e.question_id}:${e.answer_id}`)).toEqual(["Q1:A"]);
    expect((await storedJson(page, DURABLE_KEY)).answers).toEqual([{ questionId: "Q1", answerId: "A" }]);
  }

  test("a physical double click answers only the displayed question", async ({ page }) => {
    await startComparison(page);
    await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
    await page.locator('button[data-option-id="A"]').dblclick();
    await expectSingleAnswer(page);
  });

  test("a touch double tap answers only the displayed question (the second tap must not hit the next question)", async ({
    page,
  }) => {
    await startComparison(page);
    await page.waitForTimeout(ANSWER_GUARD_WAIT_MS);
    const box = (await page.locator('button[data-option-id="A"]').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(120);
    await page.touchscreen.tap(x, y);
    await expectSingleAnswer(page);
  });

  test("after the short guard a deliberate answer on the next question is accepted", async ({ page }) => {
    await startComparison(page);
    await answer(page, "A");
    await answer(page, "A"); // answer() waits out the guard like a person reading
    expect(await questionId(page)).toBe("Q3");
  });
});

test.describe("browser history buttons", () => {
  test("browser Back/Forward around a completed comparison never traps or breaks the candidate", async ({ page }) => {
    await startComparison(page, ALL);
    await runPolicy(page, PERSONAS.A);
    const heading = await page.locator("h1").first().innerText();

    await page.goBack();
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד"); // selection, programs still selected
    await expect(page.locator("label[data-program-id] input:checked")).toHaveCount(3);
    expect(new URL(page.url()).pathname).toBe("/");

    await page.goForward();
    await expect(page.locator("[data-result-kind]").first()).toBeVisible();
    expect(await page.locator("h1").first().innerText()).toBe(heading);
  });

  test("browser Back from the questions returns to selection and starting again begins a clean run", async ({
    page,
  }) => {
    await startComparison(page, [CS, DS]);
    await answer(page, "A");
    await page.goBack();
    await expect(page.locator("h1")).toContainText("אילו תוכניות לימוד");
    await page.getByRole("button", { name: "התחילו בהשוואה" }).click();
    await expect(page.locator('[data-question-id="Q1"]')).toBeVisible(); // a fresh pass, no stale answers
    expect((await storedJson(page, DURABLE_KEY)).answers).toEqual([]);
  });
});
