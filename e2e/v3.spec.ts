import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS, personaChoice } from "../tests/flow/v2Personas";
import { dataLayer, startDiscovery, runPersonaInBrowser } from "./discoveryHelpers";
import { LEAD_PII, fillLead, leadField, leadForm, leadSubmit, mockLeadApi } from "./leadHelpers";
import {
  V2_KEY,
  V3_KEY,
  chooseAndContinue,
  enterProjects,
  openLanding,
  optionLabel,
  reachTransition,
  reachV3Result,
  runPersonaV3,
  selectV3Projects,
  startV3,
  storedValue,
  v3Cards,
  v3OptionIds,
  v3QuestionId,
  v3Result,
} from "./v3Helpers";

/**
 * V3 (UX redesign) acceptance: landing, discovery, transition, explicit Continue, progress transparency, the
 * redesigned result, the lead flow and version isolation from V2. The same engine drives both versions, so the same
 * persona must reach the same outcome in V3 as in V2.
 */

const WOLT = "wolt_new_city";
const NIKE = "nike_israel_launch";
const TIKTOK = "tiktok_endless_scroll";
const AI = "ai_feature_privacy";
const SPOTIFY = "spotify_discover_weekly";
const ALL_PROGRAMS_URL = "https://www.colman.ac.il/academics/ba/";
const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;
const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);

test.describe("landing", () => {
  test("is the first screen: official logo, headline, expectations, CTA and the variable-length note", async ({
    page,
  }) => {
    await openLanding(page);
    await expect(page.locator("h1")).toHaveText("איזה תחום לימודים יכול להתאים לכם?");
    await expect(
      page.getByText("כמה שאלות קצרות על מה שמעניין אתכם לעשות, ואנחנו נעזור לכם לצמצם את האפשרויות."),
    ).toBeVisible();
    for (const line of ["כ־3–5 דקות", "לא צריך לדעת מראש מה ללמוד", "בסוף תקבלו כיוון ומסלול שכדאי להכיר"]) {
      await expect(page.getByText(line)).toBeVisible();
    }
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    await expect(page.getByText("מספר השאלות משתנה מעט לפי התשובות שלכם.")).toBeVisible();
    // No project cards yet.
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
    const asset = await page.request.get("/brand/colman-logo.webp");
    expect(asset.status()).toBe(200);
  });

  test("the CTA leads to project discovery and reports the landing events", async ({ page }) => {
    await enterProjects(page);
    await expect(page).toHaveURL(/\/v3\/projects$/);
    expect((await eventsOf(page, "studymatch_landing_view")).map((e) => e.flow_version)).toEqual(["v3"]);
    expect((await eventsOf(page, "studymatch_start")).map((e) => e.flow_version)).toEqual(["v3"]);
  });
});

