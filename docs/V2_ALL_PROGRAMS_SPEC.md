# StudyMatch V2 — All Programs / Career Imagination

Status: **accepted product direction; implementation starts with THI-13**.

This document captures the V2 product decisions made after the V1 pilot shipped. V2 expands StudyMatch from the three-program technology pilot to the full undergraduate program set while preserving what already works in V1.

## 1. Product goal

V2 should help a prospective student imagine the kind of work they may enjoy before asking them to think in academic labels.

The core interaction is not:

> Which degree are you interested in?

It is:

> **If you could join one of these projects tomorrow — which would you choose?**

The experience should remain short, concrete, informal, explainable, deterministic, and useful. It should not feel like a psychometric test or a formal diagnosis.

## 2. Key V2 decisions

1. The opening is **career-project discovery**, not a list of 14 degree checkboxes.
2. A candidate may choose **one or two projects maximum**.
3. A real company/brand is **set dressing**. The measured signal is the kind of work the candidate chooses inside the scenario.
4. Project selection is a **routing/candidate-pool signal only** and contributes **0 fit points**.
5. The V1 result experience is preserved: Best Fit / near tie / no strong fit, evidence, Main Decision, reality check, alternatives, and official exploration links.
6. Tone stays conversational and non-formal. Prefer phrases such as “this seems to sit well with you” over diagnostic language.
7. The current CS / Data Science / MIS precision work is preserved and reused as a specialized module.
8. Other clusters start with a simpler generic V2 engine and can gain curated precision later where real usage proves it is valuable.
9. Every cluster initially ships with Q1–Q4 and structurally reserves Q5–Q7 for future expansion.
10. No real company logos in V2 for now. Company names may be used as scenario context; visual treatment should use neutral icons/illustrations and must not imply partnership or endorsement.
11. No ML or runtime LLM decides the recommendation. The engine remains deterministic and testable.
12. No candidate-facing scores or fake match percentages.

## 3. Programs in scope

The initial V2 scope is the 14 undergraduate programs supplied for the product work:

- Computer Science
- Data Science
- Management Information Systems — candidate-facing qualifier remains mandatory: **double major with Business Administration**
- Business Administration
- Economics and Management
- Accounting
- Psychology
- Behavioral Science
- Education
- Economics + Psychology — candidate-facing qualifier: **`דו-חוגי`** (double major on both official sites; accepted in the THI-13 review)
- Communication
- Communication + Management
- Law
- Interior Design

Do not add additional programs to V2 implicitly. If another COLMAN program is discovered (for example a separate visual-communication/interior-space offering), verify with the product owner before expanding the scope.

## 4. Content-source model

Both sites are first-class curated sources with different roles:

### COLMAN academic layer
Use `colman.ac.il` for academic facts such as curriculum, course structure, program nature, tools, professional content, admissions, and official naming.

### Academy candidate layer
Use `academy.org.il` for prospect-facing language, motivations, career framing, and how programs are explained to interested candidates.

### StudyMatch imagination layer
StudyMatch combines the two curated layers into concrete scenarios describing how the work can feel in the real world.

Runtime must continue to use structured local data. It must not scrape either source live when making a recommendation.

Primary supplied URLs:

- https://www.colman.ac.il/academics/ba/
- https://www.colman.ac.il/academics/ba/management-information-systems/
- https://www.colman.ac.il/academics/ba/interior-design/
- https://www.colman.ac.il/academics/ba/communication-and-managment/
- https://www.academy.org.il/ba/education/
- https://www.colman.ac.il/academics/ba/education/
- https://www.academy.org.il/ba/accounting/
- https://www.colman.ac.il/academics/ba/accounting/
- https://www.academy.org.il/ba/economy/
- https://www.colman.ac.il/academics/ba/economy/
- https://www.academy.org.il/ba/economics_psychology_studies/
- https://www.academy.org.il/ba/data-science/
- https://www.colman.ac.il/academics/ba/behavioral-science/
- https://www.academy.org.il/ba/computer-science/
- https://www.colman.ac.il/academics/ba/data-science/
- https://www.colman.ac.il/academics/ba/business-administration/
- https://www.colman.ac.il/academics/ba/law/
- https://www.academy.org.il/ba-management-information-systems/
- https://www.academy.org.il/ba/interior-design/
- https://www.academy.org.il/ba/psychology/
- https://www.colman.ac.il/academics/ba/psychology/
- https://www.colman.ac.il/academics/ba/economics-psychology-studies/
- https://www.academy.org.il/ba/media-school/
- https://www.colman.ac.il/academics/ba/communication-content-media/

