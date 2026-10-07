import { expect, type Page } from "@playwright/test";
import type { V2Persona } from "../tests/flow/v2Personas";
import { runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";

/** Helpers for the V2 lead form acceptance suite (THI-16 review pass). */

export const LEAD_PII = { first: "אורנית", last: "זוהרי-בן", phone: "052-7654321", phoneLocal: "0527654321" };
export const SUBMIT_NAME = "חזרו אליי עם פרטים";

export const leadForm = (page: Page) => page.getByTestId("lead-form");
export const leadSubmit = (page: Page) => leadForm(page).getByRole("button", { name: SUBMIT_NAME });
export const leadField = (page: Page, name: "first_name" | "last_name" | "phone" | "consent") =>
  leadForm(page).locator(`[name="${name}"]`);

export interface CapturedLead {
  body: Record<string, unknown>;
}

/**
 * Intercepts the same-origin lead API (the browser suite never reaches a real webhook). `statuses` is consumed one per
 * request; the last one repeats. Returns the captured request bodies.
 */
export async function mockLeadApi(page: Page, statuses: number[] = [200], delayMs = 0): Promise<CapturedLead[]> {
  const captured: CapturedLead[] = [];
  await page.route("**/api/v2/lead", async (route) => {
    captured.push({ body: JSON.parse(route.request().postData() ?? "{}") });
    const status = statuses[Math.min(captured.length - 1, statuses.length - 1)]!;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? { ok: true } : { ok: false, error: "delivery_failed" }),
    });
  });
  return captured;
}

export async function fillLead(page: Page, values = LEAD_PII, consent = true) {
  await leadField(page, "first_name").fill(values.first);
  await leadField(page, "last_name").fill(values.last);
  await leadField(page, "phone").fill(values.phone);
  if (consent) await leadField(page, "consent").check();
}

/** Run a persona to its result, leaving the page on the result with the lead form in the DOM. */
export async function reachResult(page: Page, persona: V2Persona) {
  await startDiscovery(page, persona.projects);
  await runPersonaInBrowser(page, persona);
  await expect(leadForm(page)).toBeVisible();
}
