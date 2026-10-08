import { expect, test } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { resultRoot, runPersonaInBrowser, startDiscovery } from "./discoveryHelpers";

/** Runs against the build WITHOUT NEXT_PUBLIC_ADVISOR_URL (project "no-advisor"): no CTA, no broken or placeholder link. */

for (const id of ["accounting", "business_vs_economics", "insufficient", "focused_tech"]) {
  test(`V2 result (${id}): the advisor CTA is hidden when no destination is configured`, async ({ page }) => {
    const persona = V2_PERSONAS.find((p) => p.id === id)!;
    await startDiscovery(page, persona.projects);
    await runPersonaInBrowser(page, persona);
    await expect(resultRoot(page)).toBeVisible();
    await expect(page.getByRole("link", { name: /יועץ/ })).toHaveCount(0);
    await expect(page.locator('main a[href="#"], main a[href=""]')).toHaveCount(0);
  });
}
