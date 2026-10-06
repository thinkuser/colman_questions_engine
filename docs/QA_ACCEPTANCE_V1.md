# V1 Pilot Acceptance QA (THI-12)

**Question answered:** is the current 3-program pilot (Computer Science, Data Science, Management Information Systems) safe and coherent enough to put in front of real prospective students?

**Method.** A small Playwright E2E suite against the real, production-built Next.js app (`pnpm e2e`, 75 tests, `e2e/`), supported by the existing pure unit/exhaustive tests (374). Browser: Chromium (Playwright 1.63, headless). Viewports: 390x844 for functional flows; 320x640, 390x844 and 1280x900 for layout. Two builds are served: one with `NEXT_PUBLIC_ADVISOR_URL` set and one without. No scoring, routing, thresholds, vectors, program copy or product decisions were changed to make a test pass.

**Result in one line:** one real defect found and fixed (double tap recorded two answers); no remaining blocking issues; see non-blocking follow-ups and the readiness verdict at the end.

## How to run
- `pnpm test` (unit, pure engine/flow/data/analytics/UI-render) and `pnpm e2e` (browser). The first E2E run builds both app copies (about 1 minute); later runs reuse running servers locally.
- Layout screenshots are written to `test-results/` (git-ignored) for manual review.

## Matrix

Legend: spec = file under `e2e/`. All rows PASS unless stated.

### Personas A / B / C / D
| Test / persona | Expected | Actual | Result | Browser / viewport | Notes |
|---|---|---|---|---|---|
| A: strong CS profile (3 programs) | Adaptive path of 5-7 questions, CS recommended, evidence from real answers, secondary visible, no scores, no reality check | CS recommended; 5-7 questions (5 in the sanity table), no tie-breaker; every evidence card is the wording of an answer recorded in the dataLayer; secondary section visible; no reality-check section; no `%`, decimals, enum names or dimension ids | PASS | Chromium 390 (personas.spec) | |
| B: strong DS profile | Same checks, DS | DS recommended; same checks hold | PASS | Chromium 390 | |
| C: MIS profile | Same checks, MIS, qualifier everywhere | MIS recommended; H1 shows name and `דו-חוגי עם מנהל עסקים`; every MIS occurrence in the result text (including the advisor CTA label) is followed by the qualifier | PASS | Chromium 390 | |
| D: no strong fit | No forced recommendation; two closer alternatives; compare / explore / advisor routes | Exactly 6 questions, no tie-breaker; "no clear fit" heading; no "best fit" wording; alternatives region has exactly 2 options; explore button and advisor link present (configured build); evidence built from the "neither" answers | PASS | Chromium 390 | |

### Near tie
| Test | Expected | Actual | Result | Browser | Notes |
|---|---|---|---|---|---|
| CS+DS near-tie path (7 questions) | At most one tie-breaker; near-tie language; both programs prominent; no strong-winner framing; no leaks; shared first year as context only; no MIS question | Exactly one tie-breaker (7th question); heading "ההתלבטות שלכם באמת קרובה"; two emphasised cards in the hero; no "המסלול שהכי מתאים" / "מצביעות בבירור"; the shared-first-year note sits in the decision section under "חשוב לדעת:" and not in the evidence; one "מצד שני" evidence item; no question id containing MIS | PASS | Chromium 390 | Unit sweep: every one of the roughly 5,070 answer paths across the four selections ends at 5-7 questions |

### Low math
| Test | Expected | Actual | Result | Browser | Notes |
|---|---|---|---|---|---|
| Strong CS + lowest math | CS stays first; warning appears; not disqualifying | CS recommended; reality check `cs_math_load` shown, quoting the candidate's own math answer; no disqualifying phrasing; evidence still from real answers | PASS | Chromium 390 | |
| Strong DS + lowest math | DS stays first; warning appears; not disqualifying | DS recommended; `ds_math_statistics_programming` shown with the candidate's answer quoted; wording is "כדאי לקחת בחשבון" | PASS | Chromium 390 | No model change |

### Question-count guardrail
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| All personas, plus unit-level exhaustive paths | 5-7 questions; at most one tie-breaker; none after no-fit | E2E: every persona 5-7, tie-breakers 0 or 1, none for no-fit. Unit: `tests/engine/adaptive.test.ts` enumerates every answer path for all four selections | PASS | The exhaustive proof stays in the pure tests |