test.describe("discovery", () => {
  test("shows the new copy, text-only cards (no icons or logos) and a consistent company label", async ({ page }) => {
    await enterProjects(page);
    await expect(page.locator("h1")).toHaveText("באיזה פרויקט הייתם הכי רוצים להשתתף?");
    await expect(page.getByText("בחרו עד שניים שהכי מסקרנים אתכם. אין תשובה נכונה.")).toBeVisible();
    await expect(v3Cards(page)).toHaveCount(7);
    // No icons: an unselected card contains no svg and no image.
    await expect(page.locator("button[data-project-id] svg, button[data-project-id] img")).toHaveCount(0);
    await expect(page.locator("main img")).toHaveCount(0);

    const labels = page.locator("[data-company-label]");
    await expect(labels).toHaveCount(7);
    const styles = await labels.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return `${s.fontSize}|${s.fontWeight}|${s.letterSpacing}`;
      }),
    );
    expect(new Set(styles).size).toBe(1);
    // The synthetic AI project is labelled exactly "AI".
    await expect(page.locator(`button[data-project-id="${AI}"] [data-company-label]`)).toHaveText("AI");
    // The disclaimer sits below the cards.
    const disclaimerY = (await page.getByText("שמות החברות מופיעים לצורך המחשה בלבד").boundingBox())!.y;
    const lastCardY = (await v3Cards(page).last().boundingBox())!.y;
    expect(disclaimerY).toBeGreaterThan(lastCardY);
  });

  test("a third selection is refused with an announced explanation; the two selected stay", async ({ page }) => {
    await enterProjects(page);
    await selectV3Projects(page, [WOLT, NIKE]);
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 2 מתוך 2");
    const third = page.locator(`button[data-project-id="${TIKTOK}"]`);
    // Not silently greyed out: the card is a normal, enabled button.
    await expect(third).not.toHaveAttribute("aria-disabled", "true");
    await third.click();
    const message = page.getByTestId("limit-message");
    await expect(message).toHaveText("אפשר לבחור עד שני פרויקטים. בטלו בחירה אחת כדי לבחור אחרת.");
    await expect(message).toHaveAttribute("aria-live", "polite");
    await expect(message).toHaveAttribute("role", "status");
    await expect(third).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);

    // Deselecting one clears the message and lets another be chosen.
    await page.locator(`button[data-project-id="${WOLT}"]`).click();
    await expect(message).toHaveText("");
    await third.click();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);
    // Still selecting: only the (valid) selection is stored, never more than two projects and no answers.
    expect(await storedValue(page, V3_KEY)).toMatchObject({
      flow: "v3",
      phase: "selecting",
      selectedProjectIds: [NIKE, TIKTOK],
      answers: [],
    });
  });

  test("a persistent bottom bar shows the count and enables Continue for one or two projects without covering content", async ({
    page,
  }) => {
    await enterProjects(page);
    const next = page.getByTestId("projects-continue");
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 0 מתוך 2");
    await expect(next).toBeDisabled();
    await expect(next).toHaveText("בואו נמשיך");
    await selectV3Projects(page, [WOLT]);
    await expect(next).toBeEnabled();
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 1 מתוך 2");
    await selectV3Projects(page, [NIKE]);
    await expect(next).toBeEnabled();
    await expect(page.getByTestId("selection-status")).toHaveText("נבחרו 2 מתוך 2");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = (await page.getByTestId("sticky-bar").boundingBox())!;
    const disclaimer = (await page.getByText("שמות החברות מופיעים לצורך המחשה בלבד").boundingBox())!;
    expect(disclaimer.y + disclaimer.height).toBeLessThanOrEqual(bar.y + 1);
    expect(bar.y + bar.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  });
});

