# Decisions Log

## DEC-001 — GitHub is the source of truth
Product, UX, scoring, and architecture decisions must be reflected in repository docs/issues, not left only in chat.

## DEC-002 — Deterministic fit engine for V1
V1 uses transparent weighted rules/vector similarity. No ML model is required for recommendation.

## DEC-003 — LLM explains; it does not decide
The fit engine returns recommendation, evidence, trade-offs, and warnings. An LLM may turn these into natural language but cannot override the decision.

## DEC-004 — No fake match percentages
Do not show outputs such as `87% match` unless later validated with a defensible measurement model. Use qualitative fit classes instead.

## DEC-005 — Adaptive question flow
Candidates should answer roughly 5–7 questions, not a fixed long quiz. After common opening questions, choose pair-specific questions that best separate the remaining leading programs.

## DEC-006 — The result must explain the decision
The output must show why the recommendation was made using the candidate's answers, plus the primary trade-off with the second program.

## DEC-007 — Best Fit and Main Decision are separate outputs
The product can say `Best Fit: Data Science` while separately stating `Your real decision is Data Science vs Computer Science`.

## DEC-008 — Fit is separate from admissions
Academic admission requirements may be checked later, but eligibility must never alter the fit recommendation score.

## DEC-009 — Interests > perceived ability
Statements such as `I am not good at math` should not automatically disqualify a program. They may trigger a reality check when the candidate's interests otherwise fit strongly.

## DEC-010 — Allow ambiguity and no-fit outcomes
Do not force a winner. The engine must support near-ties and `no strong fit`, and may recommend exploring other programs.

## DEC-011 — Value before lead capture
The result is shown before asking for contact details. Advisor CTAs should be contextual to the candidate's actual comparison.

## DEC-012 — Structured official content
Program facts are curated from official `colman.ac.il` and `academy.org.il` sources into structured data. Runtime recommendation should not depend on live scraping.

## DEC-013 — Pilot first
Validate the engine on Computer Science, Data Science, and Management Information Systems before expanding to all programs.

