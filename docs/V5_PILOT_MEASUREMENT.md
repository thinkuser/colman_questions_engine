# StudyMatch V5 — Pilot Measurement (source of truth)

DEC-038. The measurement **contract** for the V5 real-user pilot at `/v5`: what the app emits, what it means, how KPIs are computed, and what still has to be configured outside the app. Companion files:
- `docs/analytics/v5_event_matrix.json` — machine-readable event matrix (input for a mechanical GTM build).
- `docs/GTM_V5_IMPLEMENTATION.md` — GTM variables, triggers, GA4 tag(s), custom definitions.
- `docs/V5_PILOT_KPI_QUERIES.md` — GA4 BigQuery export queries for every KPI.

## Implementation status
| Item | Status | Notes |
|---|---|---|
| Application instrumentation | **DONE** | Semantic events (unchanged) + `ui_click` + feedback events + `reality_check_view` (V5). |
| dataLayer | **DONE** | `trackEvent()` → `window.dataLayer.push`. Verified in the browser suite. |
| Outbound UTM | **DONE** | Every V5 outbound http(s) link (program pages, all programs). |
| Pilot feedback | **DONE** | V5 result page (last content block), structured, non-blocking; persisted to the Feedback sheet tab (DEC-039). |
| Feedback persistence | **DONE** | `/api/v5/feedback` → n8n "Colman StudyMatch Feedback" (active) → Feedback tab. `FEEDBACK_WEBHOOK_URL` must be set in Vercel (see §12). |
| GTM container on the page | **NOT DONE (gated)** | No GTM snippet was ever loaded by the app. A loader now exists for `/v5` only, **off until `NEXT_PUBLIC_GTM_ID` is set** in Vercel. No COLMAN container was found in the GTM accounts available to us. |
| GTM variables | **DOCUMENTED** | Not configured. |
| GTM triggers | **DOCUMENTED** | Not configured. |
| GA4 events | **DOCUMENTED** | Not configured; GA4 receiving events is **not** verified. |
| GA4 custom definitions | **DOCUMENTED** | Not created. |
| BigQuery queries | **DONE** | Written against placeholders (the COLMAN GA4 export dataset is not in the repo). Not executed against real data. |
| Dashboard | **SPECIFIED** | Not built. |
| n8n | **VERIFIED** | V5 already compatible; no change made. |
| Google Sheet | **VERIFIED** | V5 rows stored correctly; real rows untouched. |

## 1. Objectives (the questions the pilot answers)
1. Do candidates complete the experience? (funnel, completion)
2. Does the result feel right? (`feedback_fit`)
3. Does StudyMatch help narrow the options? (`feedback_helpfulness`)
4. Where do candidates abandon? (screen / `question_index` drop-off)
5. Which Worlds / Projects perform best? (per door)
6. Which questions create friction? (`question_id` drop-off, back, neutral rate)
7. How often: recommendation / near tie / insufficient evidence / Tech precision? (`result_kind`)
8. Which programs are recommended disproportionately? (`recommended_program`)
9. Does Business Administration become a catch-all? (BA share overall and by opening door)
10. Which result CTAs create downstream engagement? (`cta_position`, `link_role`)
11. Which journeys create leads? (`lead_form_success` by door / result)
12. Which discovery strategy performs better when traffic is externally assigned? (cohorts, §8)

**Measurement never affects the product**: no event, feedback or click is read by scoring, routing, ranking or result selection. All analytics failures are swallowed.

## 2. Event model
**Semantic events are the source of truth for business KPIs** (funnel, completion, results, conversion). They were not renamed or changed in meaning. **`ui_click` is additive UX evidence**: every candidate control emits it *in addition to* its semantic event (e.g. the start CTA → `ui_click` + `studymatch_start`). Use `ui_click` for click coverage, button-level UX analysis and debugging — never as a funnel step.

