# GTM / GA4 implementation — StudyMatch V5 pilot

DEC-038. A mechanical build plan for Google Tag Manager and GA4, from the app's measurement contract (`docs/analytics/v5_event_matrix.json`, human version `docs/V5_PILOT_MEASUREMENT.md`). **Nothing here is configured yet.** It must not be marked "configured" until it has been built in the container and verified in GTM Preview / GA4 DebugView.

## 0. Preconditions (blocking)
1. **A GTM container must load on `/v5`.** The app never loaded GTM before this release. `src/ui/analytics/GtmLoader.tsx` now renders the standard GTM snippet **only on `/v5` pages and only when `NEXT_PUBLIC_GTM_ID` is set** (e.g. `GTM-ABC1234`, validated). Set it in Vercel (Preview first, then Production) and redeploy. The container id is public by design, not a secret.
2. **Which container?** No COLMAN / StudyMatch container exists in the GTM accounts available to us (ThinkUser, Stratasys; checked read-only). Use COLMAN's container (or a dedicated StudyMatch container) and a GA4 property agreed with COLMAN.
3. **Embedding.** If StudyMatch is shown inside an iframe on colman.ac.il, the parent page's GTM cannot see the iframe's `dataLayer`; the container must load inside StudyMatch (as above).
4. **Do not assume the container is empty.** Before adding anything, export the current container version and check for existing triggers on `{{Event}}` regexes, existing variables with the same names, and existing GA4 config tags.

## 1. Data Layer Variables (Version 2, default value `undefined`)
Create one DLV per parameter. Name `DLV - <param>`, Data Layer Variable Name `<param>`.

| Variable | Notes |
|---|---|
| `DLV - flow_version` | Always present (`v5`). Used in the trigger condition. |
| `DLV - entry_mode` | `worlds` \| `projects` |
| `DLV - comparison_id` | Journey id (high cardinality: BigQuery, not a GA4 custom dimension) |
| `DLV - project_id` | One V5 project |
| `DLV - project_ids` | Canonical selection (sorted, pipe-joined) |
| `DLV - world_id` | One world |
| `DLV - world_ids` | Canonical selection |
| `DLV - selection_position` | 1 \| 2 |
| `DLV - selected_project_count` | |
| `DLV - selected_world_count` | |
| `DLV - selection_count` | On `*_selection_completed` |
| `DLV - project_count_available` | On `career_project_discovery_view` (10) |
| `DLV - world_count_available` | On `career_world_discovery_view` (9) |
| `DLV - question_id` | |
| `DLV - answer_id` | Option id only |
| `DLV - question_index` | |
| `DLV - question_mode` | `generic` \| `precision` |
| `DLV - question_kind` | `scenario` \| `focus` \| `tiebreaker` \| `reality_check` |
| `DLV - is_neutral` | boolean |
| `DLV - is_generated_focus` | boolean |
| `DLV - focus_program_count` | |
| `DLV - questions_answered` | On completion / back / restart |
| `DLV - module_id` | On `precision_module_handoff` |
| `DLV - seeded_answer_count` | On `precision_module_handoff` |
| `DLV - result_kind` | `recommended` \| `near_tie` \| `insufficient_positive_evidence` \| `v1_precision_result` |
| `DLV - recommended_program` | Program id |
| `DLV - alternative_programs` | Canonical list |
| `DLV - scored_answer_count` | |
| `DLV - total_answer_count` | |
| `DLV - program_id` | On program clicks / reality checks / secondary view |
| `DLV - cta_position` | |
| `DLV - link_role` | |
| `DLV - detail_section` | |
| `DLV - element_id` | `ui_click` |
| `DLV - element_type` | `ui_click` |
| `DLV - screen_id` | `ui_click` |
| `DLV - destination_type` | `ui_click` |
| `DLV - feedback_fit` | |
| `DLV - feedback_helpfulness` | |
| `DLV - feedback_version` | `v1` |
| `DLV - error_type` | Lead errors |
| `DLV - utm_source` … `DLV - utm_term` | Inbound acquisition on events. **Optional for GA4** (GA4 attributes sessions from the page URL); keep for BigQuery only if the 25-parameter limit allows. |

## 2. Trigger / tag architecture

### Recommended: one allow-listed Custom Event trigger + one GA4 Event tag
- **Trigger `CE - StudyMatch V5 events`** (Custom Event, *Use regex matching*), Event name:
  ```
  ^(studymatch_landing_view|studymatch_start|discovery_method_view|discovery_method_selected|career_project_discovery_view|career_project_selected|career_project_deselected|career_project_selection_completed|career_world_discovery_view|career_world_selected|career_world_deselected|career_world_selection_completed|comparison_started|precision_module_handoff|question_view|question_continue|question_answer|discovery_back|comparison_completed|recommended_program|studymatch_result_view|result_program_click|result_contact_click|result_all_programs_click|result_detail_expand|secondary_program_view|reality_check_view|result_feedback_view|result_feedback_submit|lead_form_view|lead_form_submit|lead_form_success|lead_form_error|restart_comparison|ui_click)$
  ```
  **plus** condition `DLV - flow_version` *equals* `v5`.
  The anchored, exact allow-list and the version condition mean unrelated site `dataLayer` events can never match (even if another script pushes an event with a similar name, it has no `flow_version = v5`).
