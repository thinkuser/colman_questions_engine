# Personas and Acceptance Tests

## Persona A — Computer Science
Traits:
- enjoys coding;
- enjoys mathematics;
- wants to build software/systems;
- low interest in business context.
Expected: `computer_science` best fit.

## Persona B — Data Science
Traits:
- likes numbers/statistics;
- wants to understand behavior through data;
- comfortable with coding;
- interested in prediction/modeling.
Expected: `data_science` best fit.

## Persona C — Management Information Systems
Traits:
- likes technology and data;
- interested in product/business;
- likes collaboration and organizational problems;
- wants to connect technical and business teams.
Expected: `management_information_systems` best fit.

## Persona D — No strong fit
Traits:
- says AI sounds interesting;
- wants little/no mathematics;
- does not want coding;
- does not enjoy data analysis;
- prefers people/creative work.
- **Explicitly expresses** that the offered technical/data directions are not attractive: chooses "neither of these really appeals to me" on the pair questions (DEC-021, DEC-022).
Expected: `no_strong_fit`; suggest exploring other programs rather than falsely forcing MIS.

The engine classifies only from preferences a candidate actually expresses; it never infers hidden aversions that were never asked (DEC-022).

## Persona D′ — MIS-style answers with technical discomfort
Traits:
- people-oriented, low math tolerance;
- nevertheless repeatedly chooses MIS-style answers (business, organizations, connecting people and technology).
Expected: `management_information_systems` may legitimately be the best fit, **with reality checks** (e.g. MIS technical and quantitative load). It is not `no_strong_fit`: their discomfort with coding, math, or data is surfaced as a warning, not inferred as rejection.

## Acceptance tests
1. The personas above (A–D and D′) produce the expected classification.
2. Low self-rated math alone cannot override repeated high-interest Data Science or CS choices; it should instead create a reality-check warning.
3. A near-equal CS/DS candidate can return a near-tie/main-decision state and request one tie-breaker.
4. The engine never exposes a percentage match in user-facing output.
5. Admission eligibility never changes fit scores.
6. Every result contains answer-derived evidence.
7. The second-place program receives an explicit trade-off explanation.
8. A candidate who selects only CS and DS never receives MIS-only adaptive questions.
9. Typical completion requires 5–7 questions unless a special state justifies otherwise.
10. At most one tie-breaker is asked; a genuinely close result is returned as close.

Automated in `tests/engine/personas.test.ts` and `tests/engine/adaptive.test.ts`; the current sanity table is in `docs/SCORING.md`.
