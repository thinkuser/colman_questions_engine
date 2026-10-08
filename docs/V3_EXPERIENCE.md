# StudyMatch V3 Experience (UX redesign)

V3 is the redesigned StudyMatch experience, built next to the frozen V2 baseline so the two can be compared side by side and V3 rolled back instantly. Since DEC-034 the two versions also test **two different discovery strategies**:

| | Discovery strategy | Experience |
|---|---|---|
| **V2** (frozen) | **brand-led**: "which project (Spotify, Wolt, TikTok...) would you join?" | V2 UI |
| **V3** | **world-led**: "which working world (product team, school, HR department...) intrigues you?" | redesigned UX |

**Same engine, same scoring, same routing rules, same lead backend.** The discovery strategy and the experience are deliberately separate modules: the V3 UX can run brand-led by switching one constant (`src/ui/v3/config.ts`) if the brand-led hypothesis performs better.

| Version | Route | Status |
|---|---|---|
| V1 | `/` | unchanged |
| V2 | `/v2` | **frozen baseline**: commit `9a25113`, tag `studymatch-v2-ui-baseline` |
| V3 | `/v3` | this redesign (draft PR) |

Rollback is not shipping or linking `/v3` (nothing links to it yet); V2 never changed. The launch switch (which version `/` serves) stays a separate, deliberate decision (DEC-031).

## What is shared and what is separate
- **Shared, unchanged:** `src/engine/**` (no engine change at all), V2's content (`career_projects.json`, `clusters.json`), V2's reducer/persistence/tracker (`discoveryFlow.ts`, `discoveryPersistence.ts`, `discoveryTracker.ts` are byte-identical to the baseline), `nextDiscoveryStep`, `buildV2ResultView`, the lead form component and `/api/v2/lead`.
- **Separate (V3 only):** world data `src/data/content/discovery/v3_worlds.json` + loader `src/data/v3Worlds.ts`, the strategy seam and generic journey `src/flow/journey.ts`, `src/flow/v3QuestionView.ts`, `src/flow/v3Persistence.ts`, `src/flow/v3ResultView.ts`, `src/flow/v3Progress.ts`, `src/analytics/journeyTracker.ts`, routes `src/app/v3/**`, UI `src/ui/v3/**`, `src/ui/state/V3Provider.tsx`, `src/ui/analytics/v3Analytics.ts`, copy `src/data/v3Copy.ts`.
- **Touched additively:** `LeadForm` (optional `flowVersion` default `"v2"`, `placeholders`, `selectedWorldIds`), the lead request schema (optional `flow_version`, optional `selected_world_ids`), the analytics vocabulary.

## Journey
`landing → worlds → transition → questions (select, then Continue) → result`

