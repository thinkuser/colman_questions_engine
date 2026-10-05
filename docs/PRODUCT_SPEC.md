# Product Spec V1

## Product goal
Help a prospective student understand which of 2–3 academic programs best matches what they want to learn and do, why it fits, what the trade-off is versus the closest alternative, what they will study, and where it can lead professionally.

## Primary use case
Comparison intent: a candidate already has 2–3 programs in mind and wants help choosing.

## V1 pilot programs
- Computer Science (`computer_science`)
- Data Science (`data_science`)
- Management Information Systems (`management_information_systems`)

## Core promise
In a few minutes the candidate should understand:
- what is materially different between the programs;
- what kind of problems each program prepares them to solve;
- what they will actually study;
- what kinds of careers each can lead to;
- which program currently fits their stated preferences best;
- what the real decision/trade-off is.

## Experience principles
1. Advisor, not quiz.
2. Explain the recommendation; do not just rank programs.
3. Use adaptive questions with high discriminating power.
4. Value before lead capture.
5. Fit and admission eligibility are separate systems.
6. Trust over forced conversion: allow `no strong fit` and ties.
7. Candidate interests matter more than self-perceived ability; ability/tolerance can become a reality-check warning.

## Main flow
1. Select 2–3 programs.
2. Ask 3 common opening questions.
3. Build an initial candidate vector.
4. Identify the two closest programs / main decision.
5. Ask 2–3 adaptive pair-specific questions.
6. Ask a tie-breaker only if needed.
7. Compute deterministic fit ranking.
8. Generate result evidence and trade-off.
9. Show result experience.
10. Optional actions: admission check, compare again, advisor/WhatsApp lead.

## Result outputs
- `best_fit_program`
- `secondary_program`
- `main_decision` (usually the top two)
- `fit_classification` (`strong_fit`, `good_fit`, `consider_carefully`, `no_strong_fit`)
- `evidence[]` from answers
- `tradeoff_summary`
- `reality_checks[]`
- `candidate_vector`

## V1 non-goals
- No machine-learning recommendation model.
- No psychometric/personality diagnosis.
- No fake percentage match.
- No automated admission decision inside the fit score.
- No scraping/LLM live browsing during candidate sessions.
- No need to support every COLMAN degree before the pilot is validated.

## Source strategy
Official program facts are curated into structured data from:
- `https://www.colman.ac.il/`
- `https://www.academy.org.il/`

The runtime experience reads structured content, not live pages.

## Conversion strategy
Do not gate the result. After value is delivered, offer a contextual CTA such as:
`I want to speak with an advisor about Data Science vs Computer Science.`

Pass comparison context to CRM where possible: selected programs, best fit, secondary program, major preference signals, concerns, source/UTM data.
