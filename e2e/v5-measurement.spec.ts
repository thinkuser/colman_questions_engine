import { expect, test, type Locator, type Page } from "@playwright/test";
import { V3_PERSONAS, v3PersonaChoice } from "../tests/flow/v3Personas";
import { dataLayer } from "./discoveryHelpers";
import { fillLead, LEAD_PII, mockLeadApi } from "./leadHelpers";
import { reachV4WorldResult, v4LeadSubmit } from "./v4Helpers";
import {
  answerUntilV5Result,
  chooseAndContinueV5,
  reachV5ProjectResult,
  reachV5WorldResult,
  resetV5,
  selectEntries,
  startV5,
  v5QuestionId,
  v5Result,
  V5_PATHS_TO,
} from "./v5Helpers";

/**
 * V5 pilot measurement acceptance (DEC-038): `ui_click` on every candidate control (in addition to the semantic
 * events), the pilot feedback block and its events, the fixed outbound UTMs, and the privacy boundary of the dataLayer.
 * V4 is checked to be unaffected (no ui_click, no feedback block, no outbound UTMs).
 */

const OUTBOUND = { utm_source: "study_match", utm_medium: "questionaire", utm_campaign: "ai_tools" };
const v3Persona = (id: string) => V3_PERSONAS.find((p) => p.id === id)!;
const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);
const clicksOf = async (page: Page, elementId: string) =>
  (await eventsOf(page, "ui_click")).filter((e) => e.element_id === elementId);

/** Click a link (fires the app's handlers) without leaving the test site. */
async function clickLinkInPlace(link: Locator) {
  await link.evaluate((el) => {
    el.addEventListener("click", (event) => event.preventDefault(), { once: true });
    (el as HTMLElement).click();
  });
}

/** Every visible label / text the candidate can see: none of it may reach the dataLayer. */
async function visibleTexts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, a, label, legend, h1, h2, h3")]
      .map((el) => (el as HTMLElement).innerText.trim())
      .filter((text) => text.length >= 4),
  );
}