### Back
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Q2 to Q1 | Previous question shown, answer removable, new exposure in analytics | Q1 shown again, durable answers empty, exposures `Q1,Q2,Q1`; changing Q1 stores the new answer | PASS | |
| Branch question to previous; change early answers | Later path recomputes; no stale branch | Back from `CSDS-1` through Q3, Q2 to Q1; re-answering as a business-minded candidate leads to `DSMIS-1`, not a CS/DS question; two `adaptive_branch_selected` events with different branches; every re-shown question is a new `question_view` | PASS | |
| Result to last question | Stale result gone; path recomputes | Result removed; last question shown; answering "neither" asks a sixth question instead of finishing; second `comparison_completed`; one `comparison_id` throughout | PASS | |
| Browser Back/Forward buttons | Never trap or break | Back from a completed comparison reaches selection with programs still selected, Forward returns to the same result; Back from questions then Start begins a clean run | PASS | |

### Restart
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| From questions | State cleared; new id on next comparison | Durable state removed, session `comparison_id` null, nothing selected, `restart_comparison` emitted; next start has a different id | PASS | |
| From result | Same | Same | PASS | |
| Focused top-two comparison | Only the top two preselected; no fake `degree_selected` | Exactly CS and DS checked, MIS not; one `restart_comparison`; `degree_selected` count unchanged; next start has a new id and cluster `computer_science|data_science` | PASS | |

### Refresh / persistence
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Refresh during opening questions | State restored; same id; no fake events | Same question shown, answers kept, session `comparison_id` unchanged, no `comparison_started`, `degree_selected`, `question_view` or branch event after reload | PASS | |
| Refresh during an adaptive branch | Same | Same (branch question restored) | PASS | |
| Refresh on result | Result recomputed, nothing re-emitted | Same heading and kind; durable payload has exactly `version, selectedProgramIds, answers`; no `comparison_completed` / `recommended_program` after reload; id unchanged | PASS | |
| Analytics vs durable storage | Separate | Analytics context only in `sessionStorage`; durable only in `localStorage`; neither contains the other's data | PASS | |

### Corrupt storage
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Not JSON; wrong version; unknown program; unknown option; extra derived data | Safe fallback to selection, entry removed, app usable | All five fall back on `/`, `/questions` and `/result`; entry removed; a new comparison starts normally | PASS | |
| Deep links without a comparison | Redirect to selection | `/result` and `/questions` redirect to `/` | PASS | |

### Analytics smoke (real `window.dataLayer`)
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Complete path with UTMs and a real double click | Contract sequence; one id; `leading_program` on answers; canonical values; UTMs; no free text; no duplicate answer | `degree_compare_view`, 3x `degree_selected`, `comparison_started`, question views/answers, exactly one `adaptive_branch_selected`, `comparison_completed`, `recommended_program`; one `comparison_id`; `leading_program` on every answer; cluster `computer_science|data_science|management_information_systems`; `utm_*` on every event; all values match `[A-Za-z0-9_|:.-]` with no Hebrew | PASS | |
| Result interactions | `mirror_response`, `secondary_program_view`, `admission_click`, `advisor_cta_click`, restart | All emitted once with result metadata and the same id; re-scrolling does not repeat the view; "not exactly" also reported without changing the result | PASS | |
| `reality_check_view` | Once per exposed check; none when no check | Zero for a coherent persona; one per check (both programs) for low-math DS; no repeats on re-scroll | PASS | |
| No strong fit | No invented recommendation | `result_kind=no_strong_fit`, no `recommended_program` event or parameter, `secondary_program` present as analytical rank #2, no tie-breaker | PASS | |

### Double tap (defect found and fixed)
| Test | Expected | Actual | Result | Notes |
|---|---|---|---|---|
| Physical double click / touch double tap on an answer | One answer recorded | **Before fix: two answers recorded** (`Q1:A, Q2:A`): the second tap landed on the next question's option at the same screen position. After fix (350 ms guard, see Findings): exactly one answer for mouse and for touch; a deliberate answer after the guard window is accepted | PASS after fix | See B-1 |

### 320px, 390px, desktop
| Check | Result | Notes |
|---|---|---|
| No horizontal overflow, no element outside the viewport, no clipped text | PASS at 320, 390, 1280 | Selection, Q1, a pair question with the neutral option, MIS result, near tie, no strong fit, low-math DS |
| `lang="he"` and `dir="rtl"`; text direction RTL | PASS | English career labels intentionally use `dir="auto"` |
| Buttons and links at least 44px; program cards at least 44px | PASS | |
| MIS name and qualifier wrap safely (selection card, hero, advisor label) | PASS | |
| Long evidence cards, near-tie two-program cards, multiple reality checks fit | PASS | Cards never wider than the viewport |
| Long result page usable; last action reachable and not covered | PASS | |
| Focus moves to each new question's heading | PASS | |
| Desktop sanity | PASS | Content column capped at 672px, centred |

