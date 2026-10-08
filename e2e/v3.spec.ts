import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { V3_PERSONAS, v3PersonaChoice } from "../tests/flow/v3Personas";
import { dataLayer, openDiscovery, runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";
import { LEAD_PII, fillLead, leadField, leadForm, leadSubmit, mockLeadApi } from "./leadHelpers";
import {
  V2_KEY,
  V3_KEY,
  chooseAndContinue,
  enterDiscovery,
  openLanding,
  optionLabel,
  reachTransition,
  reachV3Result,
  runPersonaV3,
  selectWorlds,
  startV3,
  storedValue,
  v3Cards,
  v3OptionIds,
  v3QuestionId,
  v3Result,
  worldCard,
} from "./v3Helpers";

/**
 * V3 acceptance: the WORLD-LED discovery experiment with the redesigned UX (landing, worlds, transition, explicit
 * Continue, progress transparency, the redesigned result, the lead flow) and its isolation from the frozen, BRAND-LED
 * V2. Both versions run on the same engine.
 */

const ALL_PROGRAMS_URL = "https://www.colman.ac.il/academics/ba/";
const BRANDS = /Spotify|Wolt|TikTok|Nike|Duolingo|Apple|ספוטיפיי/;
const WORLD_TITLES = [
  "טכנולוגיה ודאטה",
  "עסקים ושווקים",
  "תקשורת והשפעה",
  "אנשים ופסיכולוגיה",
  "אנשים בארגונים",
  "חינוך ודור העתיד",
  "משפט וצדק",
  "כסף וחשבונאות",
  "עיצוב וחללים",
];
const persona = (id: string) => V3_PERSONAS.find((p) => p.id === id)!;
const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);

test.describe("landing", () => {
  test("is the first screen: official logo, headline, expectations, CTA and the variable-length note", async ({
    page,
  }) => {
    await openLanding(page);
    await expect(page.locator("h1")).toHaveText("איזה תחום לימודים יכול להתאים לכם?");
    for (const line of ["כ־3–5 דקות", "לא צריך לדעת מראש מה ללמוד", "בסוף תקבלו כיוון ומסלול שכדאי להכיר"]) {
      await expect(page.getByText(line)).toBeVisible();
    }
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    await expect(page.getByText("מספר השאלות משתנה מעט לפי התשובות שלכם.")).toBeVisible();
    await expect(v3Cards(page)).toHaveCount(0);
  });

  test("uses the locally stored official logo (same origin, loaded, never hotlinked)", async ({ page }) => {
    await openLanding(page);
    const logo = page.getByTestId("v3-landing").getByRole("img", { name: "המכללה למינהל" });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const sources = await page
      .locator("img")
      .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).currentSrc));
    for (const src of sources) expect(new URL(src).origin).toBe(new URL(page.url()).origin);
  });

  test("the CTA leads to world discovery and reports the landing events", async ({ page }) => {
    await enterDiscovery(page);
    await expect(page).toHaveURL(/\/v3\/worlds$/);
    expect((await eventsOf(page, "studymatch_landing_view")).map((e) => e.flow_version)).toEqual(["v3"]);
    expect((await eventsOf(page, "studymatch_start")).map((e) => e.flow_version)).toEqual(["v3"]);
  });
});

