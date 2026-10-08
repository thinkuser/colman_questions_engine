import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import {
  V2_KEY,
  answerV2,
  dataLayer,
  openDiscovery,
  optionIds,
  personaAnswers,
  projectCards,
  questionIdOf,
  resultRoot,
  runPersonaInBrowser,
  seedJourney,
  selectProjects,
  startDiscovery,
  storedJourney,
} from "./discoveryHelpers";

/**
 * V2 career-project discovery acceptance (THI-16): the real UI against the production build, driven by the same
 * persona data the engine-level test uses. Result assertions look at what a candidate sees (names, kinds, links),
 * never at scores.
 */

const WOLT = "wolt_new_city";
const NIKE = "nike_israel_launch";
const TIKTOK = "tiktok_endless_scroll";
const SPOTIFY = "spotify_discover_weekly";
const AI = "ai_feature_privacy";

const NAMES: Record<string, string> = Object.fromEntries(
  (
    JSON.parse(readFileSync("src/data/content/catalog/programs.json", "utf8")).programs as Array<Record<string, string>>
  ).map((program) => [program.program_id, program.program_name_he]),
);
const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;

test.describe("project selection", () => {
  test("shows the seven career-project cards with the accepted opening copy and brand disclaimer", async ({ page }) => {
    await openDiscovery(page);
    await expect(projectCards(page)).toHaveCount(7);
    await expect(page.locator("h1")).toContainText("אם הייתם יכולים להצטרף מחר לאחד מהפרויקטים האלה");
    await expect(page.getByText("אפשר לבחור עד שניים.")).toBeVisible();
    await expect(page.getByText("שמות החברות מופיעים לצורך המחשה בלבד")).toBeVisible();
    await expect(page.getByRole("button", { name: "בואו נתחיל" })).toBeDisabled();
  });

  test("allows one or two projects, prevents a third, and lets the candidate deselect", async ({ page }) => {
    await openDiscovery(page);
    const start = page.getByRole("button", { name: "בואו נתחיל" });
    await selectProjects(page, [WOLT]);
    await expect(start).toBeEnabled();
    await expect(page.locator(`button[data-project-id="${WOLT}"]`)).toHaveAttribute("aria-pressed", "true");

    await selectProjects(page, [NIKE]);
    await expect(page.getByTestId("selection-status")).toContainText("אפשר לבחור עד שני פרויקטים");
    // A third project is blocked, clearly (aria-disabled), and pressing it changes nothing.
    const third = page.locator(`button[data-project-id="${TIKTOK}"]`);
    await expect(third).toHaveAttribute("aria-disabled", "true");
    await third.click({ force: true });
    await expect(third).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(2);

    await page.locator(`button[data-project-id="${WOLT}"]`).click();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(third).not.toHaveAttribute("aria-disabled", "true");
  });

  test("marks the selected state with text and an icon, not colour alone, and is keyboard operable", async ({
    page,
  }) => {
    await openDiscovery(page);
    const card = page.locator(`button[data-project-id="${WOLT}"]`);
    await card.focus();
    await page.keyboard.press("Space");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toContainText("נבחר");
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "false");
  });

  test("uses no logos or images and implies no partnership", async ({ page }) => {
    await openDiscovery(page);
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(page.locator("main svg[aria-hidden='true']").first()).toBeAttached();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/שותפות רשמית|בשיתוף|חסות של|בחסות/);
  });

  test("does not let the click order change the first question", async ({ page }) => {
    await startDiscovery(page, [NIKE, WOLT]);
    expect(await questionIdOf(page)).toBe("B1");
  });
});