test.describe("transition and questions", () => {
  test("a transition screen explains the questions before the first one", async ({ page }) => {
    await reachTransition(page, [WOLT]);
    await expect(page).toHaveURL(/\/v3\/ready$/);
    await expect(page.locator("h1")).toHaveText("מעולה, עכשיו נחדד את הכיוון");
    await expect(
      page.getByText("מכאן בכל שאלה בוחרים אפשרות אחת. השאלות משתנות לפי התשובות שלכם כדי להתמקד במה שרלוונטי לכם."),
    ).toBeVisible();
    await expect(page.getByTestId("transition-cta")).toHaveText("לשאלה הראשונה");
    await page.getByTestId("transition-cta").click();
    await expect(page).toHaveURL(/\/v3\/questions$/);
    await expect(page.locator("section[data-question-id]")).toBeVisible();
  });

  test("tapping an option only selects it; only Continue commits, and a changed mind is never double counted", async ({
    page,
  }) => {
    await startV3(page, [WOLT]);
    const first = (await v3QuestionId(page))!;
    const options = await v3OptionIds(page);
    const next = page.getByTestId("question-continue");
    await expect(next).toBeDisabled();

    await optionLabel(page, options[0]!).click();
    await expect(page.locator(`input[data-option-id="${options[0]}"]`)).toBeChecked();
    await expect(next).toBeEnabled();
    await page.waitForTimeout(500);
    expect(await v3QuestionId(page)).toBe(first); // no auto-advance

    await optionLabel(page, options[1]!).click();
    await expect(page.locator(`input[data-option-id="${options[1]}"]`)).toBeChecked();
    await expect(page.locator(`input[data-option-id="${options[0]}"]`)).not.toBeChecked();
    expect(await v3QuestionId(page)).toBe(first);
    expect(await eventsOf(page, "question_answer")).toHaveLength(0);
    expect(await storedValue(page, V3_KEY)).toMatchObject({ answers: [] });

    await next.click();
    await expect.poll(() => v3QuestionId(page)).not.toBe(first);
    const answers = await eventsOf(page, "question_answer");
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ question_id: first, answer_id: options[1], flow_version: "v3" });
    expect(await eventsOf(page, "question_continue")).toHaveLength(1);
    expect((await storedValue(page, V3_KEY)).answers).toEqual([{ questionId: first, answerId: options[1] }]);
  });

  test("a double press of Continue records one answer", async ({ page }) => {
    await startV3(page, [WOLT]);
    const first = (await v3QuestionId(page))!;
    await optionLabel(page, (await v3OptionIds(page))[0]!).click();
    await page.getByTestId("question-continue").dblclick();
    await expect.poll(() => v3QuestionId(page)).not.toBe(first);
    expect((await storedValue(page, V3_KEY)).answers).toHaveLength(1);
    expect(await eventsOf(page, "question_answer")).toHaveLength(1);
  });

  test("the explicit Continue also applies to generated focus and Tech precision questions", async ({ page }) => {
    // Generated focus (TikTok + Nike reaches a generated question).
    await startV3(page, [TIKTOK, NIKE]);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await page.locator('section[data-question-id], [data-result-flow="v3"]').first().waitFor();
      if ((await v3Result(page).count()) > 0) break;
      const id = (await v3QuestionId(page))!;
      seen.add(id);
      const options = await v3OptionIds(page);
      await optionLabel(page, options[0]!).click();
      expect(await v3QuestionId(page)).toBe(id);
      await chooseAndContinue(page, options[0]!);
    }
    expect([...seen].some((id) => id.startsWith("focus:"))).toBe(true);

    // Tech precision (Spotify alone).
    await page.goto("/v3");
    await page.evaluate(() => localStorage.clear());
    await startV3(page, [SPOTIFY]);
    const id = (await v3QuestionId(page))!;
    const options = await v3OptionIds(page);
    await optionLabel(page, options[0]!).click();
    await page.waitForTimeout(500);
    expect(await v3QuestionId(page)).toBe(id);
    await page.getByTestId("question-continue").click();
    await expect.poll(() => v3QuestionId(page)).not.toBe(id);
  });

  test("progress is the stage out of three plus a deterministic tone, never a question count", async ({ page }) => {
    const p = persona("business_vs_economics");
    await startV3(page, p.projects);
    const tones: string[] = [];
    for (let guard = 0; guard < 8; guard++) {
      if ((await v3Result(page).count()) > 0) break;
      await expect(page.getByTestId("progress-stage")).toHaveText("שלב 2 מתוך 3");
      await expect(page.getByTestId("progress-name")).toHaveText("מדייקים את הכיוון");
      tones.push((await page.getByTestId("progress-tone").getAttribute("data-tone"))!);
      expect(await page.getByTestId("progress").innerText()).not.toMatch(/שאלה \d|מתוך \d+ שאלות/);
      const id = (await v3QuestionId(page))!;
      await chooseAndContinue(page, personaChoice(p, id, await v3OptionIds(page)));
    }
    expect(tones.slice(0, 2)).toEqual(["early", "early"]);
    expect(tones.slice(2, 4)).toEqual(["middle", "middle"]);
    expect(tones.at(-1)).toBe("late");
    await expect(page.getByTestId("progress-stage")).toHaveText("שלב 3 מתוך 3");
  });
});