All V5 events carry `flow_version: "v5"`; every journey event carries `entry_mode` (`worlds` | `projects`). Missing / non-applicable parameters are **omitted**, never sent as empty strings. Only documented parameter names can reach the dataLayer (`src/analytics/events.ts`, enforced by `sanitizeParams`).

### Inbound vs outbound UTMs (do not confuse them)
| | Inbound (acquisition) | Outbound (StudyMatch → COLMAN) |
|---|---|---|
| Question | How did the candidate reach StudyMatch? | StudyMatch sent this visit to COLMAN |
| Where | Parameters `utm_source/medium/campaign/content/term` on **StudyMatch events**, read from the URL the candidate arrived on | Query string of the **outbound link** |
| Values | Whatever the campaign used | Fixed: `utm_source=study_match`, `utm_medium=questionaire`, `utm_campaign=ai_tools` |
| Code | `src/analytics/context.ts`, `v5Analytics.ts` (entry query kept for the visit) | `src/analytics/outboundUtm.ts` (`withStudyMatchOutboundUtm`) |

`questionaire` is the agreed tracking value and is intentionally spelled this way.

Fixed in this release (V5 only): a self-selected candidate's inbound UTMs on `/v5?utm_…` were lost, because the journey tracker is created on `/v5/start` (no query). The entry query is now remembered for the visit and applied to the pre-journey and journey events. V4 keeps its previous behaviour.

## 3. Event dictionary (V5)
Context groups: **journey** = `flow_version, entry_mode, comparison_id, selected_project_count + project_ids | selected_world_count + world_ids, utm_*`; **result** = journey + `result_kind, recommended_program, alternative_programs, scored_answer_count, total_answer_count`; **question** = journey + `question_id, question_index, question_mode, question_kind, is_generated_focus, focus_program_count`.

| Event | When | Parameters (beyond `flow_version`) |
|---|---|---|
| `studymatch_landing_view` | `/v5` shown | `entry_mode`?, inbound `utm_*` |
| `studymatch_start` | Landing CTA | `entry_mode`?, `utm_*` |
| `discovery_method_view` | `/v5/start` shown | `utm_*` |
| `discovery_method_selected` | Worlds / Projects chosen (never for direct links) | `entry_mode`, `utm_*` |
| `career_project_discovery_view` / `career_world_discovery_view` | Discovery shown | `entry_mode`, `project_count_available` (10) / `world_count_available` (9) |
| `career_project_selected` / `career_world_selected` | Card selected (a refused third: nothing) | `project_id`/`world_id`, `selected_*_count`, `selection_position` |
| `career_project_deselected` / `career_world_deselected` | Card deselected | `project_id`/`world_id`, `selected_*_count` |
| `career_project_selection_completed` / `career_world_selection_completed` | Continue → journey starts | journey + `selection_count` |
| `comparison_started` | Journey starts | journey |
| `precision_module_handoff` | V1 Tech module entered | journey + `module_id`, `seeded_answer_count` |
| `question_view` | Question shown | question |
| `question_continue` | Continue pressed | question |
| `question_answer` | Answer committed | question + `answer_id`, `is_neutral` |
| `discovery_back` | Back from a question | journey + `questions_answered` |
| `comparison_completed` | Journey completes | result + `questions_answered` |
| `recommended_program` | Same moment, only with a recommendation | result + `questions_answered` |
| `studymatch_result_view` | Result shown (once per result state) | result |
| `result_program_click` | Official program link | result + `program_id`, `link_role`, `cta_position` |
| `result_contact_click` | Contact CTA | result + `cta_position` |
| `result_all_programs_click` | All-programs link | result |
| `result_detail_expand` | Collapsed detail opened | result + `detail_section` |
| `secondary_program_view` | Secondary direction seen | result + `program_id` |
| `reality_check_view` | Reality-check note visible (**now wired in V5**) | result + `program_id` |
| `result_feedback_view` | Feedback block ≥ 50% visible (once per result state) | result + `feedback_version` |
| `result_feedback_submit` | Feedback submitted (once per result state) | result + `feedback_version`, `feedback_fit`?, `feedback_helpfulness`? |
| `lead_form_view` / `lead_form_submit` / `lead_form_success` / `lead_form_error` | Lead form lifecycle (`submit` = a valid form sent) | result (+ `error_type`) |
| `restart_comparison` | Restart with progress | journey + `questions_answered` |
| `ui_click` | Any candidate control | `element_id, element_type, screen_id`, `destination_type`?, contextual ids (+ journey / question / result context) |

