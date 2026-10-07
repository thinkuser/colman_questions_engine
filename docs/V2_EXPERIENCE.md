# StudyMatch V2 Experience (THI-16)

The integrated V2 product: career-project discovery, deterministic routing, the V1 Tech precision module, reality checks and a generic result. Routing and scoring are `docs/V2_SCORING.md` (DEC-030); content is `docs/V2_QUESTION_BANK.md`. This document describes what a candidate sees and how the app is wired.

**Mental model:** V2 knows which room to enter; V1 asks the smart questions inside the Tech room.

## Where it lives
| Route | Step |
|---|---|
| `/v2` | Career-project discovery (choose 1-2 projects) |
| `/v2/questions` | Questions: authored, generated and V1 Tech precision, through one card |
| `/v2/result` | Result |

V1 stays at `/`, `/questions`, `/result`, unchanged. V2 is a separate namespace so the live V1 route is not touched until the V2 PR is reviewed and a launch switch is chosen (DEC-031).

## Journey
`discover → select 1-2 projects → answer → route → (V1 Tech precision | generic focus) → reality check → result → explore / convert`

- **No lead gate, no admissions gating, no candidate-facing scores or percentages, no psychometric wording.** A near tie and "insufficient positive evidence" are legitimate outcomes. Project and company names are imagination context only; there are no logos and the brand disclaimer is shown on the discovery screen and on every result.
- **Progress** is a stage indicator (projects / questions / result) and an indeterminate bar labelled "בונים את הכיוון שלכם". There is deliberately no "question 2 of 5": adaptive routes and the Tech module vary in length.

## Project selection (UX)
- Seven project cards from structured data (`career_projects.json`): title, company as text, a neutral line icon and the scenario sentence. Opening, helper and disclaimer copy come from the same file.
- Select **1 or 2**. After two, the other cards are `aria-disabled` and a visible message says how to change the choice; pressing one does nothing. Deselecting is allowed before continuing. Selecting scores nothing, and click order does not affect routing (the engine orders projects by display order).
- Each card is a real `<button aria-pressed>`: keyboard (Space/Enter) works, focus is visible, and the selected state is shown by a check mark and the word "נבחר" as well as colour.
- "בואו נתחיל" is enabled only for a valid selection.

## State, persistence, Back, restart
The UI never reproduces router logic. It holds a tiny reducer (`src/flow/discoveryFlow.ts`) over `{ phase, selectedProjectIds, answers }` and asks the engine (`nextDiscoveryStep`) what comes next. An answer is accepted only if it answers the question the engine is asking, with one of its options.

- **Persisted** (localStorage `colman-studymatch:v2:journey`): `{ version: 1, flow: "v2", phase, selectedProjectIds, answers }`. **Never persisted:** scores, ranking, support, shortlist, branch, next question, recommendation. They are recomputed by replaying the answers.
- **Refresh** restores the same screen, including the first question and the result. A V1 payload, an unknown project or option, three projects, extra fields, a wrong question order or answers past the end are rejected: the entry is cleared and the candidate starts over, never a crash. The V1 key is never read or written by V2.
- **Back** removes the last answer and recomputes (generic to generic, across the Tech handoff, precision steps, reality checks, and from a result to the last question). From the first question it returns to project selection with the selection kept. This differs from V1 only in that a refresh on the first question stays on it.
- **Restart** clears the journey and returns to `/v2`.
- **Double tap** is guarded by the same `ANSWER_TAP_GUARD_MS` window as V1 (the question card is shared) and by the reducer, which rejects a repeated answer; neither creates a second answer or analytics event.