test.describe("result", () => {
  test("recommendation: hero first, immediate actions, short why, a COLMAN section, collapsed detail, escape, form, all programs", async ({
    page,
  }) => {
    await mockLeadApi(page);
    await reachV3Result(page, persona("accounting"));
    await expect(page.locator("h1")).toHaveCount(1);
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

    // Immediate CTAs: the official program, then contact.
    const actions = page.getByTestId("hero-actions");
    const programLink = actions.locator("a");
    await expect(programLink).toHaveText(/הכירו את המסלול במכללה/);
    expect(await programLink.getAttribute("href")).toMatch(/^https:\/\/www\.(colman|academy)\.(ac|org)\.il\//);
    await expect(actions.getByRole("button", { name: "דברו איתנו על המסלול" })).toBeVisible();

    // Short why: two or three bullets, no echo of the project names.
    const bullets = page.getByTestId("why").locator("li");
    expect(await bullets.count()).toBeGreaterThanOrEqual(2);
    expect(await bullets.count()).toBeLessThanOrEqual(3);
    expect(await page.getByTestId("why").innerText()).not.toMatch(/בחרתם|Wolt|TikTok|Nike|Spotify/);

    // COLMAN section: official logo + CTAs.
    const colman = page.getByTestId("colman-section");
    await expect(colman.getByRole("img", { name: "המכללה למינהל" })).toBeVisible();
    await expect(colman.getByText("מה תמצאו במסלול?")).toBeVisible();
    await expect(colman.locator("a")).toHaveText(/הכירו את המסלול במכללה/);

    // Detail is collapsed; the escape hatch precedes the form.
    await expect(page.locator("details[open]")).toHaveCount(0);
    await expect(page.getByTestId("not-right")).toContainText("זה בסדר. אפשר לחזור ולבדוק כיוון אחר.");
    await expect(page.getByTestId("all-programs")).toHaveText(/לכל תוכניות הלימוד במכללה/);
    expect(await page.getByTestId("all-programs").getAttribute("href")).toBe(ALL_PROGRAMS_URL);
  });

  test("literal project choices appear only inside the collapsed detail, and opening it is reported once", async ({
    page,
  }) => {
    await reachV3Result(page, persona("accounting"));
    const detail = page.locator('details[data-detail-id="why_result"]');
    await detail.locator("summary").click();
    await expect(detail).toHaveAttribute("open", "");
    const chosen = await detail.locator("li").allInnerTexts();
    expect(chosen.length).toBeGreaterThan(0);
    const outside = await page.evaluate(() => {
      const clone = document.querySelector("main")!.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("details, form").forEach((el) => el.remove());
      return clone.innerText;
    });
    for (const text of chosen) expect(outside).not.toContain(text);
    await detail.locator("summary").click(); // close
    await detail.locator("summary").click(); // open again
    const expands = await eventsOf(page, "result_detail_expand");
    expect(expands.length).toBeGreaterThanOrEqual(1);
    expect(expands[0]).toMatchObject({ detail_section: "why_result", flow_version: "v3" });
  });

  test("a materially important warning is never collapsed", async ({ page }) => {
    await reachV3Result(page, persona("accounting"));
    const notes = page.locator('[data-reality-level="negative"]');
    if ((await notes.count()) > 0) {
      await expect(notes.first()).toBeVisible();
      expect(await notes.first().evaluate((el) => !!el.closest("details"))).toBe(false);
    }
    await expect(page.locator('details [data-reality-level="negative"]')).toHaveCount(0);
  });

  test("near tie shows both programs symmetrically with a 'what is the difference' block", async ({ page }) => {
    await reachV3Result(page, persona("business_vs_economics"));
    await expect(page.locator("h1")).toHaveText("נראה שיש לכם שני כיוונים חזקים");
    const pair = page.getByTestId("pair-difference");
    await expect(pair.getByRole("heading", { name: "מה ההבדל ביניהם?" })).toBeVisible();
    await expect(pair).toHaveAttribute("data-pair-curated", "true");
    await expect(pair.locator("[data-direction-id]")).toHaveCount(2);
    await expect(page.getByTestId("pair-guidance")).toContainText("מנהל עסקים");
    await expect(page.getByTestId("pair-guidance")).toContainText("כלכלה וניהול");
    expect(await page.getByTestId("hero-actions").locator("a").count()).toBe(2);
  });

  test("the Communication pair carries the agreed guidance", async ({ page }) => {
    await reachV3Result(page, persona("communication_vs_cm"));
    const guidance = page.getByTestId("pair-guidance");
    await expect(guidance).toContainText("אם מושך אתכם בעיקר ליצור ולהשפיע דרך תוכן");
    await expect(guidance).toContainText("אם מושך אתכם לחבר תקשורת להחלטות ולביצועים של ארגון");
    const pair = page.getByTestId("pair-difference");
    await expect(pair).toContainText("תוכן וסיפור");
    await expect(pair).toContainText("מדידה וקבלת החלטות");
  });

  test("insufficient evidence is supportive, offers Try again first and never invents a recommendation", async ({
    page,
  }) => {
    await reachV3Result(page, persona("insufficient"));
    await expect(page.locator("h1")).toHaveText("לא קיבלנו עדיין כיוון מספיק ברור");
    await expect(page.getByTestId("result-program-name")).toHaveCount(0);
    await expect(page.getByTestId("hero-try-again")).toBeVisible();
    await page.getByTestId("hero-try-again").click();
    await expect(page).toHaveURL(/\/v3$/);
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });

  test("Tech precision is presented through V3 and reaches the engine's program", async ({ page }) => {
    await reachV3Result(page, persona("focused_tech"));
    await expect(page.getByTestId("result-program-name")).toHaveText("מדעי המחשב");
  });

  test("Try again restarts V3 and returns to the landing", async ({ page }) => {
    await reachV3Result(page, persona("accounting"));
    await page.getByTestId("try-again").click();
    await expect(page).toHaveURL(/\/v3$/);
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });

  test("result analytics: program / contact / all-programs clicks are reported with the V3 version and no PII", async ({
    page,
  }) => {
    await reachV3Result(page, persona("accounting"));
    // Do not leave the app: stop the new tab and the navigation.
    await page.route("https://www.colman.ac.il/**", (route) => route.abort());
    await page.route("https://www.academy.org.il/**", (route) => route.abort());
    await page
      .getByTestId("hero-actions")
      .locator("a")
      .evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
    await page.getByTestId("hero-actions").locator("a").click();
    await page.getByTestId("hero-contact").click();
    await page.getByTestId("all-programs").evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
    await page.getByTestId("all-programs").click();
    const program = (await eventsOf(page, "result_program_click"))[0]!;
    expect(program).toMatchObject({
      flow_version: "v3",
      link_role: "primary",
      cta_position: "hero",
      program_id: "accounting",
    });
    expect((await eventsOf(page, "result_contact_click"))[0]).toMatchObject({
      flow_version: "v3",
      cta_position: "hero",
    });
    expect((await eventsOf(page, "result_all_programs_click"))[0]).toMatchObject({ flow_version: "v3" });
  });
});

test.describe("contact CTAs and the lead form", () => {
  test("the contact buttons scroll to the form and focus it; the sticky one steps aside once the form is visible", async ({
    page,
  }) => {
    await reachV3Result(page, persona("accounting"));
    const sticky = page.getByTestId("sticky-contact");
    await expect(sticky).toBeVisible(); // mobile viewport
    await sticky.click();
    await expect(leadField(page, "first_name")).toBeFocused();
    await expect(leadField(page, "first_name")).toBeInViewport();
    await expect(page.getByTestId("sticky-bar").last()).toHaveCSS("visibility", "hidden");
    expect((await eventsOf(page, "result_contact_click")).at(-1)).toMatchObject({ cta_position: "sticky" });
  });

  test("the form has visible labels and example placeholders", async ({ page }) => {
    await reachV3Result(page, persona("accounting"));
    const form = leadForm(page);
    await expect(form.getByLabel("שם פרטי")).toHaveAttribute("placeholder", "לדוגמה: דנה");
    await expect(form.getByLabel("שם משפחה")).toHaveAttribute("placeholder", "לדוגמה: לוי");
    await expect(leadField(page, "phone")).toHaveAttribute("placeholder", "לדוגמה: 050-1234567");
    await expect(leadField(page, "consent")).not.toBeChecked();
    // Validation appears only when needed.
    await expect(form.getByText("נא למלא שם פרטי.")).toHaveCount(0);
    await leadSubmit(page).click();
    await expect(form.getByText("נא למלא שם פרטי.")).toBeVisible();
  });

  test("a V3 lead is sent with flow_version v3, the same API and the journey id, and keeps PII out of analytics", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));
    await reachV3Result(page, persona("tiktok_nike"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured).toHaveLength(1);
    const journeyId = (await eventsOf(page, "studymatch_result_view"))[0]!.comparison_id;
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v3",
      comparison_id: journeyId,
      first_name: LEAD_PII.first,
      consent: true,
    });
    for (const event of await dataLayer(page)) {
      expect(event.flow_version, String(event.event)).toBe("v3");
      expect(JSON.stringify(event)).not.toContain(LEAD_PII.first);
      expect(JSON.stringify(event)).not.toContain(LEAD_PII.phoneLocal);
    }
    for (const value of [LEAD_PII.first, LEAD_PII.last, LEAD_PII.phone, LEAD_PII.phoneLocal]) {
      expect(consoleLines.join("\n")).not.toContain(value);
    }
  });

  test("Tech precision lead carries the V1 best fit as primary", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachV3Result(page, persona("focused_tech"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v3",
      result_kind: "v1_precision_result",
      primary_program_id: "computer_science",
    });
  });
});