test.describe("acceptance personas", () => {
  for (const p of V2_PERSONAS) {
    test(`${p.id}: ${p.label}`, async ({ page }) => {
      await startDiscovery(page, p.projects);
      const asked = await runPersonaInBrowser(page, p);
      const root = resultRoot(page);
      const main = await page.locator("main").innerText();

      if (p.expect.kind === "precision") {
        // The V1 result page, with V1 kinds; the V1 module's top program is named.
        expect(await root.getAttribute("data-result-flow")).toBeNull();
        expect(main).toContain(NAMES[p.expect.programs[0]!]);
        expect(asked.filter((id) => id === "T1")).toHaveLength(p.projects.length > 1 ? 1 : 0);
        expect(asked.filter((id) => id === "Q1")).toHaveLength(p.projects.length > 1 ? 0 : 1);
      } else {
        await expect(root).toHaveAttribute("data-result-kind", p.expect.kind);
        await expect(root).toHaveAttribute("data-result-flow", "v2");
        const directions = await page
          .locator("[data-direction-id]")
          .evaluateAll((els) => els.map((el) => el.getAttribute("data-direction-id")));
        // Near tie and insufficient list directions by card; a recommendation names the primary in the hero.
        if (p.expect.kind === "recommended") {
          await expect(page.locator("h1")).toContainText(NAMES[p.expect.programs[0]!]!);
          expect(directions).toEqual(p.expect.programs.slice(1));
        } else {
          expect(directions).toEqual(p.expect.programs);
        }
        expect(main).not.toMatch(/%|ציון|ניקוד/);
        await expect(page.locator("[data-reality-level]")).toHaveCount(p.expect.realityChecks.length);
        // Explore links point at official college / academy pages; no logos anywhere.
        const hrefs = await page
          .locator("a[data-link-role]")
          .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
        for (const href of hrefs) expect(new URL(href).hostname).toMatch(/(^|\.)(colman\.ac\.il|academy\.org\.il)$/);
      }
      await expect(page.locator("main img")).toHaveCount(0);
      expect(asked.length).toBeGreaterThan(0);
    });
  }

  test("a near tie is symmetric: both directions, no winner wording, a link to each", async ({ page }) => {
    const p = persona("business_vs_economics");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    await expect(page.locator("h1")).toContainText("שני כיוונים חזקים");
    await expect(page.locator("[data-direction-id]")).toHaveCount(2);
    await expect(page.locator('a[data-link-role="peer"]')).toHaveCount(2);
    const main = await page.locator("main").innerText();
    expect(main).toContain(NAMES.business_administration);
    expect(main).toContain(NAMES.economics_and_management);
    expect(main).not.toMatch(/הכיוון שהכי בולט אצלכם|ההתאמה הטובה ביותר/);
  });

  test("insufficient positive evidence makes no recommendation and offers a restart", async ({ page }) => {
    const p = persona("insufficient");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    await expect(page.locator("h1")).toContainText("לא קיבלנו עדיין כיוון מספיק ברור");
    const main = await page.locator("main").innerText();
    expect(main).not.toContain("הכיוון שהכי בולט אצלכם");
    expect(main).toContain("כיוון שכדאי לבדוק");
    await expect(page.getByRole("button", { name: "לבחירת פרויקטים אחרים" })).toBeVisible();
  });

  test("a negative reality check is a calm note and does not change the recommendation", async ({ page }) => {
    const p = persona("accounting");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const reality = page.locator("[data-reality-level]");
    await expect(reality).toHaveAttribute("data-reality-level", "negative");
    await expect(reality).toContainText("נקודה שכדאי לקחת בחשבון");
    await expect(reality).toContainText("זה לא פוסל את הכיוון");
    await expect(page.locator("h1")).toContainText(NAMES.accounting!);
  });

  test("the generated focus question compares work statements and offers the neutral option", async ({ page }) => {
    await startDiscovery(page, [TIKTOK, NIKE]);
    await answerV2(page, "B"); // P1: Behavioral Science
    await answerV2(page, "B"); // C1: Communication + Management
    expect(await questionIdOf(page)).toBe("focus:behavioral_science|communication_and_management:0");
    expect(await optionIds(page)).toEqual(["A", "B", "neither"]);
    await expect(page.locator("h1")).toContainText("איזה יום עבודה נשמע לכם הכי מעניין?");
    await expect(page.locator('button[data-option-id="neither"]')).toContainText("אף אחת מהאפשרויות לא ממש מושכת אותי");
  });
});

test.describe("Tech handoff", () => {
  test("Spotify alone: V1 asks its own Q1 exactly once, then its own flow", async ({ page }) => {
    await startDiscovery(page, [SPOTIFY]);
    expect(await questionIdOf(page)).toBe("Q1");
    await answerV2(page, "A");
    expect(await questionIdOf(page)).toBe("Q2");
    await page.getByRole("button", { name: "חזרה" }).click();
    expect(await questionIdOf(page)).toBe("Q1"); // Back replays; Q1 is still asked once at a time
  });

  test("Spotify + another project asks T1 once and V1 continues at Q2 without repeating Q1", async ({ page }) => {
    const p = persona("tech_cross_cluster");
    await startDiscovery(page, p.projects);
    const asked = await runPersonaInBrowser(page, p);
    expect(asked[0]).toBe("T1");
    expect(asked).not.toContain("Q1");
    expect(asked).toContain("Q2");
    expect(asked.indexOf("Q2")).toBeGreaterThan(asked.indexOf("T1"));
  });

  test("the longest Tech cross-cluster path is 11 answers (flagged for product review)", async ({ page }) => {
    const p = persona("tech_cross_cluster_longest");
    await startDiscovery(page, p.projects);
    const asked = await runPersonaInBrowser(page, p);
    expect(asked).toHaveLength(11);
    expect(asked).not.toContain("Q1");
  });
});