test.describe("V5 dataLayer audit: a complete projects journey", () => {
  test("every control emits ui_click with stable ids, semantic events still fire, and no PII or labels leak", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    const labels = new Set<string>();
    const collect = async () => (await visibleTexts(page)).forEach((text) => labels.add(text));

    // Landing -> method -> projects.
    await page.goto("/v5");
    await collect();
    await page.getByTestId("landing-cta").click();
    await expect(page.getByTestId("v4-method")).toBeVisible();
    await collect();
    await page.locator('button[data-entry-mode="projects"]').click();
    await expect(page.locator("button[data-project-id]")).toHaveCount(10);
    await collect();

    // Two selections, then a refused third.
    await selectEntries(page, ["accounting_gap", "nike_launch", "apple_store_space"]);
    await expect(page.getByTestId("limit-message")).not.toBeEmpty();
    await page.getByTestId("discover-continue").click();
    await expect(page.getByTestId("v3-transition")).toBeVisible();
    await collect();
    await page.getByTestId("transition-cta").click();

    // Questions: change an answer once, then answer to the result.
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    await collect();
    await page.locator("label:has(input[data-option-id])").nth(1).click();
    await answerUntilV5Result(
      page,
      (_id, offered) => offered[0]!,
      async () => collect(),
    );
    await collect();

    // Result: program CTA, contact CTA, detail toggle, all programs, feedback, lead.
    const firstProgram = page.locator('[data-testid="hero-actions"] a[data-link-role]').first();
    if ((await firstProgram.count()) > 0) await clickLinkInPlace(firstProgram);
    await page.getByTestId("hero-contact").click();
    const detail = page.locator("[data-detail-id] summary").first();
    if ((await detail.count()) > 0) await detail.click();
    await clickLinkInPlace(page.getByTestId("all-programs"));
    const feedback = page.getByTestId("result-feedback");
    await feedback.scrollIntoViewIfNeeded();
    await collect();
    const fit = feedback.locator('[data-feedback-question="fit"] button[data-feedback-value="quite_suitable"]');
    if ((await fit.count()) > 0) await fit.click();
    await feedback.locator('[data-feedback-question="helpfulness"] button[data-feedback-value="yes"]').click();
    await page.getByTestId("result-feedback-submit").click();
    await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    await v4LeadSubmit(page).click(); // empty: validation
    await fillLead(page);
    await v4LeadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured).toHaveLength(1);

    // ui_click coverage (stable element ids).
    const clicks = await eventsOf(page, "ui_click");
    const ids = new Set(clicks.map((e) => e.element_id));
    for (const id of [
      "landing_start",
      "method_projects",
      "discovery_project_card",
      "discovery_continue",
      "ready_continue",
      "answer_option",
      "question_continue",
      "result_contact",
      "result_all_programs",
      "feedback_helpfulness_option",
      "feedback_submit",
      "lead_submit",
    ])
      expect(ids, id).toContain(id);
    for (const click of clicks) {
      expect(click).toMatchObject({ flow_version: "v5" });
      expect(click.element_type).toBeTruthy();
      expect(click.screen_id).toBeTruthy();
    }
    expect(await clicksOf(page, "lead_submit")).toHaveLength(2); // invalid + valid press
    const answerClicks = await clicksOf(page, "answer_option");
    for (const click of answerClicks) {
      expect(click.question_id).toBeTruthy();
      expect(click.answer_id).toBeTruthy();
    }

    // The refused third card: a click, but no selection event.
    const thirdClicks = (await clicksOf(page, "discovery_project_card")).filter(
      (e) => e.project_id === "apple_store_space",
    );
    expect(thirdClicks).toHaveLength(1);
    const selected = await eventsOf(page, "career_project_selected");
    expect(selected.map((e) => e.project_id)).toEqual(["accounting_gap", "nike_launch"]);

    // Semantic events are still there (ui_click never replaces them).
    for (const name of [
      "studymatch_landing_view",
      "studymatch_start",
      "discovery_method_view",
      "discovery_method_selected",
      "career_project_discovery_view",
      "career_project_selection_completed",
      "comparison_started",
      "question_view",
      "question_continue",
      "question_answer",
      "comparison_completed",
      "studymatch_result_view",
      "result_contact_click",
      "result_all_programs_click",
      "result_feedback_view",
      "result_feedback_submit",
      "lead_form_view",
      "lead_form_error",
      "lead_form_submit",
      "lead_form_success",
    ])
      expect((await eventsOf(page, name)).length, name).toBeGreaterThan(0);

    // Privacy: no personal data, no consent text, no candidate-facing labels or answer texts.
    const serialized = JSON.stringify(await dataLayer(page));
    for (const value of [LEAD_PII.first, LEAD_PII.last, LEAD_PII.phone, LEAD_PII.phoneLocal, "מאשר/ת"])
      expect(serialized).not.toContain(value);
    for (const text of labels) expect(serialized, text).not.toContain(text);
  });

  test("result CTAs report position and role; Back + try again report their own ids", async ({ page }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.nearTie);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "near_tie");
    const peers = page.locator('[data-testid="hero-actions"] a[data-link-role="peer"]');
    await clickLinkInPlace(peers.first());
    const [programClick] = await clicksOf(page, "result_program");
    expect(programClick).toMatchObject({
      element_type: "link",
      screen_id: "result",
      destination_type: "program",
      link_role: "peer",
      cta_position: "hero",
      result_kind: "near_tie",
    });
    expect(programClick!.program_id).toBeTruthy();
    expect(await eventsOf(page, "result_program_click")).toHaveLength(1);
    await page.getByTestId("try-again").click();
    await expect(page).toHaveURL(/\/v5$/);
    expect(await clicksOf(page, "result_try_again")).toMatchObject([
      { cta_position: "not_right", destination_type: "restart" },
    ]);
  });

  test("question Back and the method / discovery Back controls emit ui_click", async ({ page }) => {
    await startV5(page, "projects", ["nike_launch"]);
    await chooseAndContinueV5(page, "A");
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect.poll(() => v5QuestionId(page)).toBe("V5-NIKE");
    expect(await clicksOf(page, "question_back")).toHaveLength(1);
    await page.getByRole("button", { name: "חזרה" }).click();
    await expect(page).toHaveURL(/\/v5\/projects$/);
    await page.getByTestId("back-to-method").click();
    await expect(page).toHaveURL(/\/v5\/start$/);
    expect(await clicksOf(page, "discovery_back")).toHaveLength(1);
    await page.getByRole("button", { name: "חזרה" }).click();
    expect(await clicksOf(page, "method_back")).toHaveLength(1);
  });

  test("world mode: world cards report world_id", async ({ page }) => {
    await startV5(page, "worlds", ["law_justice"]);
    expect(await clicksOf(page, "discovery_world_card")).toMatchObject([
      { world_id: "law_justice", screen_id: "worlds", entry_mode: "worlds" },
    ]);
    expect(await clicksOf(page, "method_worlds")).toHaveLength(1);
  });
});

