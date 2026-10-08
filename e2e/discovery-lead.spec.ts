import { expect, test, type Page } from "@playwright/test";
import { V2_PERSONAS } from "../tests/flow/v2Personas";
import { dataLayer, openDiscovery, projectCards, selectProjects } from "./discoveryHelpers";
import { LEAD_PII, fillLead, leadField, leadForm, leadSubmit, mockLeadApi, reachResult } from "./leadHelpers";

/**
 * V2 lead capture acceptance (THI-16 review pass): the form on every result kind, validation, the same-origin API
 * contract, honest failure handling, double-submit protection and the PII boundary. The lead API is intercepted, so no
 * real webhook is ever called; one test exercises the REAL route with no `LEAD_WEBHOOK_URL` to prove the 503 path.
 */

const persona = (id: string) => V2_PERSONAS.find((p) => p.id === id)!;
const leadEvents = async (page: Page) =>
  (await dataLayer(page)).filter((entry) => String(entry.event).startsWith("lead_form_"));

test.describe("lead form on every V2 result", () => {
  for (const id of ["accounting", "business_vs_economics", "insufficient", "focused_tech"]) {
    test(`${id}: the form follows the exploration actions and precedes the escape hatch`, async ({ page }) => {
      await reachResult(page, persona(id));
      const order = await page.evaluate(() => {
        const form = document.querySelector('[data-testid="lead-form"]')!;
        const links = [...document.querySelectorAll("main a[href]")].filter((a) => !form.contains(a));
        const lastLink = links[links.length - 1] ?? null;
        const hatch = [...document.querySelectorAll("main section")].find(
          (section) => !section.contains(form) && section.textContent?.includes("לא מרגיש לכם נכון"),
        );
        const following = (el: Element | null) => Boolean(el && form.compareDocumentPosition(el) & 4);
        const preceding = (el: Element | null) => Boolean(el && form.compareDocumentPosition(el) & 2);
        return {
          hatchAfterForm: hatch ? following(hatch) : true,
          linksBeforeForm: lastLink ? preceding(lastLink) : true,
        };
      });
      expect(order.hatchAfterForm).toBe(true);
      expect(order.linksBeforeForm).toBe(true);
      await expect(leadForm(page).getByRole("heading", { name: "רוצים שנעזור לכם לעשות את הצעד הבא?" })).toBeVisible();
    });
  }

  test("has the agreed fields, an unchecked consent checkbox, accessible attributes and no email", async ({ page }) => {
    await reachResult(page, persona("accounting"));
    const form = leadForm(page);
    await expect(leadField(page, "first_name")).toHaveAttribute("autocomplete", "given-name");
    await expect(leadField(page, "last_name")).toHaveAttribute("autocomplete", "family-name");
    await expect(leadField(page, "phone")).toHaveAttribute("autocomplete", "tel");
    await expect(leadField(page, "phone")).toHaveAttribute("inputmode", "tel");
    await expect(form.getByLabel("שם פרטי")).toBeVisible();
    await expect(form.getByLabel("שם משפחה")).toBeVisible();
    await expect(leadField(page, "consent")).not.toBeChecked();
    await expect(form.getByText("אני מאשר/ת ומסכים/ה לרישום פרטי במאגרי המידע")).toBeVisible();
    await expect(leadSubmit(page)).toBeEnabled();
    await expect(form.locator('input[type="email"], [name="email"]')).toHaveCount(0);
    // The consent label is clickable.
    await form.getByText("אני מאשר/ת ומסכים/ה").click();
    await expect(leadField(page, "consent")).toBeChecked();
    for (const name of ["first_name", "last_name", "phone"] as const) {
      expect((await leadField(page, name).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("validation", () => {
  test("an empty submit shows short inline Hebrew errors, sends nothing, focuses the first error", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("accounting"));
    await leadSubmit(page).click();
    await expect(leadForm(page).getByText("נא למלא שם פרטי.")).toBeVisible();
    await expect(leadForm(page).getByText("נא למלא שם משפחה.")).toBeVisible();
    await expect(leadForm(page).getByText("נא להזין מספר טלפון תקין, למשל 050-1234567.")).toBeVisible();
    await expect(leadForm(page).getByText("כדי להמשיך יש לאשר את הסכמתכם.")).toBeVisible();
    await expect(leadField(page, "first_name")).toBeFocused();
    await expect(leadField(page, "first_name")).toHaveAttribute("aria-invalid", "true");
    await expect(leadField(page, "first_name")).toHaveAttribute("aria-describedby", /first-error/);
    expect(captured).toHaveLength(0);
    // The view event fires when the form scrolls into view, which a click can precede; order is not the contract.
    const events = (await leadEvents(page)).map((e) => [e.event, e.error_type]);
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        ["lead_form_view", undefined],
        ["lead_form_error", "validation"],
      ]),
    );
  });

  test("keeps what was typed when a field is invalid, and accepts common Israeli phone formats", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("accounting"));
    await fillLead(page, { ...LEAD_PII, phone: "12-34" }, false);
    await leadSubmit(page).click();
    await expect(leadField(page, "phone")).toHaveValue("12-34");
    await expect(leadField(page, "first_name")).toHaveValue(LEAD_PII.first);
    await expect(leadField(page, "phone")).toBeFocused();
    expect(captured).toHaveLength(0);

    await leadField(page, "phone").fill("+972 (0)52-765 4321");
    await leadField(page, "consent").check();
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured).toHaveLength(1);
  });
});

