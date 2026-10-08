# StudyMatch V3 Experience (UX redesign)

V3 is a **presentation and interaction redesign** of the StudyMatch journey, built next to the frozen V2 baseline so the two can be compared side by side and V3 rolled back instantly. **Same engine, same scoring, same routing, same question and program data, same lead backend.** Only the UI, the persisted-state key and the analytics version differ.

| Version | Route | Status |
|---|---|---|
| V1 | `/` | unchanged |
| V2 | `/v2` | **frozen baseline**: commit `9a25113`, tag `studymatch-v2-ui-baseline` |
| V3 | `/v3` | this redesign (draft PR) |

Rollback is not shipping or linking `/v3` (nothing links to it yet); V2 never changed. The launch switch (which version `/` serves) stays a separate, deliberate decision (DEC-031).

## What is shared and what is separate
- **Shared, unchanged:** `src/engine/**`, the discovery content (`src/data/content/**`), the journey reducer (`src/flow/discoveryFlow.ts`), `nextDiscoveryStep`, `buildV2ResultView` (V3's result is built *from* it, so the outcome is by construction the same), the lead form component and `/api/v2/lead`.
- **Separate (V3 only):** routes `src/app/v3/**`, UI `src/ui/v3/**`, provider `src/ui/state/V3Provider.tsx`, storage `src/flow/v3Persistence.ts`, copy `src/data/v3Copy.ts`, result view `src/flow/v3ResultView.ts`, progress `src/flow/v3Progress.ts`, analytics binding `src/ui/analytics/v3Analytics.ts`.
- **Touched additively:** `DiscoveryTracker` (optional `flowVersion` / `storageKey`, new V3 methods; defaults are V2's), `LeadForm` (optional `flowVersion` default `"v2"`, optional `placeholders`), the lead request schema (optional `flow_version`), the analytics vocabulary.

## Journey
`landing → projects → transition → questions (select, then Continue) → result`

1. **Landing (`/v3`)** — official COLMAN logo, "איזה תחום לימודים יכול להתאים לכם?", the three expectation lines ("כ־3–5 דקות", "לא צריך לדעת מראש מה ללמוד", "בסוף תקבלו כיוון ומסלול שכדאי להכיר"), CTA "בואו נמצא את הכיוון שלכם" and "מספר השאלות משתנה מעט לפי התשובות שלכם." A candidate with a V3 journey in progress sees "להמשיך מאיפה שעצרתם" and "להתחיל מחדש".
2. **Projects (`/v3/projects`)** — "באיזה פרויקט הייתם הכי רוצים להשתתף?" / "בחרו עד שניים שהכי מסקרנים אתכם. אין תשובה נכונה." Text-only cards (company, title, description, state): **no icons, no logos**. The company label has one size/weight/position on every card (colour is decorative); the synthetic project is labelled exactly `AI`. A third attempt is not silently greyed out: the card stays usable, nothing is added (maximum stays 2) and "אפשר לבחור עד שני פרויקטים. בטלו בחירה אחת כדי לבחור אחרת." is announced (`role=status`, `aria-live=polite`). A safe-area-aware sticky bar shows "נבחרו N מתוך 2" and "בואו נמשיך" (enabled for 1 or 2); a spacer keeps it from covering content. The brand disclaimer stays below the cards.
3. **Transition (`/v3/ready`)** — "מעולה, עכשיו נחדד את הכיוון" + how the questions work, CTA "לשאלה הראשונה". The "seen" flag is in memory only.
4. **Questions (`/v3/questions`)** — tap an option to **select** it (changeable), then press **המשך** (sticky bar) to **commit**. Nothing advances on tap. The answer, its analytics event and persistence happen only on Continue, so changing your mind is never double counted. Applies to authored, generated-focus, scenario and Tech precision questions (one panel, driven by the engine's question view). `/v2` keeps its tap-to-advance behaviour.
5. **Result (`/v3/result`)** — see below.

## Progress transparency
No fake question count. "שלב N מתוך 3" (1 projects, 2 "מדייקים את הכיוון", 3 the result) with a three-segment bar, and during questions a deterministic line from the number of **committed** answers: 0-1 "כמה שאלות קצרות", 2-3 "אנחנו כבר מתחילים לראות כיוון", 4+ "כמעט סיימנו". (The Tech cross-cluster journey can run to 11 answers, so "כמעט סיימנו" can be shown for several questions on that path; see risks.)

## Result
Top of the page answers *what is my result / why / what next*:
1. **Hero** — label "הכיוון שהכי מתאים לכם", the program name large, one explanatory line. No percentages or scores. Near tie: "נראה שיש לכם שני כיוונים חזקים". Insufficient evidence: the supportive "לא קיבלנו עדיין כיוון מספיק ברור".
2. **Immediate actions** — primary "הכירו את המסלול במכללה" (official URL from the source registry), secondary "דברו איתנו על המסלול" (scrolls to and focuses the form). A near tie offers each program; insufficient evidence offers "לנסות שוב" first.
3. **למה זה מתאים לכם?** — two or three short bullets in *meaning*, not an echo of the choices ("מעניין אתכם להבין איך אנשים מגיבים למסרים"). Source: `PROGRAM_MEANING` in `src/data/v3Copy.ts` (3 curated interest-level lines per program, deterministic, no runtime generation; the number shown follows how many independent signals pointed to the program, always 2-3). The literal choices the candidate made live only inside the collapsed detail.
4. A **materially important warning** (a negative reality check) is a calm note that is never collapsed. Other reality notes are in "מה עוד כדאי לדעת?".
5. **Comparison / secondary** — recommended: "כיוון נוסף שכדאי להכיר"; near tie: **"מה ההבדל ביניהם?"** (below).
6. **COLMAN section** — a distinct deep-blue/purple block with the official logo: "מה תמצאו במסלול?" (the program's verified work-imagination statements only, never invented academic facts; a note points to the official site for details), the program CTA and the contact CTA.
7. **Collapsed detail** (native `<details>`): "למה קיבלתי את התוצאה הזו?" (the choices) and "מה עוד כדאי לדעת?". Opening one reports `result_detail_expand`.
8. **"לא מרגיש לכם נכון?"** → "לנסות שוב" (restart to the landing), **before** the form.
9. **Lead form** (same component and API as V2; V3 adds example placeholders and tags the lead `flow_version: "v3"`), then **"לכל תוכניות הלימוד במכללה"** (the verified source-registry page `https://www.colman.ac.il/academics/ba/`, `colman_ba_programs_index`), then the brand disclaimer.
10. **Sticky contact** (mobile) "דברו איתנו על המסלול": safe-area aware, steps aside while the form is on screen.

## Near-tie pair content
`PAIR_CONTENT` (`src/data/v3Copy.ts`) is a short list of curated pairs, **not N×N**: Communication vs Communication + Management, Computer Science vs Data Science, Business vs Economics, Psychology vs Behavioral Science. Each has per-program differentiators and an "if X draws you → program" guidance line (Communication wording as specified). Lookup is order-independent (`findPairContent`). Any other pair falls back to each program's own verified work statements, without inventing distinctions (`pair.curated === false`).

## Official logo
`public/brand/colman-logo.webp` is the College's header logo as served by `colman.ac.il` (`/content/images/logo.png`, 107x107, a WebP despite the extension). Stored locally, never hotlinked, never redrawn; shown on the landing and in the COLMAN section only. Replace the file if the College supplies a higher-resolution asset (reference by the same path).

## State, persistence and isolation
- Key `colman-studymatch:v3:journey`, version 1, `{version, flow:"v3", phase, selectedProjectIds, answers}`. Everything derived is recomputed by replay through the unchanged reducer.
- V2 uses `colman-studymatch:v2:journey` with `flow:"v2"`. Each version rejects the other's payload as invalid and clears only its own key. Restart/Back/refresh in V3 never touch V2 state (browser-tested both ways).
- Analytics sessions are separate too: `colman-studymatch:analytics-v3` vs `colman-studymatch:analytics-v2`.
- Refresh keeps the question or the result; Back removes one committed answer (from the first question it returns to the projects with the selection kept); restart goes to the landing.

## Analytics (additive; V2 events unchanged)
Every V3 event carries `flow_version: "v3"` (V2 events keep `"v2"`), so the versions can be compared by one dimension. New events: `studymatch_landing_view`, `studymatch_start`, `question_continue`, `result_program_click` (`program_id`, `link_role`, `cta_position`), `result_contact_click` (`cta_position`: hero / colman_section / sticky), `result_all_programs_click`, `result_detail_expand` (`detail_section`). Existing events (`question_view`, `question_answer`, `studymatch_result_view`, `lead_form_*`, ...) are reused: `question_answer` fires only on commit. No PII, no answer text. Details in `docs/ANALYTICS.md`.

## Lead
Same endpoint (`POST /api/v2/lead`) and the same n8n webhook. The request gains an optional `flow_version` (`v2` | `v3`; absent = `v2`) and the webhook payload's `flow_version` follows it; every other field is identical.

## Tests
`tests/flow/v3.test.ts` (persistence isolation, progress, result view = engine outcome, curated copy, lead version), V3 tracker tests, `e2e/v3.spec.ts` (V3 journey and V2/V3 isolation + same-outcome per persona), `e2e/v2-baseline.spec.ts` (V2 pinned), `e2e/v3-layout.spec.ts` (320/390/1280 and comparison screenshots in the git-ignored `test-results/compare-*.png`).

## Known risks / next
- Hebrew copy (landing, meaning lines, pair content) needs a native reviewer; the per-program meaning lines are interest-level and deliberately make no program claims.
- "כמעט סיימנו" is count-based; very long Tech journeys show it early.
- The advisor and admissions links of V2 are not in the V3 result by design (two primary actions only); they can return if product wants them.
- The logo file is small (107 px); request a vector from the College before launch.
- Launch switch, legal approval of the consent wording and `LEAD_WEBHOOK_URL` remain as in DEC-031 / DEC-032.
