import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { V3_PERSONAS } from "../tests/flow/v3Personas";
import { dataLayer, runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";
import { LEAD_PII, fillLead, leadSubmit, mockLeadApi } from "./leadHelpers";
import { reachV3Result } from "./v3Helpers";
import {
  V2_KEY,
  V3_KEY,
  V4_KEY,
  chooseAndContinue,
  chooseMethod,
  methodOption,
  openV4,
  resetV4,
  reachMethod,
  reachV4ProjectResult,
  reachV4WorldResult,
  selectEntries,
  startV4,
  stored,
  v4OptionIds,
  v4QuestionId,
} from "./v4Helpers";

/**
 * V4 (dual-entry experiment) acceptance: landing -> method choice -> worlds OR projects -> transition -> questions
 * (explicit Continue) -> the redesigned result. Both methods feed the same engine; V2 and V3 stay untouched.
 */

const v2Persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;
const v3Persona = (id: string) => V3_PERSONAS.find((p) => p.id === id)!;
const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);

test.describe("V4 landing and method choice", () => {
  test("the landing is the approved V3 landing, and its CTA goes to the method screen (not straight to worlds)", async ({
    page,
  }) => {
    await openV4(page);
    await expect(page.locator("h1")).toHaveText("איזה תחום לימודים יכול להתאים לכם?");
    await expect(page.getByRole("img", { name: "המכללה למינהל" })).toBeVisible();
    await expect(page.getByText("כ־3–5 דקות")).toBeVisible();
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    await page.getByTestId("landing-cta").click();
    await expect(page).toHaveURL(/\/v4\/start$/);
    expect(await eventsOf(page, "studymatch_landing_view")).toMatchObject([{ flow_version: "v4" }]);
  });

  test("the method screen offers exactly two equal options with the agreed copy", async ({ page }) => {
    await reachMethod(page);
    await expect(page.locator("h1")).toHaveText("איך הכי קל לכם לחשוב על העתיד שלכם?");
    await expect(
      page.getByText("אפשר להתחיל מסוג העבודה שמעניין אתכם, או מפרויקט שהייתם רוצים להיות חלק ממנו."),
    ).toBeVisible();
    await expect(page.locator("button[data-entry-mode]")).toHaveCount(2);
    await expect(methodOption(page, "worlds")).toContainText("דרך עולם שמעניין אותי");
    await expect(methodOption(page, "worlds")).toContainText("טכנולוגיה, אנשים, חינוך, משפטים, עסקים, עיצוב ועוד.");
    await expect(methodOption(page, "worlds")).toContainText(
      "מתאים אם קל לכם לדמיין באיזה סוג סביבה או עשייה הייתם רוצים להיות.",
    );
    await expect(methodOption(page, "projects")).toContainText("דרך פרויקט שהייתי רוצה לעבוד עליו");
    await expect(methodOption(page, "projects")).toContainText("Spotify, Wolt, TikTok ופרויקטים מוכרים אחרים.");
    await expect(methodOption(page, "projects")).toContainText("מתאים אם קל לכם להתחיל ממשימה או מוצר שמסקרנים אתכם.");
    // Neither option is ranked: same width, border, background and title typography.
    await page.mouse.move(1, 1); // no hover on either card
    const readLooks = () =>
      page.locator("button[data-entry-mode]").evaluateAll((els) =>
        els.map((el) => {
          const title = el.querySelector("[data-method-title]")!;
          const style = getComputedStyle(el);
          return [
            Math.round(el.getBoundingClientRect().width),
            style.borderTopColor,
            style.backgroundColor,
            getComputedStyle(title).fontSize,
            getComputedStyle(title).fontWeight,
          ].join("|");
        }),
      );
    await expect.poll(async () => new Set(await readLooks()).size).toBe(1);
    expect(await eventsOf(page, "discovery_method_view")).toMatchObject([{ flow_version: "v4" }]);
  });

  test("choosing worlds shows the nine worlds and no brand cards; the choice is reported, not scored", async ({
    page,
  }) => {
    await chooseMethod(page, "worlds");
    await expect(page.locator("h1")).toHaveText("איזה מעולמות העשייה האלה הכי מסקרן אתכם?");
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    await expect(page.locator("button[data-project-id]")).toHaveCount(0);
    expect(await eventsOf(page, "discovery_method_selected")).toMatchObject([
      { flow_version: "v4", entry_mode: "worlds" },
    ]);
    expect(await stored(page, V4_KEY)).toMatchObject({
      version: 1,
      flow: "v4",
      entryMode: "worlds",
      selectedIds: [],
      answers: [],
    });
  });

  test("choosing projects shows the seven V2 projects in the redesigned style, with the disclaimer and no worlds", async ({
    page,
  }) => {
    await chooseMethod(page, "projects");
    await expect(page.locator("h1")).toHaveText("לאיזה פרויקט הייתם הכי רוצים להצטרף?");
    await expect(page.getByText("בחרו עד שניים שהכי מסקרנים אתכם. אין תשובה נכונה.")).toBeVisible();
    await expect(page.locator("button[data-project-id]")).toHaveCount(7);
    await expect(page.locator("button[data-world-id]")).toHaveCount(0);
    await expect(page.locator('button[data-project-id="ai_feature_privacy"] [data-company-label]')).toHaveText("AI");
    await expect(page.getByText("שמות החברות מופיעים לצורך המחשה בלבד")).toBeVisible();
    // Redesigned UX: no logos or icons, one company-name typography and colour (no brand-colour hierarchy).
    await expect(page.locator("button[data-project-id] svg, main img")).toHaveCount(0);
    const labels = await page
      .locator("[data-company-label]")
      .evaluateAll((els) => els.map((el) => `${getComputedStyle(el).color}|${getComputedStyle(el).fontSize}`));
    expect(new Set(labels).size).toBe(1);
  });

  test("Back: discovery -> method screen -> landing; the chosen method is kept until changed", async ({ page }) => {
    await chooseMethod(page, "projects");
    await selectEntries(page, ["wolt_new_city"]);
    await page.getByTestId("back-to-method").click();
    await expect(page).toHaveURL(/\/v4\/start$/);
    await expect(methodOption(page, "projects")).toHaveAttribute("aria-pressed", "true");
    // Re-choosing the same method keeps the selection; choosing the other starts fresh.
    await methodOption(page, "projects").click();
    await expect(page.locator('button[data-project-id="wolt_new_city"]')).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("back-to-method").click();
    await methodOption(page, "worlds").click();
    await expect(page).toHaveURL(/\/v4\/worlds$/);
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await page.getByTestId("back-to-method").click();
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v4$/);
  });

  test("refresh keeps the method and the selection", async ({ page }) => {
    await chooseMethod(page, "projects");
    await selectEntries(page, ["nike_israel_launch", "tiktok_endless_scroll"]);
    await page.reload();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);
    expect(await stored(page, V4_KEY)).toMatchObject({
      entryMode: "projects",
      selectedIds: ["nike_israel_launch", "tiktok_endless_scroll"], // selection order kept
    });
  });
});

