# StudyMatch V5 Experience (balanced project-led discovery)

V5 is a fourth, isolated experiment next to the historical baselines. **The final production direction is NOT chosen yet.** Nothing changes at `/`; nothing is promoted.

| Version | Route | Discovery | Experience | Status |
|---|---|---|---|---|
| V1 | `/` | program comparison | V1 | unchanged |
| V2 | `/v2` | brand-led only (7 projects, `BRAND_STRATEGY`) | V2 UX | baseline, tag `studymatch-v2-ui-baseline` |
| V3 | `/v3` | world-led only (9 worlds, `WORLD_STRATEGY`) | redesigned UX | baseline, tag `studymatch-v3-worlds-baseline` |
| V4 | `/v4` | dual entry: worlds OR the original 7 **brand-led** projects | redesigned UX + inclusive Hebrew (DEC-036) | baseline, tag `studymatch-v4-dual-entry-baseline` (`cbfa8c0`) |
| **V5** | `/v5` | dual entry: worlds OR **10 balanced project-led** projects (`PROJECT_STRATEGY`) | redesigned UX + inclusive Hebrew | this experiment (draft PR, DEC-037) |

**Why V5:** a candidate who says "אין לי מושג מה אני רוצה ללמוד" should meet concrete activities that reach every COLMAN program (technology, data, business, economics, accounting, communication, psychology, behavioral science, education, people/organizations, law, design) without choosing a degree first. V4's seven brand projects did not give every program a direct door.

## Routes and journey
`/v5` landing → `/v5/start` method → `/v5/worlds` or `/v5/projects` → `/v5/ready` → `/v5/questions` → `/v5/result`

- **Landing** and **method screen**: V4's approved, inclusive screens and copy ("מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?"; Worlds = RIGHT card, Projects = LEFT card, equal; tested). The method choice gives 0 points, 0 support, is not evidence; it only selects the strategy.
- **Worlds (`/v5/worlds`)**: exactly V4's world discovery: `WORLD_STRATEGY` (the same object V3/V4 use), the nine worlds, openers, follow-ups (incl. WO2–WO5), reality checks, results and the WT1 → V1 Q1 carry.
- **Projects (`/v5/projects`)**: the ten V5 projects below. Headline "איזה מהפרויקטים האלה הכי מסקרן?" / "אפשר לבחור עד שניים — לפי המשימה שנשמעת הכי מעניינת, לא לפי השם שמופיע עליה." Max two, explicit Continue, visible third-selection warning, text-first cards (title + one task line; no logos, no brand colours; one typography), fixed display order, company disclaimer kept.
- **Transition, questions, result, lead**: the shared redesigned screens with V4's inclusive copy; the V4 result hierarchy.

**Back:** result → last question → previous answers → the chosen discovery screen → `/v5/start` → `/v5`. **Restart** clears only V5.

**Direct URLs:** `/v5/worlds` and `/v5/projects` work with no query parameter. With no V5 journey stored they adopt their own `entry_mode`; a journey in progress is never silently switched (the URL is redirected to where that journey belongs). No route redirects between V4 and V5.

## The ten V5 projects (display order; order is never a score)
| # | id | Card title | Core | Adjacent | Opener answers (A / B / C / D) |
|---|---|---|---|---|---|
| 1 | `spotify_discovery` | Spotify | CS, DS, MIS | BA* | CS / DS / MIS (carried into V1 as Q1) |
| 2 | `wolt_city_expansion` | Wolt | BA, Econ & Mgmt | Econ & Psych, Accounting | BA / Econ & Mgmt / Econ & Psych |
| 3 | `tiktok_behavior` | TikTok | Psych, Behavioral, Econ & Psych | – | Psych / Behavioral / Econ & Psych |
| 4 | `duolingo_persistence` | Duolingo | Education, Psych, Behavioral | – | Education / Psych / Behavioral |
| 5 | `people_retention` | People / HR | Behavioral, Econ & Psych | BA, MIS | Behavioral / Econ & Psych / BA / MIS |
| 6 | `people_change` | מרכז ליווי והתפתחות | Psych, Behavioral | Education | Psych / Behavioral / Education |
| 7 | `ai_legal_case` | מקרה משפטי סביב AI | Law | BA, Communication | Law / BA / Communication |
| 8 | `accounting_gap` | משרד רואי חשבון | Accounting | Econ & Mgmt, BA | Accounting / Econ & Mgmt / BA |
| 9 | `nike_launch` | Nike | Communication, Comm & Mgmt | BA | Communication / Comm & Mgmt / BA |
| 10 | `apple_store_space` | Apple Store | Interior Design | Communication, BA | Interior Design / Communication / BA |