1. **Landing (`/v3`)** — official COLMAN logo, "איזה תחום לימודים יכול להתאים לכם?", the three expectation lines ("כ־3–5 דקות", "לא צריך לדעת מראש מה ללמוד", "בסוף תקבלו כיוון ומסלול שכדאי להכיר"), CTA "בואו נמצא את הכיוון שלכם" and "מספר השאלות משתנה מעט לפי התשובות שלכם." A candidate with a V3 journey in progress sees "להמשיך מאיפה שעצרתם" and "להתחיל מחדש".
2. **Worlds (`/v3/worlds`)** — "איזה מעולמות העשייה האלה הכי מסקרן אתכם?" / "בחרו עד שניים. לא צריך לדעת איזה תואר מוביל לשם." Nine world cards (title, workplace/context line, one imagination line, selection state): **no companies, logos, brand colours or icons**, one typography for every card. A third attempt is not silently greyed out: nothing is added (maximum stays 2) and "אפשר לבחור עד שני עולמות. בטלו בחירה אחת כדי לבחור עולם אחר." is announced (`role=status`, `aria-live=polite`). A safe-area-aware sticky bar shows "נבחרו N מתוך 2" and "בואו נמשיך" (enabled for 1 or 2); a spacer keeps it from covering the last card. No company disclaimer (there are no companies). See "World-led discovery" below.
3. **Transition (`/v3/ready`)** — "מעולה, עכשיו נחדד את הכיוון" + how the questions work, CTA "לשאלה הראשונה". The "seen" flag is in memory only.
4. **Questions (`/v3/questions`)** — tap an option to **select** it (changeable), then press **המשך** (sticky bar) to **commit**. Nothing advances on tap. The answer, its analytics event and persistence happen only on Continue, so changing your mind is never double counted. Applies to authored, generated-focus, scenario and Tech precision questions (one panel, driven by the engine's question view). `/v2` keeps its tap-to-advance behaviour.
5. **Result (`/v3/result`)** — see below.

## Progress transparency
No fake question count. "שלב N מתוך 3" (1 "בוחרים מה מסקרן אתכם", 2 "מדייקים את הכיוון", 3 the result) with a three-segment bar, and during questions a deterministic line from the number of **committed** answers: 0-1 "כמה שאלות קצרות", 2-3 "אנחנו כבר מתחילים לראות כיוון", 4+ "הכיוון כבר מתחיל להתחדד". The tone is deliberately **non-temporal**: the engine does not know how many questions remain (a Tech cross-cluster journey can run to 11 answers), so V3 never says "almost done", "one more question" or "a little left".

## World-led discovery (DEC-034)
The opening world choice is **routing only**, exactly like a V2 project: 0 fit points and 0 support. It builds the candidate pool (core + adjacent programs) and opens the world's own first scenario. Fit evidence starts with that scenario (+3, the existing scenario weight). Nothing in the engine changed: `src/data/v3Worlds.ts` adapts each world into the engine's existing shapes (a routing entry and a cluster), and `WORLD_STRATEGY` calls the unchanged `nextV2Step`.

- **Each world's cluster** = its opening scenario, then (People/HR only) its own follow-ups, then the EXISTING V2 authored focus/tiebreaker questions borrowed by id from `borrow_cluster_ids`. A question borrowed by two worlds is asked at most once (the engine dedupes by id). Reality checks are the existing V2 checks, found across all clusters by explicit applicability. Generated focus questions and the evidence-aware leading set are unchanged.
- **Two worlds:** world A's scenario, then world B's, then evidence-aware focus. The order is the candidate's **selection order** (persisted), never id or display order; it decides only which scenario comes first and gives no points (same answers in either order give the same scores, tested).
- **Tech:** `technology_data` opens with WT1 (CS / DS / MIS). Its options are V1 Q1's option ids with the same separator, so WT1 is declared `reuses: v1_tech/Q1` (the mechanism V2's approved T1 uses): when the evidence settles inside Tech, the unchanged V1 module takes over, receives WT1 as Q1 and continues at Q2. V1's Q1 copy names a brand ("חברה כמו ספוטיפיי"), so this also keeps brands out of V3. V1 code, thresholds and scoring are untouched; a test checks the V3 Tech path gives the same V1 outcome as the V2 Spotify path for the same answers.