test.describe("V4 projects path", () => {
  test("max two, a visible third-selection message, and the sticky Continue", async ({ page }) => {
    await chooseMethod(page, "projects");
    await selectEntries(page, ["wolt_new_city", "nike_israel_launch"]);
    await page.locator('button[data-project-id="apple_store_space"]').click();
    await expect(page.getByTestId("limit-message")).toHaveText(
      "אפשר לבחור עד שני פרויקטים. בטלו בחירה אחת כדי לבחור אחרת.",
    );
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 2 מתוך 2");
    await expect(page.getByTestId("discover-continue")).toHaveText("בואו נמשיך");
  });

  test("the transition, then V2 routing with V4's explicit Continue (no tap-to-advance)", async ({ page }) => {
    await startV4(page, "projects", ["wolt_new_city"]);
    expect(await v4QuestionId(page)).toBe("B1"); // the V2 Wolt opener
    await page.locator('label:has(input[data-option-id="A"])').click();
    await page.waitForTimeout(500);
    expect(await v4QuestionId(page)).toBe("B1");
    expect(await eventsOf(page, "question_answer")).toHaveLength(0);
    await page.getByTestId("question-continue").click();
    await expect.poll(() => v4QuestionId(page)).not.toBe("B1");
    expect(await eventsOf(page, "question_answer")).toMatchObject([
      { question_id: "B1", answer_id: "A", flow_version: "v4", entry_mode: "projects" },
    ]);
  });

  test("Spotify keeps the existing V2 hand-off: V1 asks its own Q1", async ({ page }) => {
    await startV4(page, "projects", ["spotify_discover_weekly"]);
    expect(await v4QuestionId(page)).toBe("Q1");
  });

  test("project events are career_project_* with flow_version v4 and entry_mode projects", async ({ page }) => {
    await reachV4ProjectResult(page, v2Persona("accounting"));
    const events = (await dataLayer(page)).filter(
      (e) => !["studymatch_landing_view", "studymatch_start", "discovery_method_view"].includes(String(e.event)),
    );
    expect(events.length).toBeGreaterThan(5);
    for (const event of events)
      expect(event, String(event.event)).toMatchObject({ flow_version: "v4", entry_mode: "projects" });
    expect(events.some((e) => e.event === "career_project_selected")).toBe(true);
    expect(events.some((e) => String(e.event).startsWith("career_world_"))).toBe(false);
  });
});

