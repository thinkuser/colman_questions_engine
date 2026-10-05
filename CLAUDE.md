# CLAUDE.md — COLMAN Questions Engine

## Purpose
Build an interactive decision-support tool for prospective students comparing 2–3 academic programs at the College of Management Academic Studies.

## Required reading before implementation
1. `docs/PRODUCT_SPEC.md`
2. `docs/DECISIONS.md`
3. `docs/PROGRAM_MODEL.md`
4. `docs/QUESTION_ENGINE.md`
5. `docs/RESULT_EXPERIENCE.md`
6. `docs/ANALYTICS.md`

## Operating rules
- GitHub is the source of truth for code, product documentation, architecture decisions, branches, commits, and pull requests.
- Linear is the source of truth for execution tasks and implementation scope.
- Work on one Linear issue at a time unless explicitly instructed otherwise.
- Do not alter scoring logic, program vectors, or core product decisions without explicit approval.
- Program facts must come from structured data derived from official COLMAN sources (`colman.ac.il` and `academy.org.il`).
- The deterministic rules/scoring engine decides fit. An LLM may explain a result, but must not decide the match.
- Never present heuristic scores as scientific precision or as fake match percentages.
- Keep admission eligibility separate from program-fit scoring.
- Every user-visible feature must define analytics events where relevant.
- Preserve RTL/Hebrew-first UX, while keeping internal IDs and code in English.
- Prefer simple, testable logic for V1 over premature ML or agentic complexity.
- Add or update tests for any scoring, routing, adaptive-question, or result-classification change.
- Submit implementation as a PR with: summary, files changed, decisions respected, tests run, and known limitations.

## Model and cost policy
Use the cheapest model that can reliably complete the current Linear issue. The issue's `Recommended model` guidance takes precedence when present.

### Default: Sonnet
Use Sonnet for well-scoped implementation work such as:
- UI implementation and styling
- analytics wiring
- straightforward data plumbing
- tests and test maintenance
- documentation updates
- small or mechanical refactors
- clearly specified bug fixes

### Use Opus when reasoning quality materially matters
Use Opus for work such as:
- architecture decisions or changes
- scoring / recommendation logic
- adaptive decision or routing logic
- complex debugging with uncertain root cause
- major refactors with broad consequences
- ambiguous requirements that require substantial reasoning before implementation

### Session discipline
- Prefer a fresh Claude Code session for each meaningful Linear issue instead of carrying a large conversation across issues.
- Do not broaden the current issue merely because additional repository context is available.
- Read only the files and docs needed to execute the issue correctly, plus the required project docs above.
- If the current session is running on a materially more expensive model than the issue requires, flag it before substantial work.
- If the current session is running on a weaker model than the issue's recommended model, flag it before substantial work rather than silently proceeding.
- Model choice is an execution/cost decision only; it must never change product logic or acceptance criteria.
