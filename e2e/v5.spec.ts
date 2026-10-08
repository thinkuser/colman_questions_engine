import { expect, test, type Page } from "@playwright/test";
import { V3_PERSONAS, v3PersonaChoice } from "../tests/flow/v3Personas";
import { dataLayer } from "./discoveryHelpers";
import { fillLead, LEAD_PII, mockLeadApi } from "./leadHelpers";
import { V4_KEY, v4LeadSubmit } from "./v4Helpers";
import {
  answerUntilV5Result,
  chooseAndContinueV5,
  chooseV5Method,
  methodOption,
  openV5,
  reachV5Method,
  reachV5ProjectResult,
  reachV5WorldResult,
  resetV5,
  scripted,
  selectEntries,
  startV5,
  stored,
  v5MasculineOnScreen,
  V5_KEY,
  V5_PATHS_TO,
  V5_PROJECT_IDS,
  v5OptionIds,
  v5QuestionId,
  v5Result,
} from "./v5Helpers";

/**
 * V5 acceptance (DEC-037): dual entry with balanced project-led discovery at /v5. Worlds are V4's (WORLD_STRATEGY);
 * projects are the ten V5 projects (PROJECT_STRATEGY). V1-V4 are untouched (their suites run unchanged); the V4/V5
 * isolation checks live here.
 */

const v3Persona = (id: string) => V3_PERSONAS.find((p) => p.id === id)!;
const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);

test.describe("V5 landing and method choice", () => {
  test("the landing (inclusive V4 copy) leads to /v5/start, which shows the approved V4 framing", async ({ page }) => {
    await openV5(page);
    await expect(page.locator("h1")).toHaveText("איזה תחום לימודים יכול להתאים לך?");
    await page.getByTestId("landing-cta").click();
    await expect(page).toHaveURL(/\/v5\/start$/);
    await expect(page.locator("h1")).toHaveText("מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?");
    await expect(page.getByText("אפשר לבחור את האפשרות שהכי מתאימה — ונמשיך משם.")).toBeVisible();
    await expect(methodOption(page, "worlds")).toContainText("יש לי כיוון שאני רוצה ללמוד");
    await expect(methodOption(page, "projects")).toContainText("אין לי מושג מה אני רוצה ללמוד");
    expect(await eventsOf(page, "studymatch_landing_view")).toMatchObject([{ flow_version: "v5" }]);
    expect(await eventsOf(page, "discovery_method_view")).toMatchObject([{ flow_version: "v5" }]);
  });

  test("choosing projects reports the method (0 points) and opens /v5/projects", async ({ page }) => {
    await chooseV5Method(page, "projects");
    expect(await eventsOf(page, "discovery_method_selected")).toMatchObject([
      { flow_version: "v5", entry_mode: "projects" },
    ]);
    expect(await stored(page, V5_KEY)).toMatchObject({
      version: 1,
      flow: "v5",
      entryMode: "projects",
      selectedIds: [],
      answers: [],
    });
  });

  test("Back: discovery -> method screen -> landing", async ({ page }) => {
    await chooseV5Method(page, "projects");
    await page.getByTestId("back-to-method").click();
    await expect(page).toHaveURL(/\/v5\/start$/);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v5$/);
  });
});

test.describe("V5 method screen layout", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Worlds is the RIGHT card and Projects the LEFT card, equal in size; each routes inside /v5", async ({
    page,
  }) => {
    await reachV5Method(page);
    const worlds = (await methodOption(page, "worlds").boundingBox())!;
    const projects = (await methodOption(page, "projects").boundingBox())!;
    expect(worlds.x).toBeGreaterThan(projects.x);
    expect(Math.abs(worlds.y - projects.y)).toBeLessThan(2);
    expect(Math.round(worlds.width)).toBe(Math.round(projects.width));
    expect(Math.round(worlds.height)).toBe(Math.round(projects.height));
    await methodOption(page, "worlds").click();
    await expect(page).toHaveURL(/\/v5\/worlds$/);
  });
});