`official_program_click` is a V2-only event; V3/V4/V5 report the same action as `result_program_click`.

### `ui_click` schema
| Param | Values |
|---|---|
| `element_id` | `landing_start`, `landing_start_over`, `method_worlds`, `method_projects`, `method_back`, `discovery_world_card`, `discovery_project_card`, `discovery_continue`, `discovery_back`, `ready_continue`, `answer_option`, `question_continue`, `question_back`, `question_restart`, `result_program`, `result_contact`, `result_try_again`, `result_all_programs`, `result_detail_expand`, `lead_submit`, `feedback_fit_option`, `feedback_helpfulness_option`, `feedback_submit` |
| `element_type` | `button`, `link`, `card`, `answer_option`, `detail_toggle` |
| `screen_id` | `landing`, `method`, `projects`, `worlds`, `ready`, `question`, `result`, `lead`, `feedback` |
| `destination_type` | `internal`, `program`, `all_programs`, `lead_anchor`, `restart`, `discovery`, `question`, `external` (when applicable) |
| identity | `project_id`, `world_id`, `program_id`, `question_id` + `answer_id`, `cta_position`, `link_role`, `detail_section`, `feedback_fit` / `feedback_helpfulness` (option clicks), `entry_mode` (method cards) |

Never a label, answer text or field value. A refused third selection emits `ui_click` but no `*_selected`. Text inputs and the consent checkbox are not tracked as clicks.

### Control coverage (audited)
31 candidate-facing control positions on the V5 journey, **31 emit `ui_click`**:

| Screen | Controls |
|---|---|
| Landing | start CTA, start over (returning candidate) |
| Method | Worlds card, Projects card, Back |
| Discovery | world card (×9) / project card (×10), Continue, back to method |
| Ready | Continue (this screen has no on-screen Back control) |
| Question | answer option (each, incl. changing the choice), Continue, Back, Restart |
| Result | program CTA: hero primary, hero peers (near tie), secondary (alternative), weak direction, COLMAN-section program(s); contact: hero, COLMAN section, mobile sticky; try again: hero (insufficient), "not right"; all programs; detail toggles: why_result, more_to_know |
| Lead | submit (every press, valid or not) |
| Feedback | fit option, helpfulness option, submit |

## 4. Pilot feedback
**Placement (DEC-039):** the LAST normal content block of the result page — result hero, actions, why / warnings, secondary / comparison, COLMAN section, optional details, "not right?", lead form, all-programs link, disclaimer, **feedback**. The mobile sticky contact bar is an overlay after it in the tree, not content. Light, optional, never gating the result, the program links, contact or the lead form. Structured only (no free text).

| Result kind | Questions |
|---|---|
| recommended, near tie (incl. Tech precision results) | "עד כמה הכיוון שקיבלת מרגיש מתאים?" → `very_suitable` "מאוד מתאים", `quite_suitable` "די מתאים", `not_sure` "קשה לי לדעת", `not_suitable` "לא מתאים"; "האם התהליך עזר לצמצם את האפשרויות?" → `yes` "כן", `somewhat` "קצת", `no` "לא" |
| insufficient positive evidence | only "האם התהליך עזר להבין קצת יותר מה מתאים ומה פחות?" → `yes` / `somewhat` / `no` |

