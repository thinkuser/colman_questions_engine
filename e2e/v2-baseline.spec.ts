import { expect, test } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import {
  GUARD_WAIT_MS,
  answerV2,
  dataLayer,
  openDiscovery,
  optionIds,
  projectCards,
  questionIdOf,
  resultRoot,
  runPersonaInBrowser,
  selectProjects,
  startDiscovery,
} from "./discoveryHelpers";
import { LEAD_PII, fillLead, leadForm, leadSubmit, mockLeadApi } from "./leadHelpers";

/**
 * V2 FROZEN BASELINE (commit 9a25113, tag studymatch-v2-ui-baseline). These checks pin the V2 experience while V3 is
 * built next to it: the same V2 screens, interaction model and lead contract must keep working exactly as approved.
 * (The full V2 functional suite in discovery*.spec.ts keeps running too.)
 */

const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;

test.describe("V2 baseline", () => {
  test("/v2 opens straight into discovery with the approved copy, icons and greyed third card", async ({ page }) => {
    await openDiscovery(page);
    await expect(page.locator("h1")).toHaveText("אם הייתם יכולים להצטרף מחר לאחד מהפרויקטים האלה, מה הכי מושך אתכם?");
    await expect(page.getByText("אפשר לבחור עד שניים.")).toBeVisible();
    await expect(page.getByTestId("landing-cta")).toHaveCount(0); // no landing page in V2
    await expect(projectCards(page)).toHaveCount(7);
    // V2 cards keep their decorative icons.
    for (const card of await projectCards(page).all()) await expect(card.locator("svg").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "בואו נתחיל" })).toBeDisabled();
    await selectProjects(page, ["wolt_new_city", "nike_israel_launch"]);
    await expect(page.locator('button[data-project-id="tiktok_endless_scroll"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByTestId("selection-status")).toContainText(
      "אפשר לבחור עד שני פרויקטים. כדי להחליף, בטלו בחירה קיימת.",
    );
  });

  test("V2 questions auto-advance on tap, with indeterminate progress and no Continue button", async ({ page }) => {
    await startDiscovery(page, ["wolt_new_city"]);
    await expect(page.getByText("בונים את הכיוון שלכם")).toBeVisible();
    await expect(page.getByText(/שלב \d מתוך 3/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "המשך", exact: true })).toHaveCount(0);
    const first = await questionIdOf(page);
    const options = await optionIds(page);
    await answerV2(page, options[0]!); // a single tap commits and advances
    expect(await questionIdOf(page)).not.toBe(first);
  });

  test("V2 results keep their structure (flow marker, escape hatch after actions) and the lead form has no placeholders", async ({
    page,
  }) => {
    await mockLeadApi(page);
    await startDiscovery(page, persona("accounting").projects);
    await runPersonaInBrowser(page, persona("accounting"));
    await expect(page.locator('[data-result-flow="v2"]')).toBeVisible();
    await expect(page.locator('[data-result-flow="v3"]')).toHaveCount(0);
    await expect(resultRoot(page)).toHaveAttribute("data-result-kind", "recommended");
    await expect(page.getByText("הכיוון שהכי בולט אצלכם")).toBeVisible();
    await expect(leadForm(page).getByLabel("שם פרטי")).not.toHaveAttribute("placeholder", /./);
    await expect(page.getByTestId("sticky-bar")).toHaveCount(0);
  });

  test("a V2 lead is sent with flow_version v2 through the same API", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await startDiscovery(page, persona("business_vs_economics").projects);
    await runPersonaInBrowser(page, persona("business_vs_economics"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      flow_version: "v2",
      first_name: LEAD_PII.first,
      result_kind: "near_tie",
    });
    for (const event of await dataLayer(page)) expect(event.flow_version, String(event.event)).toBe("v2");
  });

  test("V1 at / is untouched and /v2 deep links still guard themselves", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("[data-result-flow]")).toHaveCount(0);
    await page.goto("/v2/result");
    await expect(page).toHaveURL(/\/v2$/);
    await page.waitForTimeout(GUARD_WAIT_MS / 4);
  });
});
