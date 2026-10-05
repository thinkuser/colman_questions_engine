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
- GitHub is the source of truth.
- Work on one GitHub issue at a time unless explicitly instructed otherwise.
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