Submit is enabled once any question is answered; only answered questions are sent (`feedback_fit` is never sent empty). `feedback_version = "v1"`.

**Persistence (DEC-039):** Submit disables the button while saving and posts to the same-origin `/api/v5/feedback`. Only after a 2xx are `result_feedback_submit` emitted, the local memory written and "thanks" shown; on failure nothing is emitted or remembered, a short message ("לא הצלחנו לשמור את המשוב כרגע. אפשר לנסות שוב.") appears and the form stays for a retry. `result_feedback_submit` therefore means "structured feedback successfully persisted"; the attempt is visible as `ui_click` `feedback_submit`.

**Dedupe:** one submission per **result state** = journey id + selection + full answer sequence (ids only). Remembered under its own key `colman-studymatch:v5:result-feedback` (never the V5 journey payload); after a refresh the block shows "thanks" instead of the form. A new result state (try again → new `comparison_id`, or different answers) gets a fresh form. The redesigned result page has no Back control (a completed journey stays on its result), so in practice a new state comes from "try again". `result_feedback_view` fires once per result state per page load. Feedback never reaches the engine, routing, ranking or recommendation state.

## 5. Parameter dictionary
| Param | Meaning | Example |
|---|---|---|
| `flow_version` | Experience version | `v5` |
| `entry_mode` | Discovery method of the journey | `projects` |
| `comparison_id` | Journey id (one per started journey) | uuid |
| `project_id` / `project_ids` | One V5 project / canonical selection (sorted, pipe-joined) | `nike_launch` / `accounting_gap\|nike_launch` |
| `world_id` / `world_ids` | Same for worlds | `law_justice` |
| `selection_position` | Order of selection (1st/2nd = which opener comes first) | `2` |
| `selected_project_count` / `selected_world_count` | Size of the selection | `2` |
| `question_id`, `question_index`, `question_mode`, `question_kind` | Question identity / position / generic-vs-precision / scenario-focus-tiebreaker-reality | `V5-NIKE`, `1`, `generic`, `scenario` |
| `answer_id`, `is_neutral` | Option id; "none of these" | `B`, `false` |
| `result_kind` | `recommended`, `near_tie`, `insufficient_positive_evidence`, `v1_precision_result` | |
| `recommended_program`, `alternative_programs` | Program ids | `law` |
| `scored_answer_count`, `total_answer_count` | Answers that scored / all answers | `5`, `7` |
| `cta_position`, `link_role` | Where on the result / primary-alternative-peer | `hero`, `peer` |
| `element_id`, `element_type`, `screen_id`, `destination_type` | `ui_click` | see §3 |
| `feedback_fit`, `feedback_helpfulness`, `feedback_version` | Pilot feedback | `quite_suitable`, `yes`, `v1` |
| `error_type` | Lead error | `validation` |

Tech precision: `result_kind = v1_precision_result` (canonical in the app; the V3-style result page then shows it as a recommendation, near tie or "no strong fit").

## 6. KPI definitions and pilot targets
**Funnel**
- Landing → Start Rate = `studymatch_start` / `studymatch_landing_view`
- Discovery Completion Rate = `career_*_selection_completed` / `career_*_discovery_view`
- Questionnaire Completion Rate = `studymatch_result_view` / `comparison_started` (distinct `comparison_id`)

**Journey depth** — Median Questions to Result = median(`total_answer_count`) on `studymatch_result_view`; also average, P25, P75.

**Engine quality** — Recommended / Near Tie / Insufficient Evidence / Tech Precision Rate = share of `studymatch_result_view` by `result_kind` (`recommended`, `near_tie`, `insufficient_positive_evidence`, `v1_precision_result`).