test.describe("world discovery", () => {
  test("shows the nine working worlds with their context line, and none of V2's brand projects", async ({ page }) => {
    await enterDiscovery(page);
    await expect(page.locator("h1")).toHaveText("איזה מעולמות העשייה האלה הכי מסקרן אתכם?");
    await expect(page.getByText("בחרו עד שניים. לא צריך לדעת איזה תואר מוביל לשם.")).toBeVisible();
    await expect(v3Cards(page)).toHaveCount(9);
    await expect(page.locator("[data-world-title]")).toHaveText(WORLD_TITLES);
    await expect(worldCard(page, "people_organizations").locator("[data-world-context]")).toHaveText(
      "מחלקת People / HR",
    );
    // World-led, not brand-led: no brand cards, names, icons, logos or company disclaimer.
    await expect(page.locator("button[data-project-id]")).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(BRANDS);
    await expect(page.locator("button[data-entry-id] svg, main img")).toHaveCount(0);
    await expect(page.getByText("שמות החברות מופיעים לצורך המחשה בלבד")).toHaveCount(0);
    // Consistent typography on every card.
    const styles = await page
      .locator("[data-world-title]")
      .evaluateAll((els) => els.map((el) => `${getComputedStyle(el).fontSize}|${getComputedStyle(el).fontWeight}`));
    expect(new Set(styles).size).toBe(1);
  });

  test("select one, select two (selection order kept), and a third is refused with an announced explanation", async ({
    page,
  }) => {
    await enterDiscovery(page);
    const next = page.getByTestId("discover-continue");
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 0 מתוך 2");
    await expect(next).toBeDisabled();
    await selectWorlds(page, ["law_justice"]);
    await expect(next).toBeEnabled();
    await selectWorlds(page, ["business_markets"]);
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 2 מתוך 2");
    expect(await storedValue(page, V3_KEY)).toMatchObject({
      version: 2,
      flow: "v3",
      strategy: "worlds",
      phase: "selecting",
      selectedIds: ["law_justice", "business_markets"], // the candidate's order, not display order
    });

    const third = worldCard(page, "design_spaces");
    await expect(third).not.toHaveAttribute("aria-disabled", "true");
    await third.click();
    const message = page.getByTestId("limit-message");
    await expect(message).toHaveText("אפשר לבחור עד שני עולמות. בטלו בחירה אחת כדי לבחור עולם אחר.");
    await expect(message).toHaveAttribute("aria-live", "polite");
    await expect(third).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);

    await worldCard(page, "law_justice").click();
    await expect(message).toHaveText("");
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
  });

  test("the sticky action bar never covers a card", async ({ page }) => {
    await enterDiscovery(page);
    await selectWorlds(page, ["education_future"]);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = (await page.getByTestId("sticky-bar").boundingBox())!;
    const last = (await v3Cards(page).last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
    await expect(page.getByTestId("discover-continue")).toHaveText("בואו נמשיך");
  });

  test("world selection events are V3 world events only (never career_project_*)", async ({ page }) => {
    await enterDiscovery(page);
    await selectWorlds(page, ["law_justice", "business_markets"]);
    await worldCard(page, "law_justice").click();
    await page.getByTestId("discover-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    const names = (await dataLayer(page)).map((e) => String(e.event));
    expect(names.filter((n) => n.startsWith("career_project_"))).toEqual([]);
    expect((await eventsOf(page, "career_world_selected")).map((e) => e.world_id)).toEqual([
      "law_justice",
      "business_markets",
    ]);
    expect((await eventsOf(page, "career_world_deselected")).map((e) => e.world_id)).toEqual(["law_justice"]);
    expect(await eventsOf(page, "career_world_selection_completed")).toMatchObject([
      { flow_version: "v3", world_ids: "business_markets", selected_world_count: 1 },
    ]);
    expect(await eventsOf(page, "career_world_discovery_view")).toMatchObject([
      { flow_version: "v3", world_count_available: 9 },
    ]);
  });
});

test.describe("transition and questions", () => {
  test("a transition screen explains the questions before the first one", async ({ page }) => {
    await reachTransition(page, ["law_justice"]);
    await expect(page).toHaveURL(/\/v3\/ready$/);
    await expect(page.locator("h1")).toHaveText("מעולה, עכשיו נחדד את הכיוון");
    await page.getByTestId("transition-cta").click();
    await expect(page).toHaveURL(/\/v3\/questions$/);
  });

  test("the first question is the selected world's own scenario, and two worlds open in selection order", async ({
    page,
  }) => {
    await startV3(page, ["law_justice", "business_markets"]);
    expect(await v3QuestionId(page)).toBe("WL1");
    await expect(page.locator("h1")).toHaveText("יש מחלוקת גדולה בין חברה ללקוחות שלה. איפה הייתם רוצים להיכנס?");
    await chooseAndContinue(page, "A");
    expect(await v3QuestionId(page)).toBe("WB1");
  });

  test("tapping an option only selects it; only Continue commits, and a changed mind is never double counted", async ({
    page,
  }) => {
    await startV3(page, ["design_spaces"]);
    const first = (await v3QuestionId(page))!;
    const next = page.getByTestId("question-continue");
    await expect(next).toBeDisabled();
    await optionLabel(page, "A").click();
    await expect(next).toBeEnabled();
    await page.waitForTimeout(500);
    expect(await v3QuestionId(page)).toBe(first);
    await optionLabel(page, "B").click();
    await expect(page.locator('input[data-option-id="A"]')).not.toBeChecked();
    expect(await eventsOf(page, "question_answer")).toHaveLength(0);
    await next.click();
    await expect.poll(() => v3QuestionId(page)).not.toBe(first);
    const answers = await eventsOf(page, "question_answer");
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ question_id: "WD1", answer_id: "B", flow_version: "v3" });
    expect(await eventsOf(page, "question_continue")).toHaveLength(1);
  });

  test("a double press of Continue records one answer", async ({ page }) => {
    await startV3(page, ["finance_accounting"]);
    await optionLabel(page, "A").click();
    await page.getByTestId("question-continue").dblclick();
    await expect.poll(() => v3QuestionId(page)).not.toBe("WF1");
    expect((await storedValue(page, V3_KEY)).answers).toHaveLength(1);
  });

  test("a generated focus question also uses the explicit Continue", async ({ page }) => {
    const p = persona("communication_then_people");
    await startV3(page, p.worlds);
    await chooseAndContinue(page, "A");
    await chooseAndContinue(page, "A");
    const id = (await v3QuestionId(page))!;
    expect(id.startsWith("focus:")).toBe(true);
    await optionLabel(page, (await v3OptionIds(page))[0]!).click();
    expect(await v3QuestionId(page)).toBe(id);
  });

  test("Technology & Data hands over to the V1 Tech module without ever asking V1 Q1 or naming a brand", async ({
    page,
  }) => {
    const asked = await reachV3Result(page, persona("tech_build"));
    expect(asked[0]).toBe("WT1");
    expect(asked[1]).toBe("Q2");
    expect(asked).not.toContain("Q1");
    expect(await eventsOf(page, "precision_module_handoff")).toMatchObject([
      { flow_version: "v3", module_id: "v1_tech", seeded_answer_count: 1 },
    ]);
    await expect(page.getByTestId("result-program-name")).toHaveText("מדעי המחשב");
  });

  test("progress is the stage out of three plus a deterministic tone, never a question count", async ({ page }) => {
    const p = persona("business_markets_tie");
    await startV3(page, p.worlds);
    const tones: string[] = [];
    for (let guard = 0; guard < 8; guard++) {
      await page.locator('section[data-question-id], [data-result-flow="v3"]').first().waitFor();
      if ((await v3Result(page).count()) > 0) break;
      await expect(page.getByTestId("progress-stage")).toHaveText("שלב 2 מתוך 3");
      tones.push((await page.getByTestId("progress-tone").getAttribute("data-tone"))!);
      const id = (await v3QuestionId(page))!;
      await chooseAndContinue(page, v3PersonaChoice(p, id, await v3OptionIds(page)));
    }
    expect(tones.slice(0, 4)).toEqual(["early", "early", "middle", "middle"]);
    expect(tones.at(-1)).toBe("late");
    await expect(page.getByTestId("progress-tone")).toHaveCount(0);
  });
});