Where the two sources use different phrasing, preserve provenance and curate candidate copy rather than silently choosing one site as the only truth.

## 5. Opening career projects

The initial opening set is deliberately small and visual.

| Project | Candidate-facing idea | Initial candidate pool |
|---|---|---|
| Spotify | Improve Discover Weekly | Computer Science, Data Science, MIS |
| Wolt | Decide whether and how to enter a new city | Business Administration, Economics and Management, Accounting |
| TikTok | Understand why people keep scrolling | Psychology, Behavioral Science, Economics + Psychology |
| Duolingo | Help people actually persist in learning | Education, Psychology, Behavioral Science |
| Nike | Launch a new product in Israel | Communication, Communication + Management, Business Administration |
| AI product | Launch a feature without getting into privacy/rights trouble | Law, with adjacent Business/Communication signals inside later questions |
| Apple Store | Turn an empty space into a memorable physical brand experience | Interior Design, with adjacent Communication/Business signals inside later questions |

Accepted opening copy (plural forms, consistent with V1 and not gendered):

> **אם הייתם יכולים להצטרף מחר לאחד מהפרויקטים האלה — מה הכי מושך אתכם?**
>
> אפשר לבחור עד שניים. אל תחשבו איזה תואר “נכון” לכם — רק מה נשמע לכם מעניין לעבוד עליו.

Project choice narrows the candidate pool but does not itself make one program a better fit.

## 6. V2 flow

```text
Career-project discovery (choose 1–2)
        ↓
Candidate pool only — no fit points yet
        ↓
Scenario question(s)
        ↓
Current shortlist / leading programs
        ↓
┌────────────────────────────────────────────┐
│ Specialized precision module available?   │
└────────────────────────────────────────────┘
      ↓ yes                         ↓ no
Existing curated module       Generic focus/head-to-head
(e.g. CS / DS / MIS)          using structured work statements
      ↓                              ↓
Reality check where relevant (warning/evidence only)
        ↓
Recommended / near tie / no strong fit result
```

The flow should not contain separate hard-coded “short routes” for Law, Design, etc. Instead, the same engine may stop early when the available evidence is already strong enough.

## 7. Hybrid scoring/routing baseline

The generic V2 engine intentionally starts simple.

Initial calibration seeds:

- Project selection: **0 points** — routing only.
- Scenario answer: **+3** to the explicitly chosen program signal.
- Generic focus/head-to-head answer: **+4**.
- Optional curated tiebreaker: **+5** where a genuinely useful one exists.
- Reality check: **0 ranking points** — evidence/warning only.

These are transparent product heuristics for initial V2 calibration, not psychometric/scientific claims.

### Generic stop baseline

After at least **3 scored answers**:

A clear leader requires both:

1. at least **2 supporting answers** for that program; and
2. a lead of **4 or more points** over the next program.

If this is not true, ask another relevant focus/head-to-head question.

Generic flow ceiling: **5 scored questions**. If the result is still close, return a valid near tie rather than force a winner.

These thresholds should be tested with V2 personas before being treated as launch baselines.

## 8. Generic cross-cluster head-to-head

V2 must not require N×N authored pair questions.

Every program should store 2–3 concise, candidate-facing “day at work / work fantasy” statements. If the leading pair is not covered by a specialized precision module, choose a deterministic A-vs-B focus question from those statements.

Example:

> **איזה מהימים האלה היית מעדיף?**
>
> A. להיכנס לארגון ולנסות להבין למה קבוצות שונות של אנשים מתנהגות אחרת.  
> B. לפתוח נתוני קמפיין עם צוות שיווק ולהחליט מה צריך לעשות אחרת מחר.

This can separate Behavioral Science from Communication + Management without authoring a permanent dedicated branch for that pair.

No LLM should create or score this choice at runtime. Copy is structured and curated.

## 9. Preserve the V1 Tech Precision module

The existing Computer Science / Data Science / Management Information Systems experience is the current quality benchmark.

When V2 discovery resolves into that technology cluster, preserve and reuse:

