# Analytics Plan V1

## Principle
Measurement is part of the product, not an afterthought. Every major step is observable in GA4 and analyzable in BigQuery.

**Analytics observes the product. It never participates in scoring, routing, result selection, persistence validation, or any product state decision.** The application works normally with no GTM/GA4 container installed, and a failure inside analytics is swallowed.

## How it is built
| Piece | Where | Role |
|---|---|---|
| Vocabulary | `src/analytics/events.ts` | Event and parameter names (the contract). |
| Transport | `src/analytics/track.ts` | `trackEvent()` pushes to `window.dataLayer` (created on demand). Only documented parameter names with scalar values are kept, so free text can never reach the dataLayer. |
| Context builders | `src/analytics/context.ts` | Canonical ordering, comparison context, result metadata, UTM parsing. |
| Funnel tracker | `src/analytics/funnelTracker.ts` | Derives events from the product's own reducer transitions and owns the session context. |
| View-once | `src/analytics/viewOnce.ts` | `IntersectionObserver`-based "actually seen" detection. |
| React binding | `src/ui/analytics/` | `useAnalytics()` helpers; components report **what happened** and never build payloads. |

Events are produced by **replaying dispatched actions through the same pure reducer the product uses**. A rejected action (double tap, stale answer, invalid option) changes no state, so it produces no event. Restoring state after a refresh is never an action, so it produces no event either.

## Development inspection
`window.dataLayer` holds every emitted payload. In `next dev` each payload is also logged with `console.debug("[analytics]", ...)`. Nothing in production depends on the console output, and no network call is made.

## Parameter conventions
- All values are **stable internal ids or scalars**: program ids (`computer_science`, `data_science`, `management_information_systems`), question/answer/branch ids, numbers, booleans. **No candidate-facing text and no answer labels are ever sent.**
- `is_tie_breaker` is sent as a boolean (`true`/`false`); GTM/GA4 may surface it as the strings `"true"`/`"false"`.
- Parameters that do not apply are **omitted**, not sent empty (e.g. `recommended_program` for `no_strong_fit`).

### Canonical ordering
The same set always yields the same value, whatever the selection order and whichever program won:
- `program_1`, `program_2`, `program_3`: the selected programs in **alphabetical id order** (`computer_science` < `data_science` < `management_information_systems`). They are not selection order.
- `comparison_cluster`: all selected ids joined with `|` in that order, e.g. `computer_science|data_science|management_information_systems`.
- `main_decision_pair` and `branch_id`: the two programs joined with `|` in alphabetical order, e.g. `computer_science|data_science`. The winner is **not** encoded here; it is `recommended_program`.

### Common comparison context
Added to (almost) every event: `comparison_id` (only while a comparison is running), `program_1..3`, `selected_program_count`, `comparison_cluster` (when at least one program is selected), and `utm_*` (when present).

### Parameters
| Parameter | Meaning |
|---|---|
| `comparison_id` | UUID of one actual comparison run (see lifecycle). Analytical key only; never product or scoring state. |
| `program_id` | The single program an event is about (`degree_selected`, `change_program`, `reality_check_view`, `secondary_program_view`). |
| `program_1..3`, `selected_program_count`, `comparison_cluster` | Selected programs (canonical order). |
| `recommended_program` | The final engine recommendation. Present only when the engine has a best-fit program. |
| `secondary_program` | The engine's second program, when it exists. |
| `main_decision_pair` | Canonical pair of the top two programs. Always present on a completed result. |
| `fit_classification` | Engine class of the top program: `strong_fit`, `good_fit`, `consider_carefully`, `no_strong_fit`. |
| `result_kind` | `recommended`, `near_tie` or `no_strong_fit`. Needed because `fit_classification` alone cannot show near ties. |
| `leading_program` | On `question_answer`: the top-ranked program **after that accepted answer**. Analytical metadata, **not** the recommendation. |
| `question_id`, `question_type`, `answer_id`, `question_index` | Question identity; `question_index` is 1-based within the run. |
| `is_tie_breaker`, `branch_id` | Tie-breaker flag; canonical pair of the locked branch (absent on the three opening questions). |
| `questions_answered` | Number of accepted answers at completion (or at restart). |
| `mirror_response` | `yes` or `no`. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | Acquisition context (see lifecycle). |

## Events
Status **wired** means emitted today; **future** means the vocabulary exists but no UI action does yet (none are faked).