## DEC-014 — Application stack and module boundaries
Status: accepted — approved in the THI-5 review (PR #3).

- Web app: Next.js (App Router), React, TypeScript (strict), Tailwind CSS, pnpm.
- Tests: Vitest for pure modules.
- Hebrew-first: the document is `lang="he" dir="rtl"` by default.
- Business logic lives in framework-free modules (`src/engine`, `src/flow`, `src/data`, `src/analytics`). The UI only renders and dispatches. ESLint import rules enforce this.

Rationale: the engine must be deterministic and unit-testable in isolation (DEC-002, DEC-003). Next.js leaves room for static export (embedding) and for server routes later (lead/CRM handoff) without changing the engine.

## DEC-015 — Candidate-facing program names
Status: accepted — decided in the THI-6 review (PR #4).

| Program | Candidate-facing short name | Also preserved |
|---|---|---|
| `computer_science` | `מדעי המחשב` | — |
| `data_science` | `מדע הנתונים` | `מדעי הנתונים` (official page-title wording), stored as an alias |
| `management_information_systems` | `ניהול מערכות מידע` | Qualifier `דו-חוגי עם מנהל עסקים` |

The MIS qualifier must be clearly surfaced wherever candidates see the program name (subtitle or qualifier), never hidden. The official program is a double major with Business Administration.

Data: `program_name_he`, `program_name_aliases_he`, `program_qualifier_he` in `src/data/content/facts/` (see `docs/PROGRAM_DATA.md`).

## DEC-016 — CS/DS shared first year is explanatory, not scoring
Status: accepted — decided in the THI-6 review (PR #4).

Official COLMAN content states that Computer Science and Data Science share first-year exposure and that students can choose between them afterwards. When the main decision is CS vs DS, the result experience may use this as decision reassurance or explanatory content. It must **not** change fit scores, ranking, or fit classification.

Data: the sourced `program_notes` entry with topic `shared_first_year`, in the facts layer. The engine does not read the facts layer.

## DEC-017 — Admissions carry a machine-readable usage status
Status: accepted — decided in the THI-6 review (PR #4).

Each program's admissions record has a `usage_status`:
- `usable_as_published`: rules may be used as currently published, subject to `last_reviewed`.
- `manual_confirmation_required`: rules must be confirmed manually with COLMAN before any automated eligibility decision. A `usage_status_reason_en` is required.

`management_information_systems` is `manual_confirmation_required`: its published conditional-admission wording is internally ambiguous. This status is for admission-check features only and never affects fit or scoring (DEC-008).

## DEC-018 — Fit, near-tie, and reality-check thresholds
Status: **accepted for V1 pilot** — validated through THI-7 calibration, THI-8 question-bank revalidation, exhaustive path tests, and THI-12 acceptance QA.

**What this acceptance means.** These thresholds are the **approved operational baseline for the V1 pilot**. They are **not psychometrically or scientifically validated thresholds**: they are transparent product heuristics, calibrated against the sanity personas and the exhaustive answer-path distributions (`docs/SCORING.md`), not against real-candidate outcomes. They should be **revisited after collecting real-candidate behavioural and outcome data**. Accepting DEC-018 now does **not** mean tuning them before the pilot: the values and the reality-check rules below stay exactly as they are for the pilot.

History: proposed in THI-7 as calibration seeds (validated against synthetic pair-question signals); **THI-8 revalidated them against the real question bank (DEC-021) and kept the fit and near-tie thresholds unchanged** (`docs/SCORING.md` → "THI-8 revalidation"); the reality-check rule gained an explicit-negative trigger in THI-8 (below); THI-12 acceptance QA exercised them end to end with no change needed.

All values apply to `normalized_fit` (raw fit / attainable ideal):
- `strong_fit` ≥ 0.80; `good_fit` ≥ 0.65; `consider_carefully` ≥ 0.50; `no_strong_fit` < 0.50.
- Near tie: top-two gap < 0.05. Computed always, but it never overrides `no_strong_fit`.
- Reality check: fires for a top-two program when at least one related dimension has attainable variation and is **materially low**. Either trigger counts:
  - `net_negative_bottom_third`: `C[d] < min + (max − min) / 3` **and** `C[d] < 0`. The net-negative condition was proposed in THI-7: without it, simply not choosing a dimension's options triggered warnings.
  - `explicit_negative_answer`: the candidate **explicitly chose an option with a negative signal** on that dimension (e.g. Q3 = 1–2 on `math_affinity`), even if other answers bring the aggregate `C[d]` back to zero or above. Added in THI-8 after a low-math DS candidate (Q3 = 1) got no math warning because DS answers' small math signals cancelled it.

  Positive or neutral answers alone never trigger. Checks are warnings only and never change fit, ranking, or classification.

Calibration rationale, the sanity-case table, the answer-space distribution, and open findings are in `docs/SCORING.md`. Personas A–D and the mixed, weak, low-math, and near-tie cases validate these values; they were not used to fit them.

## DEC-019 — Scoring formula and normalization
Status: accepted — approved before THI-7 implementation.

- Candidate vector: `C[d] = Σ question_weight × chosen_option_signal[d]`, using the documented weight classes.
- `raw_fit(P) = Σ_d C[d] × P[d]`, with equal dimension weights.
- `ideal(P) = Σ per question max(option contribution to P)`, over the exact questions, options, weights, and signals the candidate saw.
- `normalized_fit(P) = clamp(raw_fit / ideal, 0, 1)`. An ideal ≤ 0 means no usable fit signal.
- `normalized_fit` drives ranking, classification, and near-tie logic; `raw_fit` is diagnostics only. Neither is ever shown as a percentage (DEC-004).
- `no_strong_fit` ⇒ `bestFitProgram = null`. The ranking and top two are retained internally (DEC-010).
- Evidence keeps every answered question, including answers against #1. The trade-off is structured, with signed per-dimension contributions `C[d] × P[d] / ideal(P)`. The engine writes no candidate-facing prose.
- Reality checks never modify fit (DEC-009).

## DEC-020 — Math tolerance (Q3) signal mapping
Status: accepted — decided before THI-7 implementation.

The 1–5 math-tolerance answer maps to `math_affinity = answer − 3` (1 → −2, 2 → −1, 3 → 0, 4 → +1, 5 → +2), weighted as `self_rating` (1.5). It is a fit signal, not a gate. Low math tolerance may lower fit or trigger a reality check, but it never automatically eliminates CS or DS. Implemented as `mathToleranceSignal()` in `src/engine`.

## DEC-021 — V1 question bank and adaptive flow
Status: accepted — approved in the THI-8 plan review.

**Question bank:** `src/data/content/question_bank.json`. Explicit signals, validated at load, and tested against the table in `docs/QUESTION_ENGINE.md`.
- Opening questions Q1–Q3 as documented (Q3 per DEC-020).
- Three **curated pair branches** (CS/DS, CS/MIS, DS/MIS), each with three pair questions using the approved types and signals. These are V1 overrides, not a requirement that every program pair be authored (DEC-023).
- Every pair question has one neutral option, "neither of these really appeals to me", with no signal. This is the explicit neutral information that makes a genuine `no_strong_fit` possible without adding a question.
- One tie-breaker per branch, from the additional question bank:
  - CS/DS: logical certainty vs patterns under uncertainty;
  - CS/MIS: write code vs define what it should do;
  - DS/MIS: better model vs better business decision.

**Routing:**
1. Ask Q1–Q3.
2. Score, then lock the pair branch from the current top two. With two programs selected, the pair is fixed.
3. Ask pair-1 and pair-2.
4. **Stop at 5** if both favour the same program, neither is "neither", and the result is not a near tie.
5. Otherwise ask pair-3 (question 6). **Stop** if the result is `no_strong_fit` or not a near tie.
6. Otherwise ask **one** tie-breaker (question 7) for the **current** top two, even if that pair changed during the branch. Then **stop regardless**: a genuinely close result is a valid outcome.

Every path ends in 5–7 questions. A branch never asks about a program that isn't selected, and no tie-breaker is asked for `no_strong_fit`. Implemented as `nextAdaptiveStep()` in `src/engine` and `nextComparisonStep()` in `src/flow`.

## DEC-022 — Classify only from expressed preferences
Status: accepted — decided in the THI-8 plan review.

A candidate is classified only from preferences they actually express; the engine never infers hidden aversions it never asked about.
- Persona D reaches `no_strong_fit` by explicitly rejecting the offered directions ("neither").
- A candidate who repeatedly chooses MIS-style answers but is uncomfortable with coding, math or data (Persona D′) may be a legitimate MIS fit, with reality checks.

No additional common programming/data-interest question is added in V1. `consider_carefully` is also a valid outcome; weak or mixed candidates are not forced into `no_strong_fit`.

## DEC-023 — Question-selection architecture: curated overrides now, scalable selector later
Status: accepted as the intended direction (THI-8 review). The generic selector is **not implemented** in V1.

**Current V1:**
- Curated pair branches cover CS/DS, CS/MIS and DS/MIS.
- Pair questions are config/data (`question_bank.json`), not hard-coded program conditionals.
- The bank schema allows **zero or more** curated branches. Only the three pilot pairs are required, and that is a separate V1 check (`V1_PILOT_PAIRS`), not derived from every combination of `PROGRAM_IDS`. Adding a program therefore does **not** require authoring N × (N − 1) / 2 pair branches.
- An option's `favours` field is **V1 routing metadata** for the stop rule. Scoring never depends on it; the durable scoring signal is the dimension vector.

**Future scalable selector** (when programs are added):
- Program profiles remain dimension vectors, and question options remain dimension signals.
- When no curated override exists, the selector identifies the dimensions that most differentiate the current leading programs and picks the highest-discrimination question from a generic question bank.
- Curated pair branches stay as **optional overrides** for especially important or common comparisons.

```
current candidate state → current leading programs → most discriminating dimensions → best available question
                                                  ↘ curated pair override (optional)
```

## DEC-024 — Question UI: progress, back, restart, persistence
Status: accepted — specified in the THI-9 instructions.

- **Progress** shows the current question number ("שאלה 4") and the usual range ("בדרך כלל 5–7 שאלות"), never a fixed denominator, because the final length (5–7) is only known as answers come in.
- **Routing stays in the engine.** The UI renders what `nextComparisonStep()` returns. The flow reducer accepts an answer only if it answers the question currently asked with one of its options, and completes the flow when the engine says it is complete.
- **Back** removes the last answer and shows that question again (from the first question it returns to program selection with the selection kept; from the completion screen it reopens the last question). Everything later is recomputed by the engine; an invalidated branch is never preserved.
- **Restart** clears the selection, answers, result and stored state, and returns to program selection.
- **Persistence** (localStorage, key `colman-studymatch:comparison`) stores only `{ version, selectedProgramIds, answers }`. Scores, ranking, branch, next question and result are never stored; they are recomputed on restore by replaying the answers through the same reducer. Malformed, unknown or inconsistent data (including extra keys) is discarded and the candidate starts over.
- A refresh on the first question with no answers returns to program selection with the programs still selected (no answers means nothing durable beyond the selection).
- **Candidate-facing question copy** is structured data (`question_copy_he.json`), joined to and validated against the bank. The "neither" option uses one shared neutral label on every pair question.

## DEC-025 — Result experience: presentation layer and candidate language
Status: accepted — specified in the THI-10 instructions.

- **The page consumes `FitResult` + structured program data + structured presentation copy.** `buildResultView()` (src/flow/resultView.ts) is pure and builds a view model; React only renders it. The engine is unchanged.
- **Three first-class result kinds**, derived from the engine: recommended (`bestFitProgram` set), near tie (`nearTie` and not no-fit: top program named but both options prominent, no pretended winner), and no strong fit (`bestFitProgram === null`: no recommendation, two "closer options", escape routes).
- **Candidate language:** no percentages, scores, enum names or dimension ids. Engine classes are expressed only as qualitative sentences. Dimensions are mapped to plain-language phrases (`result_copy/common.json`).
- **Evidence** is worded from the actual recorded answers: `questionId/answerId` to candidate sentence (`result_copy/evidence.json`), complete over the question bank and validated at load. The engine supplies order and direction only. About 3-5 items: strongest support first, at most one material contrary item ("מצד שני"), never every answer. Engine-neutral answers used only to top up a thin explanation are presented neutrally (`answer`), never as support. A contrary item is shown only if it is at least a quarter as decisive as the strongest answer (presentation-only filter, not scoring).
- **Mirror** is a reflection built from the signed dimension deltas, restricted to dimensions the candidate actually leaned towards. Yes / not exactly is local presentation state; it never changes the result and is not persisted. THI-11 may instrument it.
- **Official content is shown verbatim** (what you learn, courses, careers, why COLMAN, shared first year). Editorial parts (theme titles, challenge story, workflow steps, reality-check wording, pair axes) are separate and reference official facts by exact text or a unique prefix, validated at load. Careers carry no guarantee wording; no salaries or invented titles.
- **Reality checks** are warnings: the lead line quotes the candidate's actual answer for an explicit-negative trigger (or a plain-language dimension sentence for a net-negative trigger), followed by the program's own wording. They never disqualify and never alter fit (DEC-009).
- **Shared first year (DEC-016)** appears only in the CS/DS main decision as context, never as evidence.
- **CTAs:** admission information links to the official `academy.org.il` page and the program page to its official `colman.ac.il` page; no eligibility logic (DEC-008). The advisor CTA is shown only when `NEXT_PUBLIC_ADVISOR_URL` is configured (no contact destination is invented). "Compare again" restarts, preselecting the top two when three programs were compared.

## DEC-026 — Analytics observes the product (funnel instrumentation)
Status: accepted — specified in the THI-11 instructions.

- **Observer only.** Analytics never takes part in scoring, routing, results, persistence validation or product state. Events are derived by replaying dispatched actions through the same pure reducer; rejected actions and state restoration therefore emit nothing. Every analytics failure is swallowed.
- **Centralised.** `src/analytics/` is the only analytics boundary; components call typed helpers (`useAnalytics()`) and never build `dataLayer` payloads. The transport stays the GTM `dataLayer`; there is no direct GA4 dependency and no network call.
- **Contract additions** (documented in `docs/ANALYTICS.md`): `comparison_id`, `program_id`, `result_kind`, `leading_program`. `leading_program` is the top-ranked program after each accepted answer (analytical metadata, never the recommendation).
- **Canonical values:** programs, `comparison_cluster`, `main_decision_pair` and `branch_id` use alphabetical id order; the winner is carried separately as `recommended_program`.
- **Session context is separate from product state.** `comparison_id`, first-touch UTMs and the last question exposure live in a versioned `sessionStorage` record; the durable comparison payload `{ version, selectedProgramIds, answers }` is unchanged.
- **No fake events.** `curriculum_click`, `career_click`, `whatsapp_click`, `lead_submit` and `comparison_share` stay in the vocabulary but are not emitted; no UI element was made interactive for analytics.