test.describe("V5 pilot feedback", () => {
  test("recommended: both questions; submit sends canonical values once, and a refresh shows thanks", async ({
    page,
  }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "recommended");
    const block = page.getByTestId("result-feedback");
    await expect(block).toHaveAttribute("data-feedback-kind", "fit_and_helpfulness");
    await expect(block).toContainText("עד כמה הכיוון שקיבלת מרגיש מתאים?");
    await expect(block).toContainText("האם התהליך עזר לצמצם את האפשרויות?");
    await expect(block.locator("textarea, input[type=text]")).toHaveCount(0);
    await expect(page.getByTestId("result-feedback-submit")).toBeDisabled();
    await block.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await eventsOf(page, "result_feedback_view")).length).toBe(1);
    await block.locator('button[data-feedback-value="very_suitable"]').click();
    await block.locator('button[data-feedback-value="somewhat"]').click();
    await page.getByTestId("result-feedback-submit").click();
    await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    const submits = await eventsOf(page, "result_feedback_submit");
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({
      flow_version: "v5",
      entry_mode: "projects",
      result_kind: "recommended",
      feedback_fit: "very_suitable",
      feedback_helpfulness: "somewhat",
      feedback_version: "v1",
    });
    expect(submits[0]!.comparison_id).toBeTruthy();
    expect(submits[0]!.recommended_program).toBeTruthy();
    // The lead CTA and the program links are never gated by feedback.
    await expect(page.getByTestId("hero-contact")).toBeEnabled();

    await page.reload();
    await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    await expect(page.getByTestId("result-feedback-submit")).toHaveCount(0);
  });

  test("near tie: both questions are offered", async ({ page }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.nearTie);
    await expect(page.getByTestId("result-feedback")).toHaveAttribute("data-feedback-kind", "fit_and_helpfulness");
  });

  test("insufficient evidence: only the process-helpfulness question, and no feedback_fit is sent", async ({
    page,
  }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.insufficient);
    await expect(v5Result(page)).toHaveAttribute("data-result-kind", "insufficient_positive_evidence");
    const block = page.getByTestId("result-feedback");
    await expect(block).toHaveAttribute("data-feedback-kind", "helpfulness_only");
    await expect(block).toContainText("האם התהליך עזר להבין קצת יותר מה מתאים ומה פחות?");
    await expect(block).not.toContainText("עד כמה הכיוון שקיבלת מרגיש מתאים?");
    await block.locator('button[data-feedback-value="no"]').click();
    await page.getByTestId("result-feedback-submit").click();
    const [submit] = await eventsOf(page, "result_feedback_submit");
    expect(submit).toMatchObject({ result_kind: "insufficient_positive_evidence", feedback_helpfulness: "no" });
    expect(submit).not.toHaveProperty("feedback_fit");
  });

  test("a new result state (try again -> a new journey, same answers) gets a fresh feedback form", async ({ page }) => {
    // The redesigned result has no Back control (the guard keeps a completed journey on its result); a new result
    // state comes from "try again" (new comparison_id) or different answers. Both change the feedback key (unit-tested).
    await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
    const block = page.getByTestId("result-feedback");
    await block.locator('button[data-feedback-value="yes"]').click();
    await page.getByTestId("result-feedback-submit").click();
    await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    const firstId = (await eventsOf(page, "result_feedback_submit"))[0]!.comparison_id;

    await page.getByTestId("try-again").click();
    await expect(page).toHaveURL(/\/v5$/);
    await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
    await expect(page.getByTestId("result-feedback-submit")).toBeVisible();
    await expect(page.getByTestId("result-feedback-thanks")).toHaveCount(0);
    await page.getByTestId("result-feedback").locator('button[data-feedback-value="no"]').click();
    await page.getByTestId("result-feedback-submit").click();
    const submits = await eventsOf(page, "result_feedback_submit");
    // (The helper reloads /v5, so the page dataLayer now holds only the new journey events.)
    expect(submits.at(-1)!.comparison_id).toBeTruthy();
    expect(submits.at(-1)!.comparison_id).not.toBe(firstId);
  });
});