test.describe("result", () => {
  test("recommendation: hero first, immediate actions, short why, a COLMAN section, collapsed detail, escape, form, all programs", async ({
    page,
  }) => {
    await mockLeadApi(page);
    await reachV3Result(page, persona("accounting"));
    await expect(page.getByTestId("result-hero")).toContainText("הכיוון שהכי מתאים לכם");
    await expect(page.getByTestId("result-program-name")).toHaveText("חשבונאות");
    const order = await page.evaluate(() => {
      const y = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? NaN;
      return [
        "result-hero",
        "hero-actions",
        "why",
        "colman-section",
        "details",
        "not-right",
        "lead-anchor",
        "all-programs",
      ].map(y);
    });
    for (const value of order) expect(Number.isNaN(value)).toBe(false);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const colman = page.getByTestId("colman-section");
    await expect(colman.getByRole("img", { name: "המכללה למינהל" })).toBeVisible();
    await expect(colman.getByRole("heading", { name: "לאיזה סוג עשייה המסלול מתחבר?" })).toBeVisible();
    expect(await page.getByTestId("all-programs").getAttribute("href")).toBe(ALL_PROGRAMS_URL);
  });

  test("no V3 result text refers to brands, companies or projects; the detail speaks about the candidate's choices", async ({
    page,
  }) => {
    await reachV3Result(page, persona("accounting"));
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(/פרויקט|שמות החברות/);
    const detail = page.locator('details[data-detail-id="why_result"]');
    await detail.locator("summary").click();
    await expect(detail).toContainText("אלה הבחירות שעזרו לנו להבין את הכיוון שלכם");
    await expect(detail).toContainText("להיכנס לדוחות ולמצוא בדיוק את הפער"); // the world answer, in the detail only
    const outside = await page.evaluate(() => {
      const clone = document.querySelector("main")!.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("details, form").forEach((el) => el.remove());
      return clone.innerText;
    });
    expect(outside).not.toContain("להיכנס לדוחות ולמצוא בדיוק את הפער");
  });

  test("the Tech result detail shows the candidate's own world answer, not the V1 brand scenario", async ({ page }) => {
    await reachV3Result(page, persona("tech_build"));
    const detail = page.locator('details[data-detail-id="why_result"]');
    await detail.locator("summary").click();
    await expect(detail).toContainText("לבנות או לתקן את הפיצ'ר והמערכת");
    expect(await page.locator("main").innerText()).not.toMatch(/פרויקט|ספוטיפיי|Spotify/);
  });

  test("near tie shows both programs with a curated 'what is the difference' block", async ({ page }) => {
    await reachV3Result(page, persona("communication_tie"));
    await expect(page.locator("h1")).toHaveText("נראה שיש לכם שני כיוונים חזקים");
    await expect(page.getByTestId("pair-difference")).toHaveAttribute("data-pair-curated", "true");
    await expect(page.getByTestId("pair-guidance")).toContainText("אם מושך אתכם בעיקר ליצור ולהשפיע דרך תוכן");
  });

  test("insufficient evidence is supportive and Try again returns to the landing with V3 state cleared", async ({
    page,
  }) => {
    await reachV3Result(page, persona("insufficient"));
    await expect(page.locator("h1")).toHaveText("לא קיבלנו עדיין כיוון מספיק ברור");
    await page.getByTestId("hero-try-again").click();
    await expect(page).toHaveURL(/\/v3$/);
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });

  test("the sticky contact button scrolls to and focuses the form", async ({ page }) => {
    await reachV3Result(page, persona("law"));
    await page.getByTestId("sticky-contact").click();
    await expect(leadField(page, "first_name")).toBeFocused();
    expect((await eventsOf(page, "result_contact_click")).at(-1)).toMatchObject({
      cta_position: "sticky",
      flow_version: "v3",
    });
  });
});