- **Tag `GA4 - StudyMatch V5 - Event`** (Google Analytics: GA4 Event), Measurement ID = the agreed property, Event Name = `{{Event}}`, Event Parameters = the DLVs of §1 (parameter name = DLV name without the prefix). Undefined DLVs are not sent.
- **Safe** when the container has no other trigger matching these exact names with `flow_version = v5` (check the export). It keeps the build maintainable: a new event only needs the regex and, if new parameters appear, new DLVs.

### Fallback: one trigger + tag per event family
Use when the container already has a generic `{{Event}}` GA4 tag, when parameter limits per event are tight, or when governance requires explicit per-event configuration:

| Family | Events | Parameters to map |
|---|---|---|
| Funnel | landing_view, start, method_view, method_selected, comparison_started, restart_comparison | flow_version, entry_mode, comparison_id, questions_answered |
| Discovery | career_project_*, career_world_* | + project_id/ids, world_id/ids, selection_position, selected_*_count, selection_count, *_count_available |
| Questions | question_view, question_continue, question_answer, discovery_back, precision_module_handoff | + question_id, question_index, question_mode, question_kind, answer_id, is_neutral, module_id, seeded_answer_count, questions_answered |
| Result | comparison_completed, recommended_program, studymatch_result_view, result_detail_expand, secondary_program_view, reality_check_view | + result_kind, recommended_program, alternative_programs, scored/total_answer_count, detail_section, program_id |
| Conversion | result_program_click, result_contact_click, result_all_programs_click, lead_form_* | + program_id, link_role, cta_position, error_type |
| Feedback | result_feedback_view, result_feedback_submit | + feedback_fit, feedback_helpfulness, feedback_version |
| UX | ui_click | + element_id, element_type, screen_id, destination_type, contextual ids |

Each family trigger uses the same exact-name regex for its events + `flow_version equals v5`.

### GA4 limits to respect
- **25 parameters per event** (custom). The richest V5 event (`ui_click` on a result screen) carries ~24 including all five inbound `utm_*`. If needed, drop `utm_*` from the GA4 tag (GA4 already attributes acquisition from the page URL) and keep them for BigQuery only via a separate mechanism, or move `ui_click` to the family tag with a reduced set.
- Parameter values ≤ 100 characters (all V5 values are short ids).
- Event names are ≤ 40 characters and already GA4-safe (snake_case).

## 3. GA4 custom definitions (prioritised)
**A. Parameters we SEND to GA4** — everything in §1 (the GA4 tag forwards them; raw values are always available in the BigQuery export).

**B. Register as event-scoped custom dimensions (UI reporting)** — in priority order; keep within the property's 50 event-scoped dimensions:
1. `flow_version`
2. `entry_mode`
3. `result_kind`
4. `recommended_program`
5. `project_id`
6. `world_id`
7. `feedback_fit`
8. `feedback_helpfulness`
9. `cta_position`
10. `link_role`
11. `screen_id`
12. `element_id`
13. `question_id`
14. `project_ids` (pairs; medium cardinality)
15. `world_ids`
Custom **metrics** (optional): `total_answer_count`, `question_index` (for averages in the UI).

**C. No registration needed (BigQuery `event_params` only)** — `comparison_id` (high cardinality, would become "(other)"), `answer_id`, `alternative_programs`, `scored_answer_count`, `selection_position`, `question_mode`, `question_kind`, `is_neutral`, `is_generated_focus`, `focus_program_count`, `module_id`, `seeded_answer_count`, `detail_section`, `destination_type`, `element_type`, `feedback_version`, `error_type`, `questions_answered`, `selection_count`, `*_count_available`, inbound `utm_*`.

**Conversions / key events (suggested):** `lead_form_success` (primary), `result_program_click`, `result_feedback_submit`.

## 4. Verification steps (to mark anything "CONFIGURED")
1. GTM Preview on a Vercel preview of `/v5` with the container id set: every event in the matrix fires the GA4 tag once, with `flow_version = v5`.
2. A non-StudyMatch `dataLayer.push({event: "ui_click"})` without `flow_version` does **not** fire the tag.
3. GA4 DebugView shows the parameters of §3B on `studymatch_result_view`, `result_feedback_submit`, `ui_click`.
4. After 24–48 h, the BigQuery export contains the events (`docs/V5_PILOT_KPI_QUERIES.md` §0 sanity query).
5. On colman.ac.il's GA4, visits from outbound links appear as `study_match / questionaire`, campaign `ai_tools`.

## 5. Items that require GTM / GA4 access (not done)
- Choosing / creating the container and GA4 property; setting `NEXT_PUBLIC_GTM_ID` in Vercel.
- Creating the DLVs, trigger(s) and GA4 tag(s); Preview / publish.
- Registering custom dimensions / metrics and key events.
- Enabling / confirming the GA4 → BigQuery export and its dataset name.
- Building the dashboard (`docs/V5_PILOT_MEASUREMENT.md` §9).