test.describe("V5 projects screen", () => {
  test("shows exactly the 10 V5 projects in order, text-first, with the V5 headline and the disclaimer", async ({
    page,
  }) => {
    await chooseV5Method(page, "projects");
    await expect(page.locator("h1")).toHaveText("איזה מהפרויקטים האלה הכי מסקרן?");
    await expect(
      page.getByText("אפשר לבחור עד שניים — לפי המשימה שנשמעת הכי מעניינת, לא לפי השם שמופיע עליה."),
    ).toBeVisible();
    const ids = await page
      .locator("button[data-project-id]")
      .evaluateAll((els) => els.map((el) => el.dataset.projectId));
    expect(ids).toEqual(V5_PROJECT_IDS);
    await expect(page.locator('button[data-project-id="spotify_discovery"]')).toContainText(
      "לשפר את הדרך שבה מגלים מוזיקה חדשה שמתאימה בדיוק לטעם האישי.",
    );
    await expect(page.locator('button[data-project-id="people_change"] [data-project-title]')).toHaveText(
      "מרכז ליווי והתפתחות",
    );
    await expect(page.getByText("שמות החברות מופיעים לצורך המחשה בלבד")).toBeVisible();
    // No logos or icons, one title typography and colour (no brand-colour hierarchy).
    await expect(page.locator("button[data-project-id] svg, main img")).toHaveCount(0);
    const looks = await page
      .locator("[data-project-title]")
      .evaluateAll((els) => els.map((el) => `${getComputedStyle(el).color}|${getComputedStyle(el).fontSize}`));
    expect(new Set(looks).size).toBe(1);
    expect(await eventsOf(page, "career_project_discovery_view")).toMatchObject([
      { flow_version: "v5", entry_mode: "projects", project_count_available: 10 },
    ]);
  });

  test("max two, a visible third-selection warning, selection events with V5 ids", async ({ page }) => {
    await chooseV5Method(page, "projects");
    await selectEntries(page, ["nike_launch", "people_change"]);
    await page.locator('button[data-project-id="apple_store_space"]').click();
    await expect(page.getByTestId("limit-message")).toHaveText(
      "אפשר לבחור עד שני פרויקטים. כדי לבחור פרויקט אחר, צריך קודם לבטל בחירה אחת.",
    );
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 2 מתוך 2");
    expect(await eventsOf(page, "career_project_selected")).toMatchObject([
      { flow_version: "v5", entry_mode: "projects", project_id: "nike_launch", selection_position: 1 },
      { flow_version: "v5", entry_mode: "projects", project_id: "people_change", selection_position: 2 },
    ]);
  });

  test("two projects: the openers follow the candidate's selection order", async ({ page }) => {
    await startV5(page, "projects", ["tiktok_behavior", "nike_launch"]);
    expect(await v5QuestionId(page)).toBe("V5-TIKTOK");
    await chooseAndContinueV5(page, "A");
    expect(await v5QuestionId(page)).toBe("V5-NIKE");

    await resetV5(page);
    await startV5(page, "projects", ["nike_launch", "tiktok_behavior"]);
    expect(await v5QuestionId(page)).toBe("V5-NIKE");
    await chooseAndContinueV5(page, "A");
    expect(await v5QuestionId(page)).toBe("V5-TIKTOK");
  });

  test("Spotify: the opener carries into V1 as Q1, so V1 continues at Q2 and never asks Q1", async ({ page }) => {
    await startV5(page, "projects", ["spotify_discovery"]);
    expect(await v5QuestionId(page)).toBe("V5-SPOTIFY");
    await expect(page.locator("h1")).toHaveText("Discover Weekly לא פוגע מספיק טוב. איזה חלק הכי מסקרן?");
    const asked = await answerUntilV5Result(page, (_id, offered) => offered[0]!);
    expect(asked[0]).toBe("V5-SPOTIFY");
    expect(asked[1]).toBe("Q2");
    expect(asked).not.toContain("Q1");
    await expect(v5Result(page)).toHaveAttribute("data-result-source", "precision");
  });

  test("Back from the first question returns to /v5/projects with the selection kept", async ({ page }) => {
    await startV5(page, "projects", ["accounting_gap"]);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v5\/projects$/);
    await expect(page.locator('button[data-project-id="accounting_gap"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("V5 worlds path (identical to V4 worlds)", () => {
  test("nine worlds with V4's inclusive copy, WT1 -> V1 Q2 carry, world events with flow_version v5", async ({
    page,
  }) => {
    await chooseV5Method(page, "worlds");
    await expect(page.locator("h1")).toHaveText("איזה מעולמות העשייה האלה הכי מסקרן אותך?");
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    await expect(page.locator("button[data-project-id]")).toHaveCount(0);
    await resetV5(page);
    const asked = await reachV5WorldResult(page, v3Persona("tech_build"));
    expect(asked.slice(0, 2)).toEqual(["WT1", "Q2"]);
    await expect(page.getByTestId("result-program-name")).toHaveText("מדעי המחשב");
    const events = (await dataLayer(page)).filter((e) => String(e.event).startsWith("career_world_"));
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(event).toMatchObject({ flow_version: "v5", entry_mode: "worlds" });
  });
});

test.describe("V5 direct experiment URLs", () => {
  test("a fresh /v5/projects or /v5/worlds adopts that mode, without a fabricated method choice", async ({ page }) => {
    await page.goto("/v5/projects");
    await expect(page.locator("button[data-project-id]")).toHaveCount(10);
    expect(await stored(page, V5_KEY)).toMatchObject({ entryMode: "projects" });
    expect(await eventsOf(page, "discovery_method_selected")).toHaveLength(0);
    await page.locator('button[data-project-id="nike_launch"]').click();
    const [selected] = await eventsOf(page, "career_project_selected");
    expect(selected).toMatchObject({ flow_version: "v5", entry_mode: "projects", project_id: "nike_launch" });

    await resetV5(page);
    await page.goto("/v5/worlds");
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    expect(await stored(page, V5_KEY)).toMatchObject({ entryMode: "worlds" });
    expect(await eventsOf(page, "discovery_method_selected")).toHaveLength(0);
  });

  test("a journey in progress is never silently switched to the other mode", async ({ page }) => {
    await startV5(page, "projects", ["nike_launch"]);
    await chooseAndContinueV5(page, "A");
    await page.goto("/v5/worlds");
    await expect(page).toHaveURL(/\/v5\/questions$/);
    expect(await stored(page, V5_KEY)).toMatchObject({ entryMode: "projects", selectedIds: ["nike_launch"] });
  });
});

test.describe("V4 / V5 isolation", () => {
  test("V4 /v4/projects still shows its original 7 projects; V5 shows 10; neither route redirects to the other", async ({
    page,
  }) => {
    await page.goto("/v4/projects");
    await expect(page).toHaveURL(/\/v4\/projects$/);
    await expect(page.locator("button[data-project-id]")).toHaveCount(7);
    await expect(page.locator('button[data-project-id="wolt_new_city"]')).toBeVisible();
    await page.goto("/v5/projects");
    await expect(page).toHaveURL(/\/v5\/projects$/);
    await expect(page.locator("button[data-project-id]")).toHaveCount(10);
    await expect(page.locator('button[data-project-id="wolt_new_city"]')).toHaveCount(0);
  });

  test("V5 storage never touches V4, and restart clears only V5", async ({ page }) => {
    await page.goto("/v4/projects");
    await page.locator('button[data-project-id="wolt_new_city"]').click();
    const v4Before = await stored(page, V4_KEY);
    expect(v4Before).toMatchObject({ flow: "v4", selectedIds: ["wolt_new_city"] });

    await startV5(page, "projects", ["accounting_gap"]);
    expect(await stored(page, V5_KEY)).toMatchObject({ flow: "v5", selectedIds: ["accounting_gap"] });
    expect(await stored(page, V4_KEY)).toEqual(v4Before);

    await page.getByRole("button", { name: "התחלה מחדש" }).click();
    await expect(page).toHaveURL(/\/v5$/);
    expect(await stored(page, V5_KEY)).toBeNull();
    expect(await stored(page, V4_KEY)).toEqual(v4Before);
  });
});

test.describe("V5 result and lead", () => {
  test("a V5 projects lead and a V5 worlds lead carry flow_version v5, the entry mode and one id list", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "recommended");
    await fillLead(page);
    await v4LeadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v5",
      entry_mode: "projects",
      selected_project_ids: ["accounting_gap"],
      selected_world_ids: [],
    });

    await resetV5(page);
    await reachV5WorldResult(page, v3Persona("law"));
    await fillLead(page);
    await v4LeadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[1]!.body).toMatchObject({
      flow_version: "v5",
      entry_mode: "worlds",
      selected_world_ids: ["law_justice"],
      selected_project_ids: [],
    });
    for (const event of await dataLayer(page)) expect(JSON.stringify(event)).not.toContain(LEAD_PII.first);
  });

  test("every journey event carries flow_version v5 and entry_mode", async ({ page }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.nearTie);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "near_tie");
    // Pre-journey events (no mode exists yet): the landing view / start / method view, and landing-screen ui_click
    // (DEC-038). Every other event must carry the entry mode.
    const events = (await dataLayer(page)).filter(
      (e) =>
        !["studymatch_landing_view", "studymatch_start", "discovery_method_view"].includes(String(e.event)) &&
        !(e.event === "ui_click" && e.screen_id === "landing"),
    );
    expect(events.length).toBeGreaterThan(5);
    for (const event of events)
      expect(event, String(event.event)).toMatchObject({ flow_version: "v5", entry_mode: "projects" });
    expect(events.some((e) => e.event === "studymatch_result_view")).toBe(true);
  });

  test("an insufficient-evidence result uses the same redesigned result", async ({ page }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.insufficient);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "insufficient_positive_evidence");
    await expect(page.getByTestId("hero-try-again")).toBeVisible();
  });
});