test.describe("lead", () => {
  test("a V3 lead sends flow_version v3 and selected_world_ids (never world ids as projects), keeping PII out of analytics", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    await reachV3Result(page, persona("communication_then_people"));
    await expect(leadForm(page).getByLabel("שם פרטי")).toHaveAttribute("placeholder", "לדוגמה: דנה");
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v3",
      selected_project_ids: [],
      selected_world_ids: ["communication_influence", "people_psychology"],
      comparison_id: (await eventsOf(page, "studymatch_result_view"))[0]!.comparison_id,
    });
    for (const event of await dataLayer(page)) {
      expect(event.flow_version, String(event.event)).toBe("v3");
      expect(JSON.stringify(event)).not.toContain(LEAD_PII.first);
      expect(JSON.stringify(event)).not.toContain(LEAD_PII.phoneLocal);
    }
  });
});

test.describe("persistence, Back and restart", () => {
  test("refresh keeps the world selection, the question and the result; Back removes one committed answer", async ({
    page,
  }) => {
    const p = persona("design");
    await startV3(page, p.worlds);
    await chooseAndContinue(page, "A");
    const second = (await v3QuestionId(page))!;
    await page.reload();
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    expect(await v3QuestionId(page)).toBe(second);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect.poll(() => v3QuestionId(page)).toBe("WD1");
    await runPersonaV3(page, p);
    await page.reload();
    await expect(v3Result(page)).toBeVisible();
  });

  test("Back from the first question returns to the worlds with the selection kept", async ({ page }) => {
    await startV3(page, ["education_future"]);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v3\/worlds$/);
    await expect(worldCard(page, "education_future")).toHaveAttribute("aria-pressed", "true");
  });

  test("an old version-1 (brand-led) V3 payload fails safely and restarts at the landing", async ({ page }) => {
    await page.goto("/v3");
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          flow: "v3",
          phase: "answering",
          selectedProjectIds: ["wolt_new_city"],
          answers: [{ questionId: "B1", answerId: "A" }],
        }),
      );
    }, V3_KEY);
    await page.goto("/v3/questions");
    await expect(page).toHaveURL(/\/v3$/);
    expect(await storedValue(page, V3_KEY)).toBeNull();
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
  });

  test("deep links without a journey go to the landing", async ({ page }) => {
    await page.goto("/v3/result");
    await expect(page).toHaveURL(/\/v3$/);
    await page.goto("/v3/ready");
    await expect(page).toHaveURL(/\/v3$/);
  });
});