test.describe("submission", () => {
  test("posts the result context to the same-origin API, then confirms and keeps the result visible", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("tiktok_nike"));
    const journeyId = (await dataLayer(page)).find((e) => e.event === "studymatch_result_view")?.comparison_id;
    expect(journeyId).toBeTruthy();

    await fillLead(page);
    await leadSubmit(page).click();
    const success = page.getByTestId("lead-success");
    await expect(success).toBeVisible();
    await expect(success).toContainText("תודה, הפרטים התקבלו.");
    await expect(success).toContainText("נציגי המכללה יחזרו אליכם.");
    await expect(page.locator("[data-result-kind]").first()).toBeVisible();
    await expect(page).toHaveURL(/\/v2\/result$/);
    await expect(leadForm(page).locator("form")).toHaveCount(0);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.body).toMatchObject({
      first_name: LEAD_PII.first,
      last_name: LEAD_PII.last,
      phone: LEAD_PII.phone,
      consent: true,
      website: "",
      comparison_id: journeyId,
      selected_project_ids: expect.arrayContaining(["nike_israel_launch", "tiktok_endless_scroll"]),
    });
    expect(captured[0]!.body).not.toHaveProperty("email");
    expect((await leadEvents(page)).map((e) => e.event)).toEqual([
      "lead_form_view",
      "lead_form_submit",
      "lead_form_success",
    ]);
  });

  test("a Tech precision result reached through /v2 sends the V1 best fit as primary", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("focused_tech"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      result_kind: "v1_precision_result",
      primary_program_id: "computer_science",
      selected_project_ids: ["spotify_discover_weekly"],
    });
  });

  test("a near tie has no primary program and sends both programs as peers", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("business_vs_economics"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({ result_kind: "near_tie", primary_program_id: null });
    expect((captured[0]!.body.alternative_programs as Array<{ role: string }>).map((p) => p.role)).toEqual([
      "peer",
      "peer",
    ]);
  });

  test("insufficient evidence has no primary program", async ({ page }) => {
    const captured = await mockLeadApi(page);
    await reachResult(page, persona("insufficient"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured[0]!.body).toMatchObject({
      result_kind: "insufficient_positive_evidence",
      primary_program_id: null,
    });
  });

  test("a failed delivery shows a friendly error, keeps the details and allows a retry", async ({ page }) => {
    const captured = await mockLeadApi(page, [500, 200]);
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toHaveText("כרגע לא הצלחנו לשלוח את הפרטים. נסו שוב בעוד רגע.");
    await expect(page.getByTestId("lead-success")).toHaveCount(0);
    await expect(leadField(page, "first_name")).toHaveValue(LEAD_PII.first);
    await expect(leadField(page, "phone")).toHaveValue(LEAD_PII.phone);
    await expect(leadField(page, "consent")).toBeChecked();
    await expect(leadSubmit(page)).toBeEnabled();

    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured).toHaveLength(2);
    expect((await leadEvents(page)).map((e) => [e.event, e.error_type])).toEqual([
      ["lead_form_view", undefined],
      ["lead_form_submit", undefined],
      ["lead_form_error", "server"],
      ["lead_form_submit", undefined],
      ["lead_form_success", undefined],
    ]);
  });

  test("a network failure is reported as such and is retryable", async ({ page }) => {
    await page.route("**/api/v2/lead", (route) => route.abort("failed"));
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toBeVisible();
    expect((await leadEvents(page)).at(-1)).toMatchObject({ event: "lead_form_error", error_type: "network" });
  });

  test("with no LEAD_WEBHOOK_URL the real API answers 503 and the form never claims success", async ({
    page,
    request,
  }) => {
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toBeVisible();
    await expect(page.getByTestId("lead-success")).toHaveCount(0);
    await expect(leadField(page, "last_name")).toHaveValue(LEAD_PII.last);

    const direct = await request.post("/api/v2/lead", {
      data: {
        first_name: "דנה",
        last_name: "לוי",
        phone: "0501234567",
        consent: true,
        website: "",
        comparison_id: null,
        result_kind: "near_tie",
        primary_program_id: null,
        alternative_programs: [
          { id: "business_administration", role: "peer" },
          { id: "economics_and_management", role: "peer" },
        ],
        selected_project_ids: ["wolt_new_city"],
      },
    });
    expect(direct.status()).toBe(503);
    expect(await direct.json()).toEqual({ ok: false, error: "not_configured" });
    const spam = await request.post("/api/v2/lead", { data: { website: "http://spam.example" } });
    expect(spam.status()).toBe(400);
  });

  test("blocks a double submit: one request, a disabled button and a loading label", async ({ page }) => {
    const captured = await mockLeadApi(page, [200], 700);
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).dblclick();
    await expect(leadForm(page).getByRole("button", { name: "שולחים…" })).toBeDisabled();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    expect(captured).toHaveLength(1);
    expect((await leadEvents(page)).filter((e) => e.event === "lead_form_submit")).toHaveLength(1);
  });

  test("passes a populated honeypot to the server, which rejects it: the form never shows success", async ({
    page,
  }) => {
    const captured = await mockLeadApi(page, [400]);
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await page.getByTestId("lead-honeypot").evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "http://spam.example");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-error")).toBeVisible();
    expect(captured[0]!.body.website).toBe("http://spam.example");
  });
});