| World | Context | Core / adjacent | Opening scenario (answers → program) |
|---|---|---|---|
| טכנולוגיה ודאטה | צוות מוצר דיגיטלי | CS, DS, MIS / BA | WT1: A→CS, B→DS, C→MIS (reuses V1 Q1) |
| עסקים ושווקים | חברה בצמיחה | BA, Econ&Mgmt / Econ&Psych, Accounting | WB1: A→BA, B→Econ&Mgmt, C→Econ&Psych |
| תקשורת והשפעה | סטודיו תוכן וקמפיינים | Comm, Comm&Mgmt / BA | WC1: A→Comm, B→Comm&Mgmt, C→BA |
| אנשים ופסיכולוגיה | קליניקה / מרכז ליווי והתפתחות | Psych, BehavSci / Education | WP1: A→Psych, B→BehavSci, C→Education |
| אנשים בארגונים | מחלקת People / HR | BehavSci, Econ&Psych / BA, MIS | WO1: A→BehavSci, B→Econ&Psych, C→BA, D→MIS (+ follow-ups WO2-WO5) |
| חינוך ודור העתיד | בית ספר / מסגרת חינוכית | Education / Psych, BehavSci | WE1: A→Education, B→Psych, C→BehavSci |
| משפט וצדק | משרד עורכי דין / מערכת המשפט | Law / BA, Comm | WL1: A→Law, B→BA, C→Comm |
| כסף וחשבונאות | משרד רואי חשבון / מחלקת כספים | Accounting / Econ&Mgmt, BA | WF1: A→Accounting, B→Econ&Mgmt, C→BA |
| עיצוב וחללים | סטודיו לעיצוב | Interior Design / Comm, BA | WD1: A→Interior Design, B→Comm, C→BA |

Openers have no neutral option. The People & Psychology wording stays about understanding and development (no treatment, diagnosis or therapist claims; tested). Its context label is "קליניקה / מרכז ליווי והתפתחות": a people/helping setting without implying that the BA itself qualifies anyone to practise therapy.

**Intentional design decisions (approved, recorded so they are not mistaken for bugs):**
- **WT1 → V1 Q1 carry is an approved, intentional semantic reuse.** WT1 is accepted as equivalent to V1 Q1 for the CS / DS / MIS separator (build the software or system → CS; investigate the data → DS; translate the business need into a system or process → MIS). It keeps V1's answer ids, V1's scoring and the carry/reuse mechanism, and V1 starts at Q2. V1 Q1 (which names Spotify) is never shown in V3. All equivalence tests stay.
- **People & Psychology and Education & Future share the same three-program candidate set** (Psychology, Behavioral Science, Education) **on purpose for the pilot.** They are different self-identification doors: person / psychology / social influence / personal development vs learning / pupils / the educational environment. The world choice itself scores zero; each world's different opener provides the first evidence. No extra questions were added to differentiate them: this will be evaluated with real usage data.
- **World selection is routing-only / zero score**, exactly like a V2 project.
- **`selected_world_ids` is persisted downstream in the lead sheet** (n8n workflow "Colman Webhook for question engine", Google Sheet tab `Leads`, column S, flattened `world_a | world_b`; blank for V2 leads, while `selected_project_ids` stays blank for V3 leads). The sheet's `source` column (now T) still holds the constant `colman_studymatch_v2` for every lead; use `flow_version` to tell versions apart.

**People/HR follow-ups (WO2-WO5, refined).** Same ids, option ids and program mappings; only the Hebrew was refined so the four programs are conceptually distinct: MIS = systems, workflows and information infrastructure; Behavioral Science = relationships, culture, group dynamics and the social environment; Economics + Psychology = incentives, trade-offs, framing and how they influence decisions; Business = organisational decisions, objectives, budgets and implementation. A test pins the copy and the mappings.

