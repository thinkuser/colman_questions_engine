import { expect, test, type Page } from "@playwright/test";
import {
  ALL,
  CS,
  DS,
  EVIDENCE,
  MIS_NAME,
  MIS_QUALIFIER,
  NEAR_TIE_SCRIPT,
  PERSONAS,
  dataLayer,
  expectMisQualified,
  expectNoLeaks,
  mainText,
  resultKind,
  runPolicy,
  runScript,
  startComparison,
  type Policy,
} from "./helpers";

const NOT_DISQUALIFYING = /לא מתאים|פסול|אי אפשר|לא תוכלו|אינכם יכולים|אין סיכוי/;

/** Evidence cards must be the wording of answers the candidate really gave (read from the real dataLayer). */
async function expectEvidenceFromActualAnswers(page: Page) {
  const answered = (await dataLayer(page))
    .filter((e) => e.event === "question_answer")
    .map((e) => EVIDENCE[`${e.question_id}/${e.answer_id}`]!);
  expect(answered.length).toBeGreaterThanOrEqual(5);
  const cards = await page.locator("[data-evidence-kind]").allInnerTexts();
  expect(cards.length).toBeGreaterThanOrEqual(3);
  expect(cards.length).toBeLessThanOrEqual(5);
  for (const card of cards) {
    const text = card.replace(/^מצד שני:\s*/, "").trim();
    expect(answered, `evidence "${text}" is not the wording of a given answer`).toContain(text);
  }
}

async function runPersona(page: Page, policy: Policy, programs = ALL) {
  await startComparison(page, programs);
  const asked = await runPolicy(page, policy);
  return asked;
}

const heading = (page: Page) => page.locator("h1").first().innerText();

test.describe("recommended personas", () => {
  const cases = [
    { name: "Persona A → Computer Science", policy: PERSONAS.A, name_he: "מדעי המחשב", tag: CS },
    { name: "Persona B → Data Science", policy: PERSONAS.B, name_he: "מדע הנתונים", tag: DS },
  ];

  for (const { name, policy, name_he } of cases) {
    test(name, async ({ page }) => {
      const asked = await runPersona(page, policy);
      expect(asked.length).toBeGreaterThanOrEqual(5);
      expect(asked.length).toBeLessThanOrEqual(7);
      expect(asked.filter((id) => id.startsWith("TB-"))).toHaveLength(0);

      expect(await resultKind(page)).toBe("recommended");
      expect(await heading(page)).toContain(name_he);
      await expectEvidenceFromActualAnswers(page);

      // The second program stays visible and understandable.
      await expect(page.getByRole("region", { name: "ומה לגבי האפשרות השנייה?" })).toBeVisible();
      // No unexpected reality check for a coherent persona.
      await expect(page.getByRole("region", { name: "כדאי לדעת לפני שמחליטים" })).toHaveCount(0);

      const text = await mainText(page);
      expectNoLeaks(text);
      expectMisQualified(text);
    });
  }

  test("Persona C → Management Information Systems", async ({ page }) => {
    const asked = await runPersona(page, PERSONAS.C);
    expect(asked.length).toBeGreaterThanOrEqual(5);
    expect(asked.length).toBeLessThanOrEqual(7);

    expect(await resultKind(page)).toBe("recommended");
    const h1 = await heading(page);
    expect(h1).toContain(MIS_NAME);
    expect(h1).toContain(MIS_QUALIFIER);
    await expectEvidenceFromActualAnswers(page);
    await expect(page.getByRole("region", { name: "ומה לגבי האפשרות השנייה?" })).toBeVisible();

    const text = await mainText(page);
    expectNoLeaks(text);
    // Every candidate-facing occurrence of the MIS name carries its qualifier (also inside the advisor CTA label).
    expect(expectMisQualified(text)).toBeGreaterThanOrEqual(2);
    expect(await page.getByRole("link", { name: /לשוחח עם יועץ/ }).innerText()).toContain(MIS_QUALIFIER);
  });
});

test("Persona D → no strong fit: no forced recommendation, alternatives and routes visible", async ({ page }) => {
  const asked = await runPersona(page, PERSONAS.D);
  expect(asked).toHaveLength(6);
  expect(asked.filter((id) => id.startsWith("TB-"))).toHaveLength(0); // never a tie-breaker after no_strong_fit

  expect(await resultKind(page)).toBe("no_strong_fit");
  const text = await mainText(page);
  expect(await heading(page)).toContain("נראה שאף אחת מהאפשרויות שבחרתם לא מתאימה לכם באופן ברור");
  expect(text).not.toContain("המסלול שהכי מתאים");
  expect(text).not.toContain("מצביעות בבירור");
  expectNoLeaks(text);
  expectMisQualified(text);

  // Two closer alternatives, softly framed, never called a recommendation.
  const alternatives = page.getByRole("region", { name: "האפשרויות הקרובות יותר" });
  await expect(alternatives).toBeVisible();
  await expect(alternatives.locator("li")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "ומה לגבי האפשרות השנייה?" })).toHaveCount(0);

  // Routes: compare / explore, and the advisor when configured.
  await expect(page.getByRole("button", { name: "לבדיקת תוכניות אחרות" })).toBeVisible();
  await expect(page.getByRole("link", { name: /לשוחח עם יועץ/ })).toBeVisible();

  // The no-fit explanation is built from the candidate's rejections.
  const cards = await page.locator("[data-evidence-kind]").allInnerTexts();
  expect(cards.filter((c) => c.includes("לא ממש")).length).toBeGreaterThanOrEqual(2);
});