test.describe("PII boundary", () => {
  test("name and phone never reach the dataLayer, storage, the URL or the console", async ({ page }) => {
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));
    await mockLeadApi(page);
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();

    const needles = [LEAD_PII.first, LEAD_PII.last, LEAD_PII.phone, LEAD_PII.phoneLocal];
    const leaked = await page.evaluate((values) => {
      const haystacks: Record<string, string> = {
        dataLayer: JSON.stringify((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []),
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        url: location.href,
      };
      return Object.entries(haystacks)
        .filter(([, text]) => values.some((value) => text.includes(value)))
        .map(([name]) => name);
    }, needles);
    expect(leaked).toEqual([]);
    for (const value of needles) expect(consoleLines.join("\n")).not.toContain(value);

    const keys = new Set((await leadEvents(page)).flatMap((event) => Object.keys(event)));
    for (const forbidden of ["first_name", "last_name", "phone", "email", "name", "consent"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  test("a refresh after success shows the form again (nothing about the lead is persisted)", async ({ page }) => {
    await mockLeadApi(page);
    await reachResult(page, persona("accounting"));
    await fillLead(page);
    await leadSubmit(page).click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
    await page.reload();
    await expect(leadForm(page).locator("form")).toBeVisible();
    await expect(leadField(page, "first_name")).toHaveValue("");
  });
});

test.describe("COLMAN visual system", () => {
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  test("company names use the agreed tones, as text, with no logos", async ({ page }) => {
    await openDiscovery(page);
    const expected: Record<string, string> = {
      spotify_discover_weekly: "#0f7a33",
      wolt_new_city: "#00707f",
      duolingo_persistence: "#357100",
      tiktok_endless_scroll: "#c9163f",
      nike_israel_launch: "#111111",
      apple_store_space: "#4d4d52",
    };
    for (const [id, hex] of Object.entries(expected)) {
      const name = page.locator(`button[data-project-id="${id}"] span.font-bold`).first();
      expect(await name.evaluate((el) => getComputedStyle(el).color), id).toBe(rgb(hex));
    }
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(projectCards(page)).toHaveCount(7);
  });

  test("selected cards get the COLMAN blue border and keep the word and check mark; the heading has no dash", async ({
    page,
  }) => {
    await openDiscovery(page);
    await selectProjects(page, ["wolt_new_city"]);
    const card = page.locator('button[data-project-id="wolt_new_city"]');
    // The border animates (transition), so poll the settled colour.
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(rgb("#3e48ce"));
    await expect(card).toContainText("נבחר");
    await expect(page.locator("h1")).toHaveText("אם הייתם יכולים להצטרף מחר לאחד מהפרויקטים האלה, מה הכי מושך אתכם?");
  });

  test("the V1 comparison keeps its own placeholder blue (the theme is scoped to /v2)", async ({ page }) => {
    await page.goto("/");
    const brand = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--color-brand").trim());
    expect(brand).toBe("#1d4ed8");
  });
});