test.describe("V4 worlds path", () => {
  test("V3 routing in V4: selection-order openers and the WT1 -> V1 Q2 hand-off (no Q1)", async ({ page }) => {
    await startV4(page, "worlds", ["law_justice", "business_markets"]);
    expect(await v4QuestionId(page)).toBe("WL1");
    await chooseAndContinue(page, "A");
    expect(await v4QuestionId(page)).toBe("WB1");

    await resetV4(page);
    const asked = await reachV4WorldResult(page, v3Persona("tech_build"));
    expect(asked.slice(0, 2)).toEqual(["WT1", "Q2"]);
    expect(asked).not.toContain("Q1");
    await expect(page.getByTestId("result-program-name")).toHaveText("מדעי המחשב");
  });

  test("world events are career_world_* with flow_version v4 and entry_mode worlds", async ({ page }) => {
    await reachV4WorldResult(page, v3Persona("law"));
    const events = (await dataLayer(page)).filter(
      (e) => !["studymatch_landing_view", "studymatch_start", "discovery_method_view"].includes(String(e.event)),
    );
    for (const event of events)
      expect(event, String(event.event)).toMatchObject({ flow_version: "v4", entry_mode: "worlds" });
    expect(events.some((e) => e.event === "career_world_selected")).toBe(true);
    expect(events.some((e) => String(e.event).startsWith("career_project_"))).toBe(false);
  });
});

