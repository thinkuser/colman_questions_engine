import { expect, test, type Page } from "@playwright/test";
import { dataLayer } from "./discoveryHelpers";
import { LEAD_PII } from "./leadHelpers";
import { mockFeedbackApi, reachV5ProjectResult, v5Result, V5_PATHS_TO } from "./v5Helpers";

/**
 * V5 feedback placement and persistence (DEC-039): the block is the LAST normal content of the result page, the
 * submission goes to our own /api/v5/feedback (intercepted here), `result_feedback_submit` is emitted and the local
 * "submitted" memory is written only after the server confirmed, and a failure keeps the form usable for a retry.
 */

const KINDS = [
  ["recommended", V5_PATHS_TO.recommended, "recommended"],
  ["near tie", V5_PATHS_TO.nearTie, "near_tie"],
  ["insufficient evidence", V5_PATHS_TO.insufficient, "insufficient_positive_evidence"],
] as const;

const eventsOf = async (page: Page, name: string) => (await dataLayer(page)).filter((e) => e.event === name);

/** The y position of the bottom edge of a visible element. */
async function bottomOf(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, testId).not.toBeNull();
  return box!.y + box!.height;
}

async function answerFeedback(page: Page, kind: string) {
  const block = page.getByTestId("result-feedback");
  if (kind !== "insufficient_positive_evidence")
    await block.locator('[data-feedback-question="fit"] button[data-feedback-value="very_suitable"]').click();
  await block.locator('[data-feedback-question="helpfulness"] button[data-feedback-value="somewhat"]').click();
}

for (const [label, path, kind] of KINDS) {
  test.describe(`feedback persistence: ${label}`, () => {
    test("the block is the last normal content: below the lead form, all-programs link and disclaimer", async ({
      page,
    }) => {
      await mockFeedbackApi(page);
      await reachV5ProjectResult(page, path);
      await expect(v5Result(page)).toHaveAttribute("data-result-kind", kind);
      const feedbackTop = (await page.getByTestId("result-feedback").boundingBox())!.y;
      expect(feedbackTop).toBeGreaterThanOrEqual(await bottomOf(page, "lead-anchor"));
      expect(feedbackTop).toBeGreaterThanOrEqual(await bottomOf(page, "all-programs"));
      // The brand disclaimer is the last paragraph before it (project mode).
      const disclaimer = page.getByText("שמות החברות מופיעים לצורך המחשה בלבד");
      expect(feedbackTop).toBeGreaterThanOrEqual(
        (await disclaimer.boundingBox())!.y + (await disclaimer.boundingBox())!.height,
      );
      // Nothing normal follows it: the page content ends with the feedback block.
      const last = await page.evaluate(() => {
        const root = document.querySelector('[data-result-flow="v5"]')!;
        const normal = [...root.children].filter((el) => !el.classList.contains("md:hidden"));
        return normal.at(-1)?.getAttribute("data-testid");
      });
      expect(last).toBe("result-feedback");
    });

    test("success: one POST with structured values, then analytics, local memory and thanks", async ({ page }) => {
      const captured = await mockFeedbackApi(page);
      await reachV5ProjectResult(page, path);
      await answerFeedback(page, kind);
      await page.getByTestId("result-feedback-submit").click();
      await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
      expect(captured).toHaveLength(1);
      const body = captured[0]!.body;
      expect(body).toMatchObject({
        source: "colman_studymatch_v5_feedback",
        feedback_version: "v1",
        flow_version: "v5",
        entry_mode: "projects",
        result_kind: kind,
        feedback_helpfulness: "somewhat",
        selected_project_ids: [...path.ids],
      });
      if (kind === "insufficient_positive_evidence") expect(body).not.toHaveProperty("feedback_fit");
      else expect(body.feedback_fit).toBe("very_suitable");
      expect(typeof body.result_state_key).toBe("string");
      expect(typeof body.comparison_id).toBe("string");
      expect(JSON.stringify(body)).not.toContain(LEAD_PII.first);
      // Semantic event after the confirmed save, with the unchanged schema.
      const [event] = await eventsOf(page, "result_feedback_submit");
      expect(event).toMatchObject({
        flow_version: "v5",
        result_kind: kind,
        feedback_version: "v1",
        feedback_helpfulness: "somewhat",
      });
      expect(JSON.stringify(await dataLayer(page))).not.toContain(String(body.result_state_key));
      // Remembered: a refresh shows thanks, not the form.
      await page.reload();
      await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
    });

    test("failure: no thanks, no analytics event, no local memory, the form stays and a retry succeeds", async ({
      page,
    }) => {
      const captured = await mockFeedbackApi(page, [503, 200]);
      await reachV5ProjectResult(page, path);
      await answerFeedback(page, kind);
      await page.getByTestId("result-feedback-submit").click();
      await expect(page.getByTestId("result-feedback-error")).toHaveText(
        "לא הצלחנו לשמור את המשוב כרגע. אפשר לנסות שוב.",
      );
      await expect(page.getByTestId("result-feedback-thanks")).toHaveCount(0);
      expect(await eventsOf(page, "result_feedback_submit")).toHaveLength(0);
      // The lead path and the page are unaffected, and the attempt is still visible as a click.
      await expect(page.getByTestId("hero-contact")).toBeEnabled();
      expect((await eventsOf(page, "ui_click")).filter((e) => e.element_id === "feedback_submit")).toHaveLength(1);
      // Not remembered: a refresh offers the form again.
      await page.reload();
      await expect(page.getByTestId("result-feedback-submit")).toBeVisible();
      await answerFeedback(page, kind);
      await page.getByTestId("result-feedback-submit").click();
      await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
      expect(captured).toHaveLength(2);
      expect(captured[1]!.body.result_state_key).toBe(captured[0]!.body.result_state_key); // same state, same dedupe key
      expect(await eventsOf(page, "result_feedback_submit")).toHaveLength(1);
    });
  });
}

test("loading state: the button is disabled and busy while saving, and a double click sends one request", async ({
  page,
}) => {
  const captured = await mockFeedbackApi(page, [200], 700);
  await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
  await answerFeedback(page, "recommended");
  const submit = page.getByTestId("result-feedback-submit");
  await submit.dblclick();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(submit).toHaveText("שומרים…");
  await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
  expect(captured).toHaveLength(1);
});

test("the API is same-origin: the page never contacts an n8n host and no webhook URL is in the HTML", async ({
  page,
}) => {
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));
  await mockFeedbackApi(page);
  await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
  await answerFeedback(page, "recommended");
  await page.getByTestId("result-feedback-submit").click();
  await expect(page.getByTestId("result-feedback-thanks")).toBeVisible();
  expect([...hosts].every((host) => host.startsWith("localhost"))).toBe(true);
  expect(await page.content()).not.toMatch(/webhook\/colman|n8n\./);
});

test("an unconfigured server (no FEEDBACK_WEBHOOK_URL) shows the retry message, never thanks", async ({ page }) => {
  // No mock: the real route answers 503 not_configured in the E2E server.
  await reachV5ProjectResult(page, V5_PATHS_TO.recommended);
  await answerFeedback(page, "recommended");
  await page.getByTestId("result-feedback-submit").click();
  await expect(page.getByTestId("result-feedback-error")).toBeVisible();
  await expect(page.getByTestId("result-feedback-thanks")).toHaveCount(0);
  expect(await eventsOf(page, "result_feedback_submit")).toHaveLength(0);
});
