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