Content: `src/data/content/discovery/v5_projects.json` (validated at load by `src/data/v5Projects.ts`). Card copy, openers and option labels are pinned in `tests/flow/v5.test.ts`.

\* **Spotify adjacency (deliberate, for correctness):** with an all-Tech pool (CS/DS/MIS only) the existing engine hands off to the V1 module *before any opener*, so V1 would ask its own Q1 and the V5 opener would never be shown. Spotify therefore has `business_administration` as adjacent (and borrows the `business` questions), exactly like the approved Technology world. After the opener the evidence sits inside the Tech module, so V1 takes over at Q2.

### Direct coverage: every program has a direct project-opener answer
| # | Program | Direct opener answers |
|---|---|---|
| 1 | `computer_science` | Spotify A |
| 2 | `data_science` | Spotify B |
| 3 | `management_information_systems` | Spotify C, People / HR D |
| 4 | `interior_design` | Apple Store A |
| 5 | `communication_and_management` | Nike B |
| 6 | `education` | Duolingo A, מרכז ליווי והתפתחות C |
| 7 | `accounting` | משרד רואי חשבון A |
| 8 | `economics_and_management` | Wolt B, משרד רואי חשבון B |
| 9 | `economics_and_psychology` | Wolt C, TikTok C, People / HR B |
| 10 | `behavioral_science` | TikTok B, Duolingo C, People / HR A, מרכז ליווי והתפתחות B |
| 11 | `business_administration` | Wolt A, People / HR C, AI Legal B, Accounting C, Nike C, Apple Store C |
| 12 | `law` | AI Legal A |
| 13 | `psychology` | TikTok A, Duolingo B, מרכז ליווי והתפתחות A |
| 14 | `communication` | AI Legal C, Nike A, Apple Store B |

Tested: `tests/flow/v5.test.ts` ("gives every one of the 14 programs a DIRECT answer").

## Scoring and routing (no V5 engine)
- **Card selection = routing only:** builds the candidate pool (core + adjacent) and opens the project's own scenario. 0 score, 0 support, 0 evidence.
- **Opener = evidence:** the existing scenario weight, **+3** per targeted program. No new score values; no neutral answer on openers.
- **One project:** opener → the existing evidence-aware routing (supported leaders/runners, authored separators, generated focus, generic ceiling, near-tie, insufficient positive evidence, reality checks, V1 classification).
- **Two projects:** first selected project's opener → second selected project's opener → the same routing. **The candidate's SELECTION ORDER decides the opener order** (not project id, program id, catalog position or score). Selection order gives no points (tested: same answers in either order → same scores and support).
- Thresholds, weights, DEC-018 and V1 classification are unchanged.

### `PROJECT_STRATEGY` architecture
- `src/data/discoveryDoors.ts`: the shared "door" validation and adaptation into engine clusters, **extracted unchanged** from the V3 world builder (V3 world output is byte-identical before/after; `buildWorlds` keeps its API and messages).
- `src/data/v5Projects.ts`: V5 schema + `buildV5Projects` (one cluster per project, `v5_project_<id>`), `v5ProjectsAsRoutingEntries` (selected projects first, in selection order).
- `src/flow/journey.ts`: `PROJECT_STRATEGY` (`id: "projects"`) next to the frozen `BRAND_STRATEGY` (V2/V4) and `WORLD_STRATEGY` (V3/V4/V5). Clusters = V5 project clusters + V2 clusters (so reality checks reach every program as in V2–V4).
- `BRAND_STRATEGY` and every V4 file are unchanged (`git diff` against the V4 baseline tag is empty for `src/app/v4`, `V4Provider`, `v4Rules`, `v4Persistence`, `v4Analytics`, `v4Copy`, `v4InclusiveCopy`, `career_projects.json`, `clusters.json`).

### Spotify → V1 Tech carry
The Spotify opener (`V5-SPOTIFY`) declares `reuses: { module: "v1_tech", question_id: "Q1" }` with exactly V1 Q1's answer ids (A/B/C = CS/DS/MIS), the same mechanism as the Tech world's WT1. When the router hands off to the V1 module it carries the opener answer in as the module's Q1 answer (`state.precision.carriedAnswers`), so V1 continues at Q2 and never asks Q1. V1 sees Q1 exactly once; its scoring and thresholds are unchanged. Tested: the same answers through the Technology world and through Spotify give the same asked V1 questions, the same module answers and the same V1 outcome; the result detail shows the candidate's own Spotify answer.

