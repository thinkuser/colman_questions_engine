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
Status: **proposed — pending review** (THI-7, PR for THI-7). Not accepted. These are calibration seeds validated only against **synthetic** pair-question signals, and they **must be revalidated in THI-8** once the real CSDS / CSMIS / DSMIS signal definitions exist.

All values apply to `normalized_fit` (raw fit / attainable ideal):
- `strong_fit` ≥ 0.80; `good_fit` ≥ 0.65; `consider_carefully` ≥ 0.50; `no_strong_fit` < 0.50.
- Near tie: top-two gap < 0.05. Computed always, but it never overrides `no_strong_fit`.
- Reality check: fires for a top-two program when at least one related dimension has attainable variation and is materially low, meaning `C[d] < min + (max − min) / 3` **and** `C[d] < 0` (net-negative evidence). The net-negative condition is proposed in THI-7: without it, not choosing a dimension's options triggered warnings.

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