**People/HR follow-ups (new content, review needed).** The exhaustive traversal found that an MIS lead in the HR world ran out of separating questions (the only existing MIS question, law's L2, is about AI copyright). Rather than borrow an off-topic question, the HR world has four short HR-context follow-ups (WO2-WO5: MIS / Behavioral Science / Econ+Psych / BA + a neutral option). The Law world also borrows the existing communication follow-ups (C2-C5) for a Communication lead.

**Source validation.** The five official Academy pages (Behavioral Science, Education, Accounting, Law, Economics + Psychology) were read on 2026-10-08 and support the framing (BS: society, culture, an HR/organisational-development track; Education: formal and informal education, a teaching-certificate route; Accounting: the CPA path and CPA-firm internships; Law: the bar exam and internships at courts, prosecution and law firms; Econ+Psych: behavioural economics and decision-making, graduates in HR, strategy and marketing). Paraphrased provenance lives in `v3_worlds.json` (`provenance`); no marketing text is copied and no licence, curriculum, admission or salary claim is made.

### Coverage and traversal QA
`tests/flow/v3WorldTraversal.test.ts` walks every answer path of all 45 opening selections (9 single worlds + 36 pairs, and each pair in reverse order) with a state-memoised walk; `tests/flow/v3Worlds.test.ts` audits coverage. Report: `CALIBRATION_REPORT=1 pnpm vitest run tests/flow/v3WorldTraversal.test.ts tests/flow/v3Worlds.test.ts`. Equal-weight enumeration is a content-coverage and routing check, **not** a calibration; nothing was tuned from it.

- 131,034 complete paths, **0 content gaps** (also 0 with every pair reversed): 8,425 recommended, 24,524 near tie, 25 insufficient positive evidence, 98,060 Tech precision.
- Max scored generic answers **5** (ceiling holds); max total answers **11** (Tech + another world, the same worst case as V2's Spotify cross-cluster path): `WT1=A, WB1=A, focus BA|CS ×3 (neither, neither, B), Q2, Q3, CSDS-1..3, TB-CSDS`.
- Every one of the 14 programs has a natural path: at least one world opening answer points straight to it (no program depends on a generic fallback).

## Result
Top of the page answers *what is my result / why / what next*:
1. **Hero** — label "הכיוון שהכי מתאים לכם", the program name large, one explanatory line. No percentages or scores. Near tie: "נראה שיש לכם שני כיוונים חזקים". Insufficient evidence: the supportive "לא קיבלנו עדיין כיוון מספיק ברור".
2. **Immediate actions** — primary "הכירו את המסלול במכללה" (official URL from the source registry), secondary "דברו איתנו על המסלול" (scrolls to and focuses the form). A near tie offers each program; insufficient evidence offers "לנסות שוב" first.
3. **למה זה מתאים לכם?** — two or three short bullets in *meaning*, not an echo of the choices ("מעניין אתכם להבין איך אנשים מגיבים למסרים"). Source: `PROGRAM_MEANING` in `src/data/v3Copy.ts` (3 curated interest-level lines per program, deterministic, no runtime generation; the number shown follows how many independent signals pointed to the program, always 2-3). The literal choices the candidate made live only inside the collapsed detail.
4. A **materially important warning** (a negative reality check) is a calm note that is never collapsed. Other reality notes are in "מה עוד כדאי לדעת?".
5. **Comparison / secondary** — recommended: "כיוון נוסף שכדאי להכיר"; near tie: **"מה ההבדל ביניהם?"** (below).
6. **COLMAN section** — a distinct deep-blue/purple block with the official logo: "לאיזה סוג עשייה המסלול מתחבר?" with "דוגמאות למה שאפשר לעשות בתחום:" (the program's verified work-imagination statements only: they describe the type of activity, not literal courses or curriculum, and are never invented academic facts; the official-program CTA right below leads to the real curriculum, and a note points to the official site for details), the program CTA and the contact CTA.
7. **Collapsed detail** (native `<details>`): "למה קיבלתי את התוצאה הזו?" (the choices) and "מה עוד כדאי לדעת?". Opening one reports `result_detail_expand`.
8. **"לא מרגיש לכם נכון?"** → "לנסות שוב" (restart to the landing), **before** the form.
9. **Lead form** (same component and API as V2; V3 adds example placeholders and tags the lead `flow_version: "v3"`), then **"לכל תוכניות הלימוד במכללה"** (the verified source-registry page `https://www.colman.ac.il/academics/ba/`, `colman_ba_programs_index`), then the brand disclaimer.
10. **Sticky contact** (mobile) "דברו איתנו על המסלול": safe-area aware, steps aside while the form is on screen.

## Near-tie pair content
`PAIR_CONTENT` (`src/data/v3Copy.ts`) is a short list of curated pairs, **not N×N**: Communication vs Communication + Management, Computer Science vs Data Science, Business vs Economics, Psychology vs Behavioral Science. Each has per-program differentiators and an "if X draws you → program" guidance line (Communication wording as specified). Psychology is positioned on the **individual** (feelings, thoughts, motivation) and Behavioral Science on **people in groups, organizations and social environments** (culture, relationships, norms); decisions that meet money, price and risk belong to Economics + Psychology, not Behavioral Science. Lookup is order-independent (`findPairContent`). Any other pair falls back to each program's own verified work statements, without inventing distinctions (`pair.curated === false`).

## Official logo
`public/brand/colman-logo.webp` is the College's header logo as served by `colman.ac.il` (`/content/images/logo.png`, 107x107, a WebP despite the extension). Stored locally, never hotlinked, never redrawn; shown on the landing and in the COLMAN section only. Replace the file if the College supplies a higher-resolution asset (reference by the same path).

## State, persistence and isolation
- Key `colman-studymatch:v3:journey`, **version 2**: `{version: 2, flow: "v3", strategy: "worlds", phase, selectedIds, answers}`; `selectedIds` keeps the candidate's selection order. Everything derived is recomputed by replay. A version-1 payload (the earlier brand-led V3, `selectedProjectIds`) or another strategy's payload is rejected: the key is cleared and the candidate starts again at the landing (deep links without a journey also go to the landing).
- V2 uses `colman-studymatch:v2:journey` with `flow:"v2"`. Each version rejects the other's payload as invalid and clears only its own key. Restart/Back/refresh in V3 never touch V2 state (browser-tested both ways).
- Analytics sessions are separate too: `colman-studymatch:analytics-v3` vs `colman-studymatch:analytics-v2`.
- Refresh keeps the question or the result; Back removes one committed answer (from the first question it returns to the worlds with the selection kept); restart goes to the landing.

## Analytics (additive; V2 events unchanged)
Every V3 event carries `flow_version: "v3"` (V2 events keep `"v2"`), so the versions can be compared by one dimension. New events: `studymatch_landing_view`, `studymatch_start`, `question_continue`, `result_program_click` (`program_id`, `link_role`, `cta_position`), `result_contact_click` (`cta_position`: hero / colman_section / sticky), `result_all_programs_click`, `result_detail_expand` (`detail_section`). Existing events (`question_view`, `question_answer`, `studymatch_result_view`, `lead_form_*`, ...) are reused: `question_answer` fires only on commit. No PII, no answer text. Details in `docs/ANALYTICS.md`.

## Lead
Same endpoint (`POST /api/v2/lead`) and the same n8n webhook. The request gains an optional `flow_version` (`v2` | `v3`; absent = `v2`) and the webhook payload's `flow_version` follows it; every other field is identical.

## Tests
`tests/flow/v3.test.ts` (persistence isolation, progress, result view = engine outcome, curated copy, lead version), V3 tracker tests, `e2e/v3.spec.ts` (V3 journey and V2/V3 isolation + same-outcome per persona), `e2e/v2-baseline.spec.ts` (V2 pinned), `e2e/v3-layout.spec.ts` (320/390/1280 and comparison screenshots in the git-ignored `test-results/compare-*.png`).

## Known risks / next
- Hebrew copy (landing, meaning lines, pair content) needs a native reviewer; the per-program meaning lines are interest-level and deliberately make no program claims.
- The advisor and admissions links of V2 are not in the V3 result by design (two primary actions only); they can return if product wants them.
- The logo file is small (107 px); request a vector from the College before launch.
- Open: the launch switch (DEC-031) and the College's legal approval of the consent wording (DEC-032). `LEAD_WEBHOOK_URL` is configured in Vercel (Preview + Production) and the Vercel → `/api/v2/lead` → n8n path has been verified end to end.