test.describe("persistence, Back and restart in V3", () => {
  test("refresh keeps the question and the result; Back removes one committed answer", async ({ page }) => {
    const p = persona("accounting");
    await startV3(page, p.projects);
    const first = (await v3QuestionId(page))!;
    await chooseAndContinue(page, (await v3OptionIds(page))[0]!);
    const second = (await v3QuestionId(page))!;
    await page.reload();
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    expect(await v3QuestionId(page)).toBe(second);

    await page.getByRole("button", { name: "חזרה" }).click();
    await expect.poll(() => v3QuestionId(page)).toBe(first);
    expect((await storedValue(page, V3_KEY)).answers).toHaveLength(0);

    await runPersonaV3(page, p);
    await page.reload();
    await expect(v3Result(page)).toBeVisible();
  });

  test("Back from the first question returns to the projects with the selection kept", async ({ page }) => {
    await startV3(page, [WOLT]);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v3\/projects$/);
    await expect(page.locator(`button[data-project-id="${WOLT}"]`)).toHaveAttribute("aria-pressed", "true");
  });

  test("deep links without a journey go to the start, and a stale payload is cleared", async ({ page }) => {
    await page.goto("/v3/result");
    await expect(page).toHaveURL(/\/v3\/projects$/);
    await page.goto("/v3/questions");
    await expect(page).toHaveURL(/\/v3\/projects$/);
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          '{"version":1,"flow":"v3","phase":"answering","selectedProjectIds":["x"],"answers":[]}',
        ),
      V3_KEY,
    );
    await page.goto("/v3/questions");
    await expect(page).toHaveURL(/\/v3\/projects$/);
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });

  test("a returning candidate can continue or start over from the landing", async ({ page }) => {
    await startV3(page, [WOLT]);
    await chooseAndContinue(page, (await v3OptionIds(page))[0]!);
    await openLanding(page);
    await expect(page.getByTestId("landing-cta")).toHaveText("להמשיך מאיפה שעצרתם");
    await page.getByRole("button", { name: "להתחיל מחדש" }).click();
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });
});