- existing curated pair questions;
- work-style distinctions;
- math/self-rating logic;
- CS ↔ DS precision;
- CS ↔ MIS precision;
- DS ↔ MIS precision;
- near-tie behavior;
- the existing curated tiebreakers;
- no-strong-fit behavior;
- evidence/trade-off logic;
- low-math reality warning semantics.

Do not ask the Spotify scenario twice. V2 discovery/scenario input should be adapted into the precision flow cleanly so the candidate does not feel they are repeating themselves.

Future clusters may gain their own precision modules, but this is optional and should be driven by actual user ambiguity/usage, not by a requirement to build every possible pair.

## 10. Result experience

Keep the V1 result architecture and make the language slightly more career-imagination-led where useful.

Maintain:

- Best Fit / near tie / no strong fit;
- evidence based on the candidate's actual answers;
- Main Decision / primary trade-off;
- Reality Check;
- alternative direction(s);
- official program exploration links;
- advisor CTA where configured;
- no lead gate before the result;
- admissions separate from fit.

Preferred tone examples:

- `מהתשובות שלך, זה הכיוון שהכי יושב עליך.`
- `אתה חוזר שוב ושוב למקומות שבהם...`
- `ההתלבטות האמיתית שלך היא כנראה בין...`
- `נראה שאתה נמשך יותר ל... מאשר ל...`

Avoid formal language such as `האבחון קבע` or claims of validated psychological suitability.

## 11. Brand/legal visual rule for V2

For now:

- company names may appear as hypothetical scenario context;
- do not use official company logos;
- use neutral icons/illustrations;
- do not imply sponsorship, endorsement, partnership, internship placement, or employment relationship;
- scenario copy should remain clearly hypothetical.

Accepted brand disclaimer copy (product copy, not a legal opinion):

> שמות החברות מופיעים לצורך המחשה בלבד. אין בכך כדי להעיד על שיתוף פעולה, חסות או קשר מסחרי עם החברות המוזכרות.

Any future use of official brand assets requires separate legal/brand approval and is not a V2 blocker.

## 12. Implementation architecture

Keep existing boundaries from V1:

- structured content/data under the data layer;
- deterministic framework-free business logic;
- routing in engine/flow, not React conditionals;
- UI renders state and dispatches actions;
- persistence stores durable candidate inputs and recomputes derived state;
- analytics does not influence recommendation.

V2 should introduce clear concepts rather than one large conditional flow:

- `careerProject`
- `candidatePool`
- `scenarioQuestion`
- `genericScoreState`
- `shortlist`
- `precisionModule` / adapter
- `genericHeadToHead`
- `realityCheck`
- `result`

Exact type/file names are implementation decisions, but module boundaries should stay explicit and unit-testable.

## 13. Initial V2 pressure-test outcomes

Three mental test cases support the architecture:

### Focused Tech candidate
Spotify → prediction/model work → hand off into existing CS/DS/MIS precision module → Data Science when subsequent precision answers support it.

Expected behavior: no duplicate Spotify question; no loss of V1 precision.

### Business vs Economics ambiguity
Wolt answers split between Economics and Business. If evidence remains mixed after the generic ceiling, return a near tie / Main Decision rather than manufacture a winner.

Expected behavior: ambiguity is a useful output.

### Cross-cluster candidate
TikTok + Nike → Behavioral Science signal + Communication & Management signal → generic head-to-head built from structured “day at work” statements → Communication & Management if that focus answer wins.

Expected behavior: scale without pair-specific hardcoding.

## 14. Delivery sequence

Linear milestone: **V2 — All Programs**

- THI-13 — all-program catalog + career-imagination discovery model
- THI-14 — hybrid shortlist routing + preservation of Tech precision
- THI-15 — non-tech question clusters + generic head-to-head content
- THI-16 — discovery UX, result integration, analytics, and acceptance QA

Do not merge implementation work without review. Preserve V1 behavior with regression tests throughout the V2 expansion.

## 15. Implementation status