test("CS/DS near tie: one tie-breaker, near-tie framing, no MIS question, shared year only as context", async ({
  page,
}) => {
  await startComparison(page, [CS, DS]);
  const asked: string[] = [];
  for (const [expected] of NEAR_TIE_SCRIPT) asked.push(expected);
  await runScript(page, NEAR_TIE_SCRIPT);

  // The script asserts each question the flow asked; also check the guardrails explicitly.
  const answers = (await dataLayer(page)).filter((e) => e.event === "question_answer");
  const askedIds = answers.map((e) => String(e.question_id));
  expect(askedIds).toEqual(asked);
  expect(askedIds.filter((id) => id.startsWith("TB-"))).toHaveLength(1);
  expect(askedIds.length).toBeLessThanOrEqual(7);
  expect(askedIds.some((id) => /MIS/.test(id))).toBe(false);

  expect(await resultKind(page)).toBe("near_tie");
  const text = await mainText(page);
  expect(text).toContain("ההתלבטות שלכם באמת קרובה");
  expect(text).not.toContain("המסלול שהכי מתאים");
  expect(text).not.toContain("מצביעות בבירור");
  expectNoLeaks(text);

  // Both programs are prominent in the hero.
  const hero = page.locator("header[data-result-kind]");
  await expect(hero).toContainText("מדעי המחשב");
  await expect(hero).toContainText("מדע הנתונים");
  await expect(hero.locator("div.border-brand")).toHaveCount(2);

  // The official shared-first-year note is context inside the decision section, never evidence.
  const decision = page.getByRole("region", { name: "ההתלבטות האמיתית שלכם" });
  await expect(decision).toContainText("חשוב לדעת:");
  const evidence = page.getByRole("region", { name: "למה קיבלתם את התוצאה הזאת?" });
  await expect(evidence).not.toContainText("החשיפה לשני התחומים");
  await expect(evidence).not.toContainText("כבר מהשנה הראשונה");

  // An answer that pulled the other way is represented honestly.
  await expect(page.locator('[data-evidence-kind="mixed"]')).toHaveCount(1);
});

test.describe("low math does not override repeated strong interest", () => {
  const cases = [
    {
      name: "Strong CS interest + lowest math",
      policy: PERSONAS.lowMathCS,
      program: "מדעי המחשב",
      check: "cs_math_load",
    },
    {
      name: "Strong DS interest + lowest math",
      policy: PERSONAS.lowMathDS,
      program: "מדע הנתונים",
      check: "ds_math_statistics_programming",
    },
  ];
  for (const { name, policy, program, check } of cases) {
    test(name, async ({ page }) => {
      const asked = await runPersona(page, policy);
      expect(asked.length).toBeLessThanOrEqual(7);

      // The recommendation is still the program the candidate repeatedly chose.
      expect(await resultKind(page)).toBe("recommended");
      expect(await heading(page)).toContain(program);
      await expectEvidenceFromActualAnswers(page);

      // A reality check appears, quotes the candidate's own math answer, and never reads as disqualification.
      const reality = page.getByRole("region", { name: "כדאי לדעת לפני שמחליטים" });
      await expect(reality).toBeVisible();
      await expect(page.locator(`[data-reality-check="${check}"]`)).toBeVisible();
      await expect(reality).toContainText(EVIDENCE["Q3/1"]!);
      const warning = await reality.innerText();
      expect(warning).not.toMatch(NOT_DISQUALIFYING);
      expect(warning).toMatch(/כדאי לקחת/);

      const text = await mainText(page);
      expectNoLeaks(text);
      expectMisQualified(text);
    });
  }
});

test("question-count guardrail across personas: 5-7 questions, at most one tie-breaker, none after no-fit", async ({
  page,
}) => {
  for (const [label, policy] of Object.entries(PERSONAS)) {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const asked = await runPersona(page, policy);
    expect(asked.length, label).toBeGreaterThanOrEqual(5);
    expect(asked.length, label).toBeLessThanOrEqual(7);
    expect(asked.filter((id) => id.startsWith("TB-")).length, label).toBeLessThanOrEqual(1);
    if ((await resultKind(page)) === "no_strong_fit") {
      expect(
        asked.some((id) => id.startsWith("TB-")),
        label,
      ).toBe(false);
    }
  }
});