### Content reuse (nothing duplicated)
V5 authors **only its ten openers**. Follow-ups are existing authored questions borrowed by id:

| Project | Borrowed |
|---|---|
| Spotify | `business` (B2–B5) + V1 Tech precision |
| Wolt | `business`, `people` |
| TikTok, Duolingo, מרכז ליווי והתפתחות | `people` (P3–P6) |
| People / HR | the People & Organizations world cluster: WO2–WO5, then `people`, `business` |
| AI legal case | `law` (L2, L3, L5, L6, L7), `communication` (C2–C5) |
| Accounting | `business` |
| Nike | `communication` |
| Apple Store | `interior_design` |

Reality checks (BR1, PR1, PR2, CR1, L4, D4 and the V1 Tech checks) apply exactly as in V2–V4.

## Language (DEC-036 inherited)
V5 inherits V4's gender-inclusive presentation layer instead of building another one (`src/data/v5Copy.ts`): `V5_UI_COPY` = V4's inclusive screen copy with the V5 project headline/helper; `V5_LEAD_COPY` = `V4_LEAD_COPY` (legal consent unchanged); `v5Text` = `v4Text`. The V5 project content is authored inclusive, so it needs no overrides. Scanned by `tests/flow/v5InclusiveCopy.test.ts` (content, own copy, every ordered selection × 4 policies in both modes) and the browser suite (`e2e/v5.spec.ts`). The V4 suite is unchanged.

**Flagged for Hebrew review (kept verbatim from the product spec):** two card lines use the impersonal "רוצים" about third parties, not the candidate: People / HR "…ואיך ליצור מקום **שרוצים** להישאר בו." and Apple Store "…למקום שאנשים **רוצים** להיכנס אליו…". Possible alternatives: "…מקום שנעים להישאר בו." / "…למקום שכיף להיכנס אליו…". They are the only allow-listed exceptions in the scan.

## Persistence
Key `colman-studymatch:v5:journey`: `{ version: 1, flow: "v5", entryMode, phase, selectedIds, answers }`, replayed through the entry mode's strategy. V5 never reads/writes V2/V3/V4 storage; V2–V4 never read V5's (tested both ways, incl. forged V4 ids in V5 project mode). Restart clears only V5.

## Analytics
Pilot measurement (DEC-038): `ui_click`, pilot feedback, outbound UTMs and the KPI contract are in `docs/V5_PILOT_MEASUREMENT.md`.

Every V5 event carries `flow_version: "v5"`; every journey event also carries `entry_mode`. Project mode emits `career_project_*` with the **V5 project ids**; world mode emits `career_world_*`. See `docs/ANALYTICS.md` ("V5 balanced project-led discovery events") for the analysis dimensions.

**Self-selection vs externally assigned entry mode:** on `/v5/start` the candidate chooses (`discovery_method_view` → `discovery_method_selected`). Traffic sent straight to `/v5/worlds` or `/v5/projects` has its mode assigned by the link: no `discovery_method_selected` is fabricated, but every downstream event still carries `entry_mode`. Compare the two populations by landing URL / presence of `discovery_method_selected`; an externally assigned split is the clean A/B design (no self-selection bias).

## Lead
Same `POST /api/v2/lead`. V5 sends `flow_version: "v5"`, `entry_mode`, and both lists with exactly one populated. **Project ids are validated per flow version**: V2/V3/V4 accept only V2's career-project ids; V5 accepts only V5 ids (so `spotify_discovery` sent as V4, or `wolt_new_city` sent as V5, is rejected; `duolingo_persistence` and `apple_store_space` exist in both lists and are valid in both). Mixed lists, a missing or mismatched entry mode and unknown ids are rejected. V2/V3/V4 payloads are unchanged.

**Sheet (n8n "Colman Webhook for question engine", tab `Leads`):** the only change is that `Normalize Lead` now accepts `v5` (before, an unknown version fell back to `v2`). `source` = `colman_studymatch_v5`; `entry_mode`, `selected_project_ids` (V5 ids) and `selected_world_ids` use the existing columns. Live-tested: one V5 projects lead, one V5 worlds lead, one duplicate resend (deduplicated); only the test rows were deleted afterwards; existing rows untouched.

## Traversal QA
`tests/flow/v5Traversal.test.ts` (`CALIBRATION_REPORT=1` prints the tables) walks **all 100 ordered opening selections** (10 singles + 90 ordered pairs) with the same memoised methodology as V2/V3/V4, and the 81 ordered world selections.