test.describe("neutral option, Back, refresh and restart", () => {
  test("a neutral authored answer adds no signal and the flow continues", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A"); // B1: Business Administration
    expect(await questionIdOf(page)).toBe("B2");
    await expect(page.locator('button[data-option-id="neither"]')).toContainText("אף אחת מהאפשרויות לא ממש מושכת אותי");
    await answerV2(page, "neither");
    expect(await questionIdOf(page)).toBe("B3");
    const stored = await storedJourney(page);
    expect(stored.answers).toEqual([
      { questionId: "B1", answerId: "A" },
      { questionId: "B2", answerId: "neither" },
    ]);
  });

  test("opening scenarios offer no neutral option", async ({ page }) => {
    for (const [project, opener] of [
      [WOLT, "B1"],
      [AI, "L1"],
      [NIKE, "C1"],
    ] as const) {
      await startDiscovery(page, [project]);
      expect(await questionIdOf(page)).toBe(opener);
      expect(await optionIds(page)).not.toContain("neither");
      await page.getByRole("button", { name: "התחלה מחדש" }).click();
    }
  });

  test("refresh mid-flow restores the same question and the selected projects", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    await answerV2(page, "B");
    await page.reload();
    await expect(page.locator("[data-question-id]")).toBeVisible();
    expect(await questionIdOf(page)).toBe("B3");
    const stored = await storedJourney(page);
    expect(stored).toMatchObject({ version: 1, flow: "v2", phase: "answering", selectedProjectIds: [WOLT] });
    expect(JSON.stringify(stored)).not.toMatch(/score|support|ranking|shortlist/i);
  });

  test("refresh on the first question stays on it", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await page.reload();
    await expect(page.locator("[data-question-id]")).toBeVisible();
    expect(await questionIdOf(page)).toBe("B1");
  });

  test("Back removes the previous answer and replays; Back from the first question returns to the selection", async ({
    page,
  }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    await answerV2(page, "B");
    expect(await questionIdOf(page)).toBe("B3");
    await page.getByRole("button", { name: "חזרה" }).click();
    expect(await questionIdOf(page)).toBe("B2");
    expect((await storedJourney(page)).answers).toHaveLength(1);
    await page.getByRole("button", { name: "חזרה" }).click();
    expect(await questionIdOf(page)).toBe("B1");
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(projectCards(page).first()).toBeVisible();
    await expect(page.locator(`button[data-project-id="${WOLT}"]`)).toHaveAttribute("aria-pressed", "true");
  });

  test("Back from a result reopens the last question", async ({ page }) => {
    const p = persona("law");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    await page.getByRole("button", { name: "חזרה לשאלה האחרונה" }).click();
    expect(await questionIdOf(page)).toBe("L4"); // the Law reality check
  });

  test("Restart clears the journey and returns to discovery with nothing selected", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    await page.getByRole("button", { name: "התחלה מחדש" }).click();
    await expect(projectCards(page).first()).toBeVisible();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
    await expect.poll(() => storedJourney(page)).toBeNull();
  });

  test("refresh on the result rebuilds the same result", async ({ page }) => {
    const p = persona("accounting");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const before = await page.locator("main").innerText();
    await page.reload();
    await expect(resultRoot(page)).toBeVisible();
    expect(await page.locator("main").innerText()).toBe(before);
  });

  test("invalid or stale stored state is cleared, never a crash; V1 storage is ignored", async ({ page }) => {
    await page.goto("/v2");
    await expect(projectCards(page).first()).toBeVisible();
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          flow: "v2",
          phase: "answering",
          selectedProjectIds: ["zara_launch"],
          answers: [],
        }),
      );
      localStorage.setItem(
        "colman-studymatch:comparison",
        JSON.stringify({ version: 1, selectedProgramIds: ["computer_science", "data_science"], answers: [] }),
      );
    }, V2_KEY);
    await page.reload();
    await expect(projectCards(page).first()).toBeVisible();
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
    expect(await storedJourney(page)).toBeNull();
  });

  test("deep links without a journey go to the project selection", async ({ page }) => {
    for (const path of ["/v2/questions", "/v2/result"]) {
      await page.goto(path);
      await expect(projectCards(page).first()).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/v2");
    }
  });

  test("seeding a finished journey restores the result directly", async ({ page }) => {
    const p = persona("education");
    await startDiscovery(page, p.projects);
    const asked = await runPersonaInBrowser(page, p);
    await seedJourney(page, p.projects, personaAnswers(p, asked), "/v2/result");
    await expect(page.locator("h1")).toContainText(NAMES.education!);
  });
});

test.describe("double tap", () => {
  test("a rapid double click records one answer and emits one answer event", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await page.waitForTimeout(500);
    await page.locator('button[data-option-id="A"]').dblclick();
    await expect.poll(async () => (await storedJourney(page))?.answers.length).toBe(1);
    expect(await questionIdOf(page)).toBe("B2");
    const answers = (await dataLayer(page)).filter((e) => e.event === "question_answer");
    expect(answers).toHaveLength(1);
  });
});