test.describe("V2 and V3 are isolated, on the same engine", () => {
  test("V2 and V3 storage never affect each other, and restarting V3 leaves V2 alone", async ({ page }) => {
    // A V2 journey in progress.
    await startDiscovery(page, [WOLT]);
    const v2Before = await storedValue(page, V2_KEY);
    expect(v2Before).toMatchObject({ flow: "v2", phase: "answering" });
    expect(await storedValue(page, V3_KEY)).toBeNull();

    // V3 does not see it (landing is fresh), and its own journey uses its own key.
    await openLanding(page);
    await expect(page.getByTestId("landing-cta")).toHaveText("בואו נמצא את הכיוון שלכם");
    await reachV3Result(page, persona("accounting"));
    expect(await storedValue(page, V3_KEY)).toMatchObject({ flow: "v3" });
    expect(await storedValue(page, V2_KEY)).toEqual(v2Before);

    // Restarting V3 does not erase V2.
    await page.getByTestId("try-again").click();
    expect(await storedValue(page, V3_KEY)).toBeNull();
    expect(await storedValue(page, V2_KEY)).toEqual(v2Before);

    // And V2 still restores its own question.
    await page.goto("/v2/questions");
    await expect(page.locator("[data-question-id]")).toBeVisible();
  });

  test("a V3 payload is not a V2 journey (and the reverse): each is cleared by its own version only", async ({
    page,
  }) => {
    await page.goto("/v2");
    await page.evaluate(
      ([v2Key, v3Key]) => {
        const payload = (flow: string) =>
          JSON.stringify({ version: 1, flow, phase: "answering", selectedProjectIds: ["wolt_new_city"], answers: [] });
        localStorage.setItem(v2Key as string, payload("v3")); // wrong marker for V2
        localStorage.setItem(v3Key as string, payload("v2")); // wrong marker for V3
      },
      [V2_KEY, V3_KEY],
    );
    await page.goto("/v2/questions");
    await expect(page).toHaveURL(/\/v2$/);
    await page.goto("/v3/questions");
    await expect(page).toHaveURL(/\/v3\/projects$/);
    expect(await storedValue(page, V2_KEY)).toBeNull();
    expect(await storedValue(page, V3_KEY)).toBeNull();
  });

  for (const id of ["accounting", "business_vs_economics", "tiktok_nike", "focused_tech", "insufficient"]) {
    test(`${id}: the same answers give the same outcome in V2 and V3`, async ({ browser }) => {
      const p = persona(id);
      const outcome = async (flow: "v2" | "v3") => {
        const context = await browser.newContext({ locale: "he-IL", viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        if (flow === "v2") {
          await startDiscovery(page, p.projects);
          await runPersonaInBrowser(page, p);
        } else {
          await reachV3Result(page, p);
        }
        const view = (await dataLayer(page)).find((e) => e.event === "studymatch_result_view")!;
        await context.close();
        return {
          kind: view.result_kind,
          recommended: view.recommended_program ?? null,
          alternatives: view.alternative_programs ?? null,
          answers: view.total_answer_count,
          version: view.flow_version,
        };
      };
      const v2 = await outcome("v2");
      const v3 = await outcome("v3");
      expect(v2.version).toBe("v2");
      expect(v3.version).toBe("v3");
      expect({ ...v3, version: "x" }).toEqual({ ...v2, version: "x" });
    });
  }
});