test.describe("V5 gender-inclusive copy (DEC-036 inherited)", () => {
  async function scanJourney(
    page: Page,
    mode: "worlds" | "projects",
    ids: string[],
    choose: Parameters<typeof answerUntilV5Result>[1],
  ) {
    const found: string[] = [];
    const scan = async (where: string) => {
      for (const hit of await v5MasculineOnScreen(page)) found.push(`${where}: ${hit}`);
    };
    await mockLeadApi(page);
    await openV5(page);
    await scan("landing");
    await page.getByTestId("landing-cta").click();
    await expect(page.getByTestId("v4-method")).toBeVisible();
    await scan("method");
    await methodOption(page, mode).click();
    await expect(page.locator("button[data-entry-id]").first()).toBeVisible();
    await scan("discovery");
    await selectEntries(page, ids);
    await page.getByTestId("discover-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    await scan("transition");
    await page.getByTestId("transition-cta").click();
    await answerUntilV5Result(page, choose, async (id) => scan(`question ${id}`));
    await scan("result");
    await v4LeadSubmit(page).click();
    await scan("lead validation");
    await fillLead(page);
    await v4LeadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await scan("lead success");
    return found;
  }

  test("projects journey (Spotify + People/HR, into V1 Tech): every screen is inclusive", async ({ page }) => {
    expect(
      await scanJourney(
        page,
        "projects",
        ["people_retention", "spotify_discovery"],
        (_id, offered, turn) => offered[turn % offered.length]!,
      ),
    ).toEqual([]);
  });

  test("projects journey (Law near tie): every screen is inclusive", async ({ page }) => {
    expect(
      await scanJourney(page, "projects", [...V5_PATHS_TO.nearTie.ids], scripted(V5_PATHS_TO.nearTie.script)),
    ).toEqual([]);
  });

  test("worlds journey: every screen is inclusive", async ({ page }) => {
    const persona = v3Persona("hr_systems");
    expect(
      await scanJourney(page, "worlds", persona.worlds, (id, offered) => v3PersonaChoice(persona, id, offered)),
    ).toEqual([]);
  });

  test("V4 keeps its own copy and projects; V5's project headline never leaks into /v4", async ({ page }) => {
    await page.goto("/v4/projects");
    await expect(page.locator("h1")).toHaveText("לאיזה פרויקט היית הכי רוצה להצטרף?");
  });
});

test("the V5 question screen keeps explicit select + Continue", async ({ page }) => {
  await startV5(page, "projects", ["apple_store_space"]);
  expect(await v5OptionIds(page)).toEqual(["A", "B", "C"]);
  await expect(page.getByTestId("question-continue")).toBeDisabled();
});
