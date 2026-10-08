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

## V2 (career-project discovery)
V2 lets a candidate pick one or two career projects (Spotify, Wolt, TikTok, Duolingo, Nike, an AI product, an Apple Store) and routes them to one of 14 programs; the Tech room keeps the V1 precision flow. It runs at `/v2`; the V1 comparison at `/` is unchanged. Every V2 result ends with a lead form that posts to a same-origin API and is forwarded to the server-only `LEAD_WEBHOOK_URL` (see `.env.example`). See `docs/V2_EXPERIENCE.md`.

## V3 (UX redesign)
`/v3` is the redesigned experience (landing page, explicit Continue, a simplified result, a COLMAN-branded section) and tests WORLD-LED discovery (working worlds instead of V2's brand projects) on the same engine. It runs next to the frozen V2 baseline at `/v2` (tag `studymatch-v2-ui-baseline`) with its own storage and analytics version. See `docs/V3_EXPERIENCE.md`.

## V4 (dual-entry experiment)
`/v4` uses the redesigned UX and lets the candidate choose how to discover: working worlds (V3 content) or brand projects (V2 content), on the same engine. `/v4/worlds` and `/v4/projects` are direct experiment URLs. V2 (brand-only) and V3 (world-only) remain the production baselines; the final direction is not chosen yet. See `docs/V4_EXPERIENCE.md`.

## V5 (balanced project-led discovery)
`/v5` keeps V4's dual-entry structure and inclusive Hebrew, but the projects path offers ten balanced project-led entries (`PROJECT_STRATEGY`) that give all 14 programs a direct door. Worlds are identical to V4. `/v5/worlds` and `/v5/projects` are direct experiment URLs. V1–V4 are historical baselines (V4 tag `studymatch-v4-dual-entry-baseline`); the final direction is not chosen yet. See `docs/V5_EXPERIENCE.md` and DEC-037. Pilot measurement (click events, result feedback, outbound UTMs, KPIs, GTM/GA4 plan): `docs/V5_PILOT_MEASUREMENT.md` (DEC-038).

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
9. `docs/PROGRAM_DATA.md` — program data layers, evidence rules, curation workflow.
10. `docs/SCORING.md` — fit formula, V1 pilot thresholds (DEC-018), calibration evidence.
11. `docs/V2_ALL_PROGRAMS_SPEC.md` — StudyMatch V2 (all programs, career-project discovery) and implementation status.
12. `docs/V2_QUESTION_BANK.md` — V2 career-imagination question content and its data representation.
13. `docs/V2_SCORING.md` — V2 routing, generic scoring, precision-module handoff and pressure-test traces.
14. `docs/V2_EXPERIENCE.md` — the integrated V2 journey (`/v2`): project selection, persistence, result kinds, personas, journey length, pre-launch risks.

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

## Development

### Prerequisites
- Node.js 20.9+ (developed on Node 24)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)

### Setup and run
```bash
pnpm install
pnpm dev          # http://localhost:3000
```

### Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm build` / `pnpm start` | Production build / serve the build |
| `pnpm test` | Unit tests (Vitest, Node environment) |
| `pnpm e2e` | Pilot acceptance E2E (Playwright, real production build; first run: `pnpm exec playwright install chromium`). See `docs/QA_ACCEPTANCE_V1.md` |
| `pnpm typecheck` | TypeScript, strict mode |
| `pnpm lint` | ESLint, including module-boundary rules |
| `pnpm check` | lint + typecheck + test (run before opening a PR) |
| `pnpm snapshot:sources` | Refresh official-source snapshots used to verify program facts (offline curation) |

### Stack
Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS v4 · Vitest · pnpm. See `DEC-014` in `docs/DECISIONS.md`.

The document defaults to Hebrew/RTL (`<html lang="he" dir="rtl">`). Use logical spacing utilities (`ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`) instead of `left`/`right` so layouts stay correct in RTL.

## Repository structure
```
src/
  app/          Next.js routes only — thin wrappers: / (select) → /questions → /result
  ui/           React components, Hebrew copy (copy.he.ts), React bindings for flow state
  flow/         Pure comparison-flow reducer and step-access rules (select → questions → result)
  engine/       Pure deterministic fit engine + adaptive question flow (docs/SCORING.md, docs/QUESTION_ENGINE.md)
  data/         Structured program content: official facts, editorial fit profiles, admissions (docs/PROGRAM_DATA.md)
  analytics/    Event vocabulary from docs/ANALYTICS.md + GTM dataLayer transport
scripts/        Offline curation tooling (source snapshots)
tests/          Unit tests mirroring src/ (engine, flow, data, analytics)
docs/           Product source of truth
```

### Layering rules
- `engine`, `flow`, `data`, and `analytics` are **pure TypeScript**. They must not import React, Next.js, or `ui`/`app`. ESLint enforces this.
- `engine` additionally must not import `data`, `flow`, or `analytics`: it is the deterministic core, receives program vectors as arguments, and must be testable in isolation.
- Admissions data (`@/data/admissions`) is isolated from fit/scoring (DEC-008); pure modules may not import it.
- Program facts live only in `src/data/content`; UI reads them through `@/data` and never hardcodes them.
- UI components dispatch actions and read selectors; they do not contain fit, routing, or question-selection logic.
- Analytics: `src/analytics/` (see `docs/ANALYTICS.md`, DEC-026); components use `useAnalytics()` and never push to the dataLayer directly.
- Result copy lives in `src/data/content/result_copy/` (evidence wording, dimension phrases, pair axes, per-program copy), validated by `src/data/resultCopy.ts` and turned into a view model by `src/flow/resultView.ts`.
- Interface Hebrew strings live in `src/ui/copy.he.ts`. Candidate-facing question and answer copy is structured data in `src/data/content/question_copy_he.json` (validated against the bank by `src/data/questions.ts`); IDs and code stay in English.