test.describe("V2 is brand-led, V3 is world-led, and they are isolated", () => {
  test("V2 still shows the brand projects; V3 shows the worlds", async ({ page }) => {
    await openDiscovery(page);
    await expect(page.locator("button[data-project-id]")).toHaveCount(7);
    await expect(page.locator('button[data-project-id="spotify_discover_weekly"]')).toContainText("Spotify");
    await expect(page.locator('button[data-project-id="wolt_new_city"]')).toContainText("Wolt");
    await expect(page.locator("button[data-world-id]")).toHaveCount(0);

    await enterDiscovery(page);
    await expect(page.locator("button[data-world-id]")).toHaveCount(9);
    await expect(page.locator("button[data-project-id]")).toHaveCount(0);
  });

  test("V2 and V3 storage never affect each other, and restarting V3 leaves V2 alone", async ({ page }) => {
    await startDiscovery(page, ["wolt_new_city"]);
    const v2Before = await storedValue(page, V2_KEY);
    expect(v2Before).toMatchObject({ flow: "v2", phase: "answering", selectedProjectIds: ["wolt_new_city"] });
    await openLanding(page);
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    await reachV3Result(page, persona("law"));
    expect(await storedValue(page, V3_KEY)).toMatchObject({ flow: "v3", strategy: "worlds" });
    expect(await storedValue(page, V2_KEY)).toEqual(v2Before);
    await page.getByTestId("try-again").click();
    expect(await storedValue(page, V3_KEY)).toBeNull();
    expect(await storedValue(page, V2_KEY)).toEqual(v2Before);
    await page.goto("/v2/questions");
    await expect(page.locator("[data-question-id]")).toBeVisible();
  });

  test("V2 still emits its brand project events with flow_version v2 (unchanged)", async ({ page }) => {
    const p = V2_PERSONAS.find((candidate) => candidate.id === "accounting")!;
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const events = await dataLayer(page);
    expect(events.some((e) => e.event === "career_project_selected" && e.project_id === "wolt_new_city")).toBe(true);
    expect(events.some((e) => String(e.event).startsWith("career_world_"))).toBe(false);
    for (const event of events) expect(event.flow_version, String(event.event)).toBe("v2");
  });
});