### THI-13 (data and model foundation)
| Concept | Implementation |
|---|---|
| Program catalog (14 programs, names, aliases, qualifiers, provenance) | `src/data/content/catalog/programs.json`, `src/data/catalog.ts` (DEC-029) |
| Official source registry for all supplied URLs; minimal verified degree headings for the catalog names | `src/data/content/sources.json`, `src/data/content/catalog/verified_headings.json` (no full-page copies of the new pages are committed) |
| `careerProject` and opening copy | `src/data/content/discovery/career_projects.json`, `src/data/discovery.ts` (DEC-027) |
| 1–2 project selection, `candidatePool` | `validateProjectSelection`, `buildCandidatePool` in `src/engine/discovery.ts`; `startDiscovery` in `src/flow/discovery.ts` |
| Clusters, `scenarioQuestion` shape, Q5–Q7 as data | `src/data/content/discovery/clusters.json`, `buildClusters` in `src/data/discovery.ts`, `V2Cluster` / `V2Question` types (DEC-028) |
| `precisionModule` / adapter | `PrecisionModuleAdapter` interface and the `v1_tech` cluster flag. Interface only; no handoff yet |

Unchanged: the V1 comparison flow, engine, question bank, result experience, analytics and persistence. V1 still compares exactly CS, DS and MIS.

### THI-14 (routing and scoring)
Implemented as specified in §6–9 and recorded in DEC-030; details and pressure-test traces in `docs/V2_SCORING.md`.
- Pure router `nextV2Step` (`src/engine/v2/`) and production wiring `nextDiscoveryStep` (`src/flow/v2Step.ts`).
- Generic points (0 / +3 / +4 / +5 / 0), support counts, shortlist, clear-leader rule, a 5-answer ceiling with near tie, adjacent programs surfaced only by answers, a generated 2- or 3-way focus question (the head-to-head) over the whole evidence leading set (supported contenders only), and reality checks by explicit `reality_for_program_ids`.
- `PrecisionModuleAdapter`, with the unchanged V1 engine as `v1_tech`. Spotify alone is exactly V1. The Spotify opener `T1` reuses V1 `Q1` and is carried into V1, so it is never asked twice.
- Open: a generic "no strong fit" threshold is not defined; the engine reports `insufficient_positive_evidence` instead (DEC-030).
- Until THI-15 added content, non-tech projects returned `needs_focus_content`; they now ask real questions (see THI-15 below).

### THI-15 (non-tech content)
Authored as data only; no router, scoring or schema change. Details, the option-by-option QA table and the completeness results are in `docs/V2_QUESTION_BANK.md` ("Shipped content (THI-15)").
- Five clusters populated: Business (B1-B4), People (P1-P4), Communication (C1-C4), Law (L1-L3, L5), Interior Design (D1-D3, D5), plus six reality checks (Accounting, Psychology, Education, Communication + Management, Law, Interior Design).
- Three work statements for every one of the 14 programs.
- Lone-leader completeness verified by walking every answer path of all 21 non-tech selections (6 single projects and 15 pairs): no `needs_focus_content`, ending in a recommendation or a near tie within 7 answers.
- Two extra authored general focus questions were needed to reach that: Law L5 and Interior Design D5 (flagged in the question bank).

Not implemented in THI-13, by design:
- THI-14: `genericScoreState`, `shortlist`, scoring weights, stop rules, `genericHeadToHead` selection, the tech precision handoff (including the Spotify discovery scenario so it is not asked twice).
  - Contract for THI-14: the candidate pool is ordered deterministically (project display order, then each project's program order; click order does not matter). That array position **must not** be used as a hidden ranking or tie-break signal. Ranking comes from scored answers and evidence; a true tie stays a tie or follows an explicit, documented rule.
- THI-15 (now done): non-tech question content (B/P/C/L/D) and per-program work statements.
- THI-16: discovery UX, result integration, analytics events and acceptance QA.

Open questions recorded for later issues:
- Some approved answers name "adjacent signals" rather than a single program ("Communication / Communication + Management", "Tech/MIS adjacent", "Behavior/Data adjacent"). The schema can encode one or several programs per answer; the exact mapping was settled in THI-15: Law L1 C points to Communication and Communication + Management (the only multi-target option), Law L2 C to MIS, Interior Design D2 C to Behavioral Science. See the question bank.
- The opening copy now uses plural forms like V1. The rest of the question bank and result copy still use singular forms; broader copy QA is THI-15 / THI-16.

Resolved in the THI-13 review: Economics + Psychology carries the candidate-facing qualifier `דו-חוגי` (DEC-029).