## Tech handoff
- **Spotify alone:** the engine hands over immediately; V1 asks its own `Q1` once and runs its unchanged flow and result.
- **Spotify + another project:** `T1` (V1 `Q1`'s copy) is asked in generic mode; when the evidence shortlist settles inside Tech, its answer is carried into V1 as `Q1` and V1 continues at `Q2`. The candidate never sees `Q1` twice. V1 scoring is never reimplemented in the UI.

## Result kinds
Built by pure helpers in `src/flow/v2ResultView.ts` (`buildV2ResultView`), unit-testable without React. Everything is deterministic template text over the candidate's own chosen options and the programs' work-imagination statements: no runtime generation, no scores.

| Kind | What is shown |
|---|---|
| **recommended** | "הכיוון שהכי בולט אצלכם" + the program; "מה בלט בבחירות שלכם" (a pattern line when two or more independent choices pointed there, and up to three chosen options); the main decision against the best-supported runner-up (never an untested program); the runner-up as "כיוון נוסף שכדאי להכיר"; reality check; official links. |
| **near_tie** | "נראה שיש לכם שני כיוונים חזקים". Both programs, symmetrically, in catalog order (not the engine's ranked order), each with what pulled toward it; the trade-off as two parallel sentences; a link to each. No winner wording. |
| **insufficient_positive_evidence** | "לא קיבלנו עדיין כיוון מספיק ברור", supportive and explicit that this is a valid outcome. If exactly one program had any support it is offered as "כיוון שכדאי לבדוק", never as the best fit. Restart is the primary action. |
| **precision (V1 Tech)** | The unchanged V1 result view and tone. The V1-only "focused comparison" CTA is not offered; V2 restart is. |

- **Reality checks** appear only for programs that are shown, as a calm note: "נקודה שכדאי לקחת בחשבון" for a negative answer ("זה לא פוסל את הכיוון"), "כדאי לזכור" for neutral, "נראה שזה מסתדר לכם" for positive. They never change who is shown.
- **Official-facts limitation.** Eleven programs are still `pending_curation`: for them the result carries only the verified name and qualifier, the candidate's own choices, work-imagination statements and the official link, with a note that curriculum and admissions details are on the college site. Detailed facts are used only for V1 pilot programs. No course lists, admissions conditions, salaries or career promises are invented.
- **Links** come from the source registry (candidate-facing academy page first, else the college page); they open in a new tab with `noopener`. The admissions link is the existing official page. The **advisor CTA** is rendered only when `NEXT_PUBLIC_ADVISOR_URL` is set.

## Analytics
See `docs/ANALYTICS.md` ("V2 discovery events"). Analytics observes only: a failure or a missing `dataLayer` never affects the flow.

## Acceptance personas
`tests/flow/v2Personas.ts` is the single source for the engine test (`tests/flow/v2Personas.test.ts`) and the browser suite (`e2e/discovery.spec.ts`, plus 320 / 390 / desktop layout in `e2e/discovery-layout.spec.ts` and the no-advisor build in `e2e/discovery-noadvisor.spec.ts`).

| Persona | Projects | Result |
|---|---|---|
| focused_tech | Spotify | V1 precision (CS) |
| tech_cross_cluster | Wolt + Spotify | V1 precision (DS) after a generated Business vs Data Science question |
| tech_cross_cluster_longest | Wolt + Spotify | V1 precision; the longest path |
| business_vs_economics | Wolt | near tie |
| accounting | Wolt | recommended + Accounting reality check |
| psychology_vs_behavioral | TikTok | near tie + Psychology reality check |
| education | Duolingo | recommended + Education reality check |
| communication_vs_cm | Nike | near tie + Communication + Management reality check |
| law | AI | recommended + Law reality check |
| interior_design | Apple | recommended + Interior Design reality check |
| tiktok_nike | TikTok + Nike | generated focus → Communication + Management, reality check |
| insufficient | Wolt | insufficient positive evidence |

Also covered: project selection (1, 2, not 3, deselect, keyboard), neutral authored option, refresh mid-flow and on the result, Back, restart, invalid storage, deep links, double tap, links and the advisor CTA, analytics smoke tests, no logos, and layout at 320, 390 and desktop.

## Journey length (candidate answers)
Measured by the persona test (`CALIBRATION_REPORT=1 pnpm vitest run tests/flow/v2Personas.test.ts`) and walked in the browser.

| Persona | Generic questions | Precision questions | Reality checks | Total |
|---|---|---|---|---|
| focused_tech | 0 | 5 | 0 | **5** |
| tech_cross_cluster | 3 | 4 | 0 | **7** |
| **tech_cross_cluster_longest** | 5 | 6 | 0 | **11** |
| business_vs_economics | 5 | 0 | 0 | 5 |
| accounting | 3 | 0 | 1 | 4 |
| psychology_vs_behavioral | 5 | 0 | 1 | 6 |
| education | 3 | 0 | 1 | 4 |
| communication_vs_cm | 5 | 0 | 1 | 6 |
| law | 3 | 0 | 1 | 4 |
| interior_design | 3 | 0 | 1 | 4 |
| tiktok_nike | 3 | 0 | 1 | 4 |
| insufficient | 5 | 0 | 0 | 5 |

**Over 8 answers (product review):** only the Tech cross-cluster journeys. Exhaustive walks of Spotify combined with each other project (state-memoised) found a maximum of 11 for every pair, with zero content gaps. The exact worst path (Wolt + Spotify):

`T1=A, B1=A, focus:business_administration|computer_science:0=neither, :1=neither, :2=B, Q2=A, Q3=1, CSDS-1=cs, CSDS-2=ds, CSDS-3=ds, TB-CSDS=cs`

It is the generated Business-vs-CS question asked three times (two neutral answers, then a choice), followed by V1's full branch with its tie-breaker (6 more questions). **Recommendation for review (not changed here):** after a neutral answer to a generated focus question, hand the pair straight to the Tech module (or stop repeating the same pair), and consider capping generated rounds at two. Every non-Tech journey is 4-6 answers; no non-Tech path exceeds 7 (5 scored plus up to two reality checks).

## Remaining pre-launch risks
- **Launch switch.** `/` is still V1; promoting V2 means redirecting `/` to `/v2` (DEC-031). Nothing is promoted by this change.
- **Tech cross-cluster length** (above), and near ties are about three quarters of equal-weighted non-Tech paths; real frequencies need usage data.
- **Hebrew copy** was reviewed in context (light fixes: wording of B4 B, P6 D, D5, the recommended-trade-off sentence), but still needs a native reviewer.
- **Eleven programs have no curated facts**, so their results are intentionally thin; official-facts curation is the next content step.
- **No axe / screen-reader automation.** Accessibility is covered by semantic markup, keyboard and layout tests, not by an automated audit.
- **Generic "no strong fit" threshold** remains open (DEC-030).