| Event | Fired when | Notable parameters | Status |
|---|---|---|---|
| `degree_compare_view` | The program-selection screen is shown. Once per mounted view; re-renders and Strict Mode effect re-runs do not repeat it. Navigating away and back, or a page refresh on it, is a new view. | context (no `comparison_id`) | wired |
| `degree_selected` | A program becomes selected. | `program_id`, context after the action | wired |
| `change_program` | A selected program is removed. Not emitted for refresh restoration. | `program_id`, context after the action | wired |
| `comparison_started` | The candidate explicitly starts a valid 2 or 3 program comparison. Creates `comparison_id`. | full context | wired |
| `question_view` | A question is exposed (see semantics below). | `question_id`, `question_type`, `question_index`, `is_tie_breaker`, `branch_id` | wired |
| `question_answer` | The reducer **accepts** an answer. Never on double taps, stale questions or invalid options. | `question_id`, `question_type`, `answer_id`, `question_index`, `is_tie_breaker`, `branch_id`, `leading_program` | wired |
| `adaptive_branch_selected` | The pair branch becomes determined (right after the third opening answer). Once per determination; not repeated for each branch question. | `branch_id` | wired |
| `tie_breaker_view` | The tie-breaker is displayed. Emitted **in addition to** its `question_view`. At most one per comparison. | as `question_view` | wired |
| `comparison_completed` | The engine reaches a result. | `questions_answered`, `recommended_program`\*, `secondary_program`\*, `main_decision_pair`, `fit_classification`, `result_kind` | wired |
| `recommended_program` | Only when the engine has a best-fit program (so never for `no_strong_fit`). A near tie may emit it; `result_kind=near_tie` marks the ambiguity. | same as `comparison_completed` | wired |
| `mirror_response` | The candidate answers the mirror ("זה נשמע כמוכם?"). Presentation state only; it never changes the result. | `mirror_response`, result metadata | wired |
| `secondary_program_view` | The secondary-program section is actually exposed (IntersectionObserver), once per completed result. | `program_id` (the secondary program), result metadata | wired |
| `reality_check_view` | A reality-check card is actually exposed, once per completed result and program. | `program_id`, result metadata | wired |
| `admission_click` | Click on the official admissions link, before the browser follows it. | result metadata | wired |
| `advisor_cta_click` | Click on the advisor link. The CTA exists only when `NEXT_PUBLIC_ADVISOR_URL` is configured. | result metadata | wired |
| `restart_comparison` | The candidate explicitly restarts from the questions or the result. Not emitted for an already empty state. | context of the abandoned run, `questions_answered` | wired |
| `curriculum_click`, `career_click` | No such interaction exists (learn and career content is static). | | **future** |
| `whatsapp_click`, `lead_submit`, `comparison_share` | CRM, WhatsApp and sharing are not built. | | **future** |

\* present only when the engine provides them.

### Focused comparison
The result page's "focused comparison of the top two" action is represented by **`restart_comparison`** (context of the abandoned run). The pair it preselects is programmatic, not a candidate choice, so it emits no `degree_selected`; the next explicit start emits `comparison_started` with the narrower selection and a new `comparison_id`.

### `question_view` semantics
One event per **logical exposure** of a displayed question.
- Re-renders and Strict Mode effect re-runs do not repeat it.
- Showing a question again after **Back** is a new exposure and emits again.
- A **refresh** that restores the exact same displayed question does not emit again (the last exposure is remembered in the analytics session context). A refresh that lands on a different question (or after a lost session context) emits normally.

### Result-page "view once"
`secondary_program_view` and `reality_check_view` fire when the element is actually visible, not when the result mounted. They are deduplicated in memory, so a refresh while the section is in view counts as a new exposure. If the result is re-completed after Back, the new result counts as a new exposure. Browsers without `IntersectionObserver` emit nothing rather than faking an exposure.

## `comparison_id` lifecycle
- A UUID is created when a valid comparison is explicitly started (`comparison_started`). It exists exactly while the comparison is running (answering or completed).
- All later events of that run carry it. A **refresh** reuses it (stored in the analytics session context).
- It ends on **restart**, on going **Back** from the first question to program selection, or when the selection changes. The next explicit start creates a new id, so the same user or session can run several comparisons that BigQuery can separate.
- If a running comparison is restored without a stored id (for example after closing the browser, since the session context is per browser session), a new id is created silently: no `comparison_started` is emitted, and that run's events will not have a matching start event.
- It is never used by the product, only emitted.

## UTM lifecycle
- On first load the tracker reads `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` from the URL (trimmed, control characters removed, capped at 100 characters, empty values dropped).
- The **first non-empty UTM set** of the browser session is kept as a unit and added to every event. Later URLs carrying different UTMs do not replace it. It survives internal navigation and refresh.
- Stored in `sessionStorage` under `colman-studymatch:analytics` as a versioned record `{ version, comparison_id, utm, last_question_view }`. This is separate from the durable comparison payload `{ version, selectedProgramIds, answers }`, which never contains UTMs, scores, results or analytics metadata. The engine stays reproducible from product state alone.
- No PII is collected or stored.

## Querying the funnel in GA4 BigQuery
- Register the parameters you need as GA4 custom dimensions (all are plain event parameters; the BigQuery export contains them in `event_params`).
- Group runs by `comparison_id`; use `comparison_cluster` for demand by pair or triplet, `main_decision_pair` + `recommended_program` for who wins within a pair, `result_kind` for near-tie and no-fit rates.
- Abandonment: compare the last `question_index` per `comparison_id` with `comparison_completed`.
- Which questions change the leader: order `question_answer` events by `question_index` within a `comparison_id` and compare `leading_program` with its `LAG(leading_program)` (the first answer has no previous value).
- After **Back**, a comparison can emit more than one `comparison_completed`/`recommended_program`/`question_answer` for the same index. Use the last `comparison_completed` per `comparison_id` for the final result.

## Questions the data should answer
- Which program pairs/triplets generate the most comparison demand? (`comparison_started` by `comparison_cluster`)
- Which questions most often change the leading recommendation? (`leading_program` over `question_answer`)
- Where do candidates abandon the experience? (`question_view` / `question_answer` vs `comparison_completed` per `comparison_id`)
- Which program tends to win within each pair? (`main_decision_pair` x `recommended_program`)
- How frequently do near-ties and no-strong-fit outcomes occur? (`result_kind`)
- Which result sections are most engaged with? (`mirror_response`, `secondary_program_view`, `reality_check_view`, CTA clicks)
- Which comparison pairs generate the highest advisor/lead conversion? (`advisor_cta_click` now; `lead_submit` when CRM exists)
- Does recommendation alignment eventually correlate with enrollment? (needs CRM/enrollment data joined on `comparison_id` later)

## Known gaps and notes
- `reality_check_view` carries `program_id` but not a check id. Current data has one check per program, so this is sufficient; add a `check_id` parameter if a program ever has several.
- Consent management and production GTM container configuration are out of scope here; events are pushed to the dataLayer and GTM decides what to forward.