**Result validation**
- Positive Result Fit Rate = (`very_suitable` + `quite_suitable`) / submissions with `feedback_fit` present — **target ≥ 70%**
- Clearly Wrong Result Rate = `not_suitable` / submissions with `feedback_fit` present — **target < 15%**
- Helpfulness Rate = (`yes` + `somewhat`) / submissions with `feedback_helpfulness` present; also "yes only"
- Feedback response rate = `result_feedback_submit` / `result_feedback_view`

**Conversion** (distinct `comparison_id`)
- Program Click Rate = journeys with `result_program_click` / journeys with `studymatch_result_view`
- Contact Intent Rate = journeys with `result_contact_click` / results
- Lead Form Start Rate = `lead_form_view` / results
- Lead Submit Rate = `lead_form_submit` / `lead_form_view`
- Lead Success Rate = `lead_form_success` / results

**Diagnostic (WATCH, not a failure threshold)** — Business Administration Recommendation Share = BA recommendations / all recommendations, overall and by opening project/world.

## 7. Discovery-quality reporting
For every project and world: selection count, selection share, pair-selection share, completion rate, median questions, result-kind distribution, recommended-program distribution, positive-fit rate, wrong-result rate, program CTR, contact intent, lead success. All ten V5 projects: `spotify_discovery`, `wolt_city_expansion`, `tiktok_behavior`, `duolingo_persistence`, `people_retention`, `people_change`, `ai_legal_case`, `accounting_gap`, `nike_launch`, `apple_store_space`.

Watch specifically: the People / Psychology area (TikTok, Duolingo, `people_change`, `people_retention` — Duolingo and `people_change` share their downstream questions, see DEC-037); Business Administration share overall and by opening project; Spotify precision-handoff rate and question count.

## 8. Experiment cohorts: self-selected vs externally assigned
- **Self-selected** — traffic enters `/v5` and chooses on `/v5/start`. Measures **preference / need-state** (which door candidates pick). Not a randomized comparison: do not compare Worlds vs Projects outcomes as if it were.
- **Externally assigned** — traffic is sent (outside StudyMatch) straight to `/v5/worlds` or `/v5/projects`. Measures **discovery strategy performance**. The app never fabricates `discovery_method_selected` for it.

Identification: a run is externally assigned when its session has journey events with `entry_mode` and **no** `discovery_method_selected` before `comparison_started`; self-selected otherwise (`docs/V5_PILOT_KPI_QUERIES.md` §18). Landing URLs / inbound UTMs of the assigned links are a stronger signal when available. No random router is part of this release.

## 9. Dashboard specification
**Page 1 — Pilot Overview.** Scorecards: Starts, Results, Completion Rate, Median Questions, Positive Fit %, Clearly Wrong %, Near Tie %, Insufficient %, Lead Success Rate. Charts: daily Starts / Results; `result_kind` distribution; `recommended_program` distribution; `feedback_fit` distribution.

**Page 2 — Discovery Performance.** Worlds vs Projects. Self-selected: selection share. Assigned: completion, questions, positive fit, lead success. Tables by `project_id`, `world_id`.

**Page 3 — Engine Quality.** `result_kind` by door; `recommended_program` by door; `feedback_fit` by `recommended_program`; near tie and insufficient by project/world; BA recommendation share; Tech precision share.

**Page 4 — Funnel & UX.** Landing → Start → Method → Discovery → Question 1 → Result → Program Click → Contact → Lead Success (semantic events). Drop-off by screen and `question_index`. `ui_click` only as secondary UX evidence.

**Page 5 — Result & Conversion.** Program click rate by `recommended_program`, `result_kind`, `entry_mode`, door; contact intent; lead submit; lead success; CTA performance by `cta_position`, `link_role`.

**Page 6 — Pilot Feedback.** Response rate; `feedback_fit`; `feedback_helpfulness`; by `entry_mode`, project/world, `recommended_program`, `result_kind`, number of questions.

Source: the GA4 BigQuery export (queries in `docs/V5_PILOT_KPI_QUERIES.md`, ideally materialised as the `v_studymatch_v5_events` view). GA4 UI explorations only for the dimensions registered as custom definitions.