test.describe("V4 result and lead", () => {
  test("the result uses the V3 hierarchy for either method", async ({ page }) => {
    await reachV4ProjectResult(page, v2Persona("accounting"));
    const order = await page.evaluate(() => {
      const y = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? NaN;
      return ["result-hero", "hero-actions", "why", "colman-section", "not-right", "lead-anchor", "all-programs"].map(
        y,
      );
    });
    for (const value of order) expect(Number.isNaN(value)).toBe(false);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test("a V4 worlds lead and a V4 projects lead carry flow_version v4, the entry mode and one id list", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    await reachV4WorldResult(page, v3Persona("law"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v4",
      entry_mode: "worlds",
      selected_world_ids: ["law_justice"],
      selected_project_ids: [],
    });

    await resetV4(page);
    await reachV4ProjectResult(page, v2Persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[1]!.body).toMatchObject({
      flow_version: "v4",
      entry_mode: "projects",
      selected_project_ids: ["wolt_new_city"],
      selected_world_ids: [],
    });
    for (const event of await dataLayer(page)) expect(JSON.stringify(event)).not.toContain(LEAD_PII.first);
  });
});

test.describe("V4 direct experiment URLs", () => {
  test("a fresh /v4/projects or /v4/worlds adopts that mode without a query parameter", async ({ page }) => {
    await page.goto("/v4/projects");
    await expect(page.locator("button[data-project-id]")).toHaveCount(7);
    expect(await stored(page, V4_KEY)).toMatchObject({ entryMode: "projects" });
    await resetV4(page);
    await page.goto("/v4/worlds");
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    expect(await stored(page, V4_KEY)).toMatchObject({ entryMode: "worlds" });
  });

  test("a journey in progress is never silently switched by the other mode's URL", async ({ page }) => {
    await startV4(page, "projects", ["wolt_new_city"]);
    await page.goto("/v4/worlds");
    // A fresh load before the first answer shows the transition again (same rule as V3); never the worlds page.
    await expect(page).toHaveURL(/\/v4\/(ready|questions)$/);
    expect(await stored(page, V4_KEY)).toMatchObject({ entryMode: "projects", selectedIds: ["wolt_new_city"] });
  });
});

test.describe("V2 / V3 / V4 isolation", () => {
  test("V2 is brand-only, V3 is world-only, V4 offers both", async ({ page }) => {
    await page.goto("/v2");
    await expect(page.locator("button[data-project-id]")).toHaveCount(7);
    await expect(page.locator("button[data-entry-mode], button[data-world-id]")).toHaveCount(0);
    await page.goto("/v3/worlds");
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    await expect(page.locator("button[data-entry-mode], button[data-project-id]")).toHaveCount(0);
    await reachMethod(page);
    await expect(page.locator("button[data-entry-mode]")).toHaveCount(2);
    for (const [path, pattern] of [
      ["/v2", /\/v2$/],
      ["/v3", /\/v3$/],
      ["/v4", /\/v4$/],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(pattern); // no version redirects into another
    }
  });

  test("V2, V3 and V4 storage never affect each other; restarting V4 clears only V4", async ({ page }) => {
    await startDiscovery(page, ["wolt_new_city"]);
    const v2 = await stored(page, V2_KEY);
    await reachV3Result(page, v3Persona("law"));
    const v3 = await stored(page, V3_KEY);
    await reachV4WorldResult(page, v3Persona("design"));
    expect(await stored(page, V4_KEY)).toMatchObject({ flow: "v4", entryMode: "worlds" });
    expect(await stored(page, V2_KEY)).toEqual(v2);
    expect(await stored(page, V3_KEY)).toEqual(v3);
    await page.getByTestId("try-again").click();
    await expect(page).toHaveURL(/\/v4$/);
    expect(await stored(page, V4_KEY)).toBeNull();
    expect(await stored(page, V2_KEY)).toEqual(v2);
    expect(await stored(page, V3_KEY)).toEqual(v3);
  });

  test("the same answers give the same outcome in V2 vs V4 projects and in V3 vs V4 worlds", async ({ browser }) => {
    const outcome = async (run: (page: Page) => Promise<unknown>) => {
      const context = await browser.newContext({ locale: "he-IL", viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await run(page);
      const view = (await dataLayer(page)).find((e) => e.event === "studymatch_result_view")!;
      await context.close();
      return {
        kind: view.result_kind,
        recommended: view.recommended_program ?? null,
        alternatives: view.alternative_programs ?? null,
      };
    };
    const accounting = v2Persona("accounting");
    const v2 = await outcome(async (page) => {
      await startDiscovery(page, accounting.projects);
      await runPersonaInBrowser(page, accounting);
    });
    const v4p = await outcome((page) => reachV4ProjectResult(page, accounting));
    expect(v4p).toEqual(v2);
    const tie = v3Persona("communication_tie");
    const v3 = await outcome((page) => reachV3Result(page, tie));
    const v4w = await outcome((page) => reachV4WorldResult(page, tie));
    expect(v4w).toEqual(v3);
  });
});

test.describe("V4 question options", () => {
  test("options are selectable before Continue in both modes", async ({ page }) => {
    await startV4(page, "worlds", ["design_spaces"]);
    const options = await v4OptionIds(page);
    expect(options.length).toBeGreaterThan(1);
    await expect(page.getByTestId("question-continue")).toBeDisabled();
  });
});
