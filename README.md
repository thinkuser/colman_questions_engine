# COLMAN Questions Engine

Interactive degree-comparison and study-choice assistant for prospective students of the College of Management Academic Studies.

## V1 goal
Help a prospective student compare 2–3 academic programs and understand:
- what is materially different between them;
- which one best matches their stated interests and preferred type of work;
- why that recommendation was made;
- what the closest alternative is;
- what they will study and what careers may follow;
- what important trade-offs they should know before choosing.

## Pilot programs
- Computer Science
- Data Science
- Management Information Systems

## Product architecture
`Program data → Question bank → Adaptive selector → Candidate vector → Deterministic fit engine → Explanation/result experience → Analytics/lead handoff`

The LLM may explain a result, but the deterministic engine decides the match.

## Start here
1. `CLAUDE.md` — implementation contract for Claude Code.
2. `docs/PRODUCT_SPEC.md` — product scope and end-to-end flow.
3. `docs/DECISIONS.md` — source-of-truth product decisions.
4. `docs/PROGRAM_MODEL.md` — dimensions and pilot program vectors.
5. `docs/QUESTION_ENGINE.md` — adaptive questions and scoring principles.
6. `docs/RESULT_EXPERIENCE.md` — result-page behavior and copy structure.
7. `docs/ANALYTICS.md` — GA4/BigQuery measurement plan.
8. `docs/PERSONAS_AND_TESTS.md` — sanity personas and acceptance criteria.

## Workflow
GitHub is the source of truth.

1. Product/UX decisions are discussed and agreed.
2. Decisions are recorded in docs and/or a GitHub issue.
3. Claude Code implements one issue on a branch.
4. Implementation is submitted as a pull request.
5. The PR is reviewed against the source-of-truth docs and acceptance tests.
6. Merge only after the decision logic and analytics requirements are respected.

## Official content sources
Structured program content will be curated from official COLMAN properties:
- `https://www.colman.ac.il/`
- `https://www.academy.org.il/`

Runtime recommendations should not depend on live scraping of these pages.