## 10. Data-quality QA checklist
- [ ] GTM container loaded on `/v5` (`NEXT_PUBLIC_GTM_ID` set); `gtm.js` request visible.
- [ ] GTM Preview: each event in the matrix reaches the GA4 tag with `flow_version = v5`.
- [ ] GA4 DebugView: `studymatch_result_view` shows `result_kind`, `comparison_id`, `entry_mode`.
- [ ] No event contains a name, phone, consent text, button label or answer text (the browser suite checks this on every release).
- [ ] Outbound links carry `utm_source=study_match&utm_medium=questionaire&utm_campaign=ai_tools`; GA4 on colman.ac.il attributes those visits to `study_match / questionaire`.
- [ ] Inbound UTMs on `/v5?utm_…` appear on journey events.
- [ ] Assigned links (`/v5/worlds`, `/v5/projects`) produce no `discovery_method_selected`.
- [ ] BigQuery: `comparison_id` joins result, feedback and lead events; `result_feedback_submit` ≤ 1 per `comparison_id` and answer state.
- [ ] Lead sheet: `source = colman_studymatch_v5` rows match `lead_form_success` counts (allowing dedupe).

## 11. Privacy rules (no PII)
- Ids, counts, booleans and canonical values only. Never names, phone, consent text, button labels, answer texts or free text.
- Structural guard: only documented parameter names pass `sanitizeParams`; the lead form's analytics callbacks receive no values.
- Feedback is structured only (no free-text field in v1).
- `comparison_id` is a random journey id, not a person id.
- Lead data goes only to the same-origin lead API → n8n → the lead sheet, never to analytics.

## 12. n8n / Google Sheet
Verified read-only (this release): the "Colman Webhook for question engine" workflow is active; `v5` is whitelisted; `source = colman_studymatch_<version>`; `entry_mode` is normalised and stored; `selected_project_ids` is stored as sent (V5 ids accepted); `selected_world_ids` is stored; the duplicate check is in place. The sheet holds a real V5 worlds row stored as `v5 / colman_studymatch_v5 / worlds`; no test rows exist. **n8n/Sheet already V5-compatible — verified, no change.** **Feedback persistence (DEC-039).** Feedback IS persisted: GA4 / BigQuery (`result_feedback_submit`) are the KPI source of truth; the **Feedback** tab of the same spreadsheet is the durable raw response log / QA backup, with the same canonical values and `comparison_id`.
- Flow: browser → `POST /api/v5/feedback` (strict validation; the raw result-state key is hashed with SHA-256) → server-only `FEEDBACK_WEBHOOK_URL` → n8n workflow "Colman StudyMatch Feedback" (webhook path `colman-studymatch-v5-feedback`): normalise / validate → look up `feedback_key_hash` → duplicate: `{ok:true, deduped:true}`, else append a row and `{ok:true, deduped:false}`; an invalid payload gets 400. Same Google credential as the lead workflow.
- Columns (in order): `submitted_at` (n8n, ISO), `feedback_key_hash`, `source` (`colman_studymatch_v5_feedback`), `feedback_version`, `flow_version`, `entry_mode`, `comparison_id`, `result_kind`, `recommended_program`, `alternative_programs`, `selected_project_ids`, `selected_world_ids`, `scored_answer_count`, `total_answer_count`, `feedback_fit`, `feedback_helpfulness` (lists are sorted, pipe-joined; fit is blank for insufficient evidence or when unanswered).
- Never stored: names, phone, consent, labels, question or answer text, the raw answer sequence, user agent, IP.
- Environment: `FEEDBACK_WEBHOOK_URL` (server-only, no `NEXT_PUBLIC_`) must be set in Vercel (Production and Preview). If it is empty, the API answers 503 and the block shows the retry message: feedback is never reported saved when it was not.