| Mode | Selections | Complete paths | Recommended | Near tie | Insufficient | Tech precision | needs_focus_content | Max scored | Max answers |
|---|---|---|---|---|---|---|---|---|---|
| V5 Projects | 100 | 285,813 | 17,065 | 50,806 | 28 | 217,914 | **0** | 5 | 11 |
| V5 Worlds | 81 | 242,946 | 13,198 | 34,885 | 25 | 194,838 | **0** | 5 | 11 |

V5 Worlds equals V4 Worlds exactly (same `WORLD_STRATEGY` object; same path counts). Longest V5 project path: Spotify → Wolt (11 answers: two openers + the V1 module). Path counts are dominated by the V1 Tech subtree (many leaves), so per-project shares are read on generic paths only:

| Single project | Paths | Recommended (of generic) | Near tie (of generic) | Max answers | Programs reachable |
|---|---|---|---|---|---|
| Spotify | 1,282 | – (100% V1 precision) | – | 7 | CS, DS, MIS (+ V1 no strong fit) |
| Wolt | 1,993 | 21.3% | 78.5% | 7 | BA, Econ & Mgmt, Econ & Psych, Accounting, Psych, Behavioral, Education |
| TikTok | 4,721 | 16.4% | 83.5% | 7 | Psych, Behavioral, Econ & Psych, Education |
| Duolingo | 5,215 | 15.3% | 84.7% | 7 | Psych, Behavioral, Econ & Psych, Education |
| People / HR | 1,524 | 34.4% | 65.4% | 5 | Behavioral, Econ & Psych, BA, MIS |
| מרכז ליווי והתפתחות | 5,215 | 15.3% | 84.7% | 7 | Psych, Behavioral, Econ & Psych, Education |
| AI legal case | 862 | 31.6% | 68.1% | 7 | Law, BA, Communication, Comm & Mgmt, MIS |
| Accounting | 944 | 29.1% | 70.6% | 6 | Accounting, Econ & Mgmt, BA |
| Nike | 944 | 29.1% | 70.6% | 6 | Communication, Comm & Mgmt, BA |
| Apple Store | 789 | 32.6% | 67.0% | 6 | Interior Design, Communication, BA, Behavioral |

Equal-weight enumeration over-represents "unusual" answer mixes; these are coverage numbers, **not** predictions, and nothing was tuned from them. Highest near-tie pairs: the People trio (Duolingo / מרכז ליווי והתפתחות / TikTok in any order, ~85% of generic paths). Insufficient evidence is rare everywhere (openers have no neutral answer). Pairs with Spotify enter Tech precision on ~99.5% of (V1-heavy) paths.

## Product review (findings, not tuned)
1. **Direct doors:** all 14 programs have a direct opener answer (table above).
2. **Card distinctness:** the ten cards are distinct activities; titles mix companies and settings by design.
3. **People / HR vs מרכז ליווי והתפתחות:** genuinely different downstream (HR: WO2–WO5 + people + business, reaching BA/MIS; Development: the people cluster, reaching Psych/Behavioral/Education). ✔
4. **⚠ Duolingo and מרכז ליווי והתפתחות collapse downstream:** same pool (Psych, Behavioral, Education) and the same borrowed `people` questions, so after the opener the journeys are identical (identical traversal). The doors differ at card/opener level only.
5. **TikTok:** the opener separates Psych / Behavioral / Econ & Psych directly, and P3–P6 keep separate options for each. ✔ (TikTok, Duolingo and Development share P3–P6; high near-tie share under equal-weight enumeration.)
6. **Duolingo:** Education / Psych / Behavioral each have their own opener answer and P3–P6 options. ✔
7. **Accounting:** own door, own opener answer, a dedicated option in every B2–B5 question and its own reality check (BR1); not swallowed by BA / Econ & Mgmt. ✔
8. **Law:** five authored law focus questions (L2, L3, L5, L6, L7) + C2–C5 + reality check L4 after the opener. ✔
9. **Communication vs Comm & Mgmt:** separate opener answers (Nike A / B), separate options in C2–C5, CR1 reality check for Comm & Mgmt. ✔
10. **Spotify carry:** no duplicate Q1, no double counting (tested), with the BA adjacency noted above.
11. **⚠ Breadth of Business Administration:** BA is a direct opener answer in 6 of 10 projects (and adjacent in Spotify). It is the most reachable program; watch real data for BA acting as a catch-all.

## Open
- Hebrew review of the two flagged card lines and of the project-screen helper.
- Whether Duolingo and מרכז ליווי והתפתחות need differentiated follow-ups (product decision; nothing was added).
- Traffic split (self-selection on `/v5/start` vs externally assigned `/v5/worlds` / `/v5/projects`) is a product decision.