### Accessibility sanity (not a WCAG audit)
| Check | Result | Notes |
|---|---|---|
| Keyboard-only: select programs, start, answer | PASS | Tab, Space, Enter |
| Visible focus indicators (checkbox, options) | PASS | Option focus outline at least 2px |
| Heading structure | PASS | One `h1` per page, no skipped levels on selection, question and four result variants |
| Accessible names on buttons, links, inputs | PASS | Includes the MIS qualifier on the selection card |
| Text contrast (4.5:1, 3:1 for large text), computed per text element | PASS | Six screens; the check asserts it inspected elements |
| Back / restart reachable by keyboard | PASS | |
| Screen reader testing | NOT DONE | Out of scope for this pass |

### Links / CTAs
| Check | Result | Notes |
|---|---|---|
| Official program links match the recommendation (CS, DS, MIS) | PASS | `colman.ac.il` pages respond 200 |
| Admissions link | PASS | `academy.org.il/admission/` responds 200 to a browser user agent (403 to bare curl; bot filtering, not a dead link) |
| Safe external links | PASS | Every external link `target="_blank"` and `rel="noopener noreferrer"`, https only |
| Advisor CTA hidden when unset; works when configured; hidden for every result kind in the unset build | PASS | Two separate builds |
| Internal routes / dead links | PASS | `/`, `/questions`, `/result` respond 200; no dead internal link; unknown route returns 404 |

### Candidate-facing copy smoke
No rewrite attempted. Every Latin-script token on every candidate screen comes from official COLMAN content (technology names, role titles, university names). No internal terminology, enum names, dimension ids or scores are visible. No grammatical or contradictory wording found in the screens reviewed (selection, questions, five result variants). One English string: see N-1.

## Findings

### Blocking issues
None remaining. One blocking-class defect was found and **fixed within THI-12**:

- **B-1 (fixed): a double tap on an answer silently recorded two answers.** The second tap landed on the next question's option at the same position, so one deliberate answer plus one accidental answer were recorded (the E2E probe showed `Q1:A, Q2:A`). On a phone, double tap is common and the damage is silent (a wrong answer shifts the recommendation). Fix: `QuestionCard` ignores taps for 350 ms after a question appears (`ANSWER_TAP_GUARD_MS`). It is an interaction guard only; scoring, routing and flow semantics are unchanged. Covered by mouse and touch E2E tests. The 350 ms value is a judgement call and worth revisiting with real candidates.

### Non-blocking follow-ups
- **N-1.** The unknown-route 404 page is the default English Next.js text ("This page could not be found.") inside the Hebrew document. Candidates only see it via a bad URL. Add a Hebrew 404.
- **N-2.** The advisor destination is not defined anywhere: the CTA is hidden until `NEXT_PUBLIC_ADVISOR_URL` is set. Product must provide the destination before launch if an advisor route is wanted.
- **N-3.** DEC-018 (fit / near-tie / reality-check thresholds) is still **"proposed - pending review"** by product. The behaviour validated here depends on it. Recommend accepting or adjusting it with real-candidate data.
- **N-4.** Coverage is Chromium only. No Firefox, WebKit/iOS Safari, real-device or screen-reader testing. Do a short real-device pass (iOS Safari, Android Chrome) before launch.
- **N-5.** The E2E suite runs against the production build. React Strict Mode double-effects (dev only) were verified manually during THI-11 but are not part of the automated run.
- **N-6.** At 320px the three step-indicator pills wrap onto two lines each. Cosmetic.
- **N-7.** Hebrew copy is a first draft (carried from THI-10). A native-speaker review and real candidate feedback should drive any wording changes.
- **N-8.** `secondary_program_view` / `reality_check_view` are deduplicated in memory, so a refresh while the section is in view counts again (documented in `docs/ANALYTICS.md`).
- **N-9.** Next.js auto-adds the E2E build folders to `tsconfig.json` `include` when the E2E servers build. It is harmless but noisy in diffs.

### Pilot readiness
**READY WITH KNOWN NON-BLOCKERS**

All core paths work end to end (four personas, near tie, low-math cases, Back, restart, refresh, corrupt storage, analytics, mobile and RTL), and the one defect found (B-1) is fixed and covered. Before real candidates see it, product should resolve N-2 (advisor destination) and N-3 (accept the thresholds), and run the N-4 real-device smoke.