test.describe("V5 outbound UTMs", () => {
  test("every outbound COLMAN link carries the fixed UTMs and keeps its original destination", async ({ page }) => {
    // The same world journey in V4 (no outbound rewriting) gives the original destinations.
    await reachV4WorldResult(page, v3Persona("law"));
    const original = await page
      .locator('[data-result-flow="v4"] a[target="_blank"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
    expect(original.length).toBeGreaterThan(0);
    for (const href of original) expect(href).not.toContain("utm_source=study_match");

    await resetV5(page);
    await reachV5WorldResult(page, v3Persona("law"));
    const links = page.locator('[data-result-flow="v5"] a[target="_blank"]');
    const rewritten = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
    expect(rewritten).toHaveLength(original.length);
    const positions = await links.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-cta-position") ?? el.getAttribute("data-testid")),
    );
    expect(positions).toEqual(expect.arrayContaining(["hero", "colman_section", "all-programs"]));
    rewritten.forEach((href, index) => {
      const url = new URL(href);
      expect(url.protocol).toBe("https:");
      for (const [key, value] of Object.entries(OUTBOUND)) expect(url.searchParams.getAll(key), href).toEqual([value]);
      for (const key of Object.keys(OUTBOUND)) url.searchParams.delete(key);
      const before = new URL(original[index]!);
      expect(`${url.origin}${url.pathname}${url.search}${url.hash}`).toBe(
        `${before.origin}${before.pathname}${before.search}${before.hash}`,
      );
    });
  });

  test("near-tie peer links and the secondary/alternative link are rewritten too", async ({ page }) => {
    await reachV5ProjectResult(page, V5_PATHS_TO.nearTie);
    for (const href of await page
      .locator('[data-result-flow="v5"] a[data-link-role]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")!)))
      expect(new URL(href).searchParams.get("utm_medium")).toBe("questionaire");
    await resetV5(page);
    await reachV5WorldResult(page, v3Persona("tech_build"));
    const alternative = page.locator('[data-result-flow="v5"] a[data-link-role="alternative"]');
    if ((await alternative.count()) > 0)
      expect(new URL((await alternative.first().getAttribute("href"))!).searchParams.get("utm_campaign")).toBe(
        "ai_tools",
      );
  });
});

test.describe("V4 is unaffected by the V5 measurement layer", () => {
  test("a V4 journey emits no ui_click / feedback events and shows no feedback block", async ({ page }) => {
    await reachV4WorldResult(page, v3Persona("law"));
    await expect(page.getByTestId("result-feedback")).toHaveCount(0);
    const names = (await dataLayer(page)).map((e) => e.event);
    expect(names).not.toContain("ui_click");
    expect(names).not.toContain("result_feedback_view");
    expect(names.some((n) => String(n).startsWith("career_world_"))).toBe(true);
  });
});

test("persona-driven worlds journey also completes with measurement on", async ({ page }) => {
  const persona = v3Persona("hr_systems");
  await startV5(page, "worlds", persona.worlds);
  await answerUntilV5Result(page, (id, offered) => v3PersonaChoice(persona, id, offered));
  await expect(page.getByTestId("result-feedback")).toBeVisible();
});

test.describe("Inbound acquisition UTMs (not the outbound ones)", () => {
  test("UTMs on the /v5 landing URL stay on the pre-journey and journey events of a self-selected run", async ({
    page,
  }) => {
    await page.goto("/v5?utm_source=newsletter&utm_medium=email&utm_campaign=open_day");
    await page.getByTestId("landing-cta").click();
    await expect(page).toHaveURL(/\/v5\/start$/);
    await page.locator('button[data-entry-mode="projects"]').click();
    await selectEntries(page, ["nike_launch"]);
    await page.getByTestId("discover-continue").click();
    await page.getByTestId("transition-cta").click();
    await expect(page.locator("section[data-question-id]")).toBeVisible();
    for (const name of [
      "studymatch_landing_view",
      "studymatch_start",
      "discovery_method_selected",
      "career_project_selected",
      "comparison_started",
      "question_view",
      "ui_click",
    ]) {
      const events = await eventsOf(page, name);
      expect(events.length, name).toBeGreaterThan(0);
      for (const event of events)
        expect(event, name).toMatchObject({ utm_source: "newsletter", utm_medium: "email", utm_campaign: "open_day" });
    }
    // The outbound links of the result keep the FIXED values, never the inbound ones.
    await answerUntilV5Result(page, (_id, offered) => offered[0]!);
    for (const href of await page
      .locator('[data-result-flow="v5"] a[target="_blank"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")!)))
      expect(new URL(href).searchParams.get("utm_source")).toBe("study_match");
  });
});

test.describe("reality_check_view (wired for V5 only)", () => {
  test("a visible reality-check note emits reality_check_view in V5, and still nothing in V4", async ({ page }) => {
    await reachV5WorldResult(page, v3Persona("tech_build"));
    const note = page.locator("[data-reality-level]").first();
    await expect(note).toBeVisible();
    await note.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await eventsOf(page, "reality_check_view")).length).toBeGreaterThan(0);
    const [view] = await eventsOf(page, "reality_check_view");
    expect(view).toMatchObject({ flow_version: "v5", entry_mode: "worlds" });
    expect(view!.program_id).toBeTruthy();

    await reachV4WorldResult(page, v3Persona("tech_build"));
    await page.locator("[data-reality-level]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await eventsOf(page, "reality_check_view")).toHaveLength(0);
  });
});