test.describe("links and advisor CTA", () => {
  test("official links open in a new tab with noopener; the admissions page is offered", async ({ page }) => {
    const p = persona("law");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const links = page.locator("main a[href]");
    const count = await links.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("rel", /noopener/);
    }
    await expect(page.getByRole("link", { name: /לבדיקת תנאי הקבלה/ })).toBeVisible();
  });

  test("the official program link points to the right program", async ({ page }) => {
    const p = persona("business_vs_economics");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const links = page.locator('a[data-link-role="peer"]');
    await expect(links.nth(0)).toContainText(NAMES.business_administration!);
    await expect(links.nth(1)).toContainText(NAMES.economics_and_management!);
  });

  test("the advisor CTA appears when configured (this build) with its configured destination", async ({ page }) => {
    const p = persona("accounting");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    await expect(page.getByRole("link", { name: /לשוחח עם יועץ/ })).toHaveAttribute(
      "href",
      "https://example.org/advisor",
    );
  });
});

test.describe("analytics", () => {
  test("emits the V2 lifecycle with safe metadata only", async ({ page }) => {
    const p = persona("accounting");
    await startDiscovery(page, p.projects, "?utm_source=newsletter");
    await runPersonaInBrowser(page, p);
    const events = await dataLayer(page);
    const names = events.map((e) => e.event);
    for (const expected of [
      "career_project_discovery_view",
      "career_project_selected",
      "career_project_selection_completed",
      "comparison_started",
      "question_view",
      "question_answer",
      "comparison_completed",
      "recommended_program",
      "studymatch_result_view",
      "reality_check_view",
    ]) {
      expect(names, expected).toContain(expected);
    }
    expect(names.filter((n) => n === "studymatch_result_view")).toHaveLength(1);
    expect(events.find((e) => e.event === "career_project_selected")).toMatchObject({
      flow_version: "v2",
      project_id: WOLT,
      selection_count: 1,
      selection_position: 1,
    });
    expect(events.find((e) => e.event === "studymatch_result_view")).toMatchObject({
      flow_version: "v2",
      result_kind: "recommended",
      recommended_program: "accounting",
      selected_project_count: 1,
      scored_answer_count: 3,
      total_answer_count: 4,
      utm_source: "newsletter",
    });
    for (const event of events.filter((e) =>
      String(e.event).match(/^(career_project|question_|comparison_|studymatch|recommended|reality)/),
    )) {
      for (const [key, value] of Object.entries(event)) {
        expect(["string", "number", "boolean"], `${event.event}.${key}`).toContain(typeof value);
        if (typeof value === "string") expect(value).not.toMatch(/[֐-׿]/);
        expect(key).not.toMatch(/^(score|scores|support|shortlist|ranking)$/);
      }
    }
  });

  test("tags the Tech handoff, the neutral answer and generated focus", async ({ page }) => {
    const p = persona("tech_cross_cluster");
    await startDiscovery(page, p.projects);
    await runPersonaInBrowser(page, p);
    const events = await dataLayer(page);
    expect(events.find((e) => e.event === "precision_module_handoff")).toMatchObject({
      module_id: "v1_tech",
      seeded_answer_count: 1,
    });
    expect(events.filter((e) => e.event === "question_view" && e.is_generated_focus === true)).toHaveLength(1);
    expect(events.find((e) => e.event === "studymatch_result_view")).toMatchObject({
      result_kind: "v1_precision_result",
    });
  });

  test("a neutral answer is flagged is_neutral and every other answer is not", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    await answerV2(page, "neither");
    const answers = (await dataLayer(page)).filter((e) => e.event === "question_answer");
    expect(answers.map((e) => e.is_neutral)).toEqual([false, true]);
    expect(answers.map((e) => e.question_kind)).toEqual(["scenario", "focus"]);
  });

  test("Restart and Back are observable", async ({ page }) => {
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    await page.getByRole("button", { name: "חזרה" }).click();
    await page.getByRole("button", { name: "התחלה מחדש" }).click();
    const names = (await dataLayer(page)).map((e) => e.event);
    expect(names).toContain("discovery_back");
    expect(names).toContain("restart_comparison");
  });

  test("works with no dataLayer host at all (analytics never affects the flow)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "dataLayer", { get: () => undefined, set: () => {}, configurable: true });
    });
    await startDiscovery(page, [WOLT]);
    await answerV2(page, "A");
    expect(await questionIdOf(page)).toBe("B2");
  });
});

test.describe("V1 is untouched", () => {
  test("the V1 comparison entry still renders at /", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("label[data-program-id]")).toHaveCount(3);
  });
});
