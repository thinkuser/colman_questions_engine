# V2 Routing and Scoring (THI-14)

How StudyMatch V2 narrows all-program discovery to a result, and how it hands the tech room to the unchanged V1 engine. Decision: DEC-030. V1 scoring (`docs/SCORING.md`, DEC-018 to DEC-021) is untouched.

**Mental model:** V2 knows which room to enter; V1 asks the smart questions inside the tech room.

```
career-project selection (1-2, routing only)
  -> project scenario(s)
  -> shortlist
  -> precision module when the shortlist is inside one (today: V1 CS / DS / MIS)
  -> otherwise generic focus questions / head-to-head
  -> reality check (evidence only)
  -> result: recommended / near tie / insufficient positive evidence, or the module's own result
```

Code: `src/engine/v2/` (pure, framework-free), wired to the real data in `src/flow/v2Step.ts` (`nextDiscoveryStep`). UI, persistence and analytics are THI-16.

## Scoring (generic V2 only)

| Signal | Points | Notes |
|---|---|---|
| Project selection | **0** | Builds the candidate pool only. Never a prior, never a tie-break. |
| Scenario answer | **+3** | To each program the chosen option points to. |
| Focus / head-to-head answer | **+4** | To each program the chosen option points to. |
| Curated tiebreaker | **+5** | Only after 3 scored answers. |
| Reality check | **0** | Recorded as evidence; never ranks (DEC-009). |

- These are transparent **calibration seeds**, not psychometric scores. They are never shown to candidates.
- **Multi-target answers:** an option that names several programs gives the **full** weight and **one** supporting answer to each. Weights are never split.
- **Neutral answers** (e.g. "neither") name no program, add no points and no support. They still count as a scored answer for the 3-answer minimum and the 5-answer ceiling.
- **Support** is the number of scored answers that pointed to a program. Only actual answers count. Project membership, pool order, catalogue order and cluster order never do.
- Every scored answer keeps its provenance: question id, chosen option, programs supported, weight class, and source (an authored cluster question or a head-to-head pair).

## Rankable programs and adjacent programs

- At the start, the rankable programs are the candidate pool (the union of the selected projects' programs).
- A cluster's **adjacent** programs (e.g. Business inside the Law cluster) become rankable **only after an answer actually points to them**. Being allowed by the cluster gives nothing (DEC-022: classify only from expressed preferences). These are reported as `surfacedProgramIds`.

## Ranking, shortlist, stop rules

- **Ranking:** by score, then support. Programs with equal score and support **share a rank**: a true tie stays a tie. Inside a tie the array is ordered by program id only for determinism; this is never a ranking signal (DEC-027).
- **Shortlist:** programs with at least one supporting answer that are less than 4 points behind the leader. Empty while there is no positive evidence.
- **Clear leader** (evaluated only after **3 scored answers**): at least **2 supporting answers** and a lead of **4 or more points** over the next program.
- **Ceiling: 5 scored answers.** At the ceiling the result is:
  - `recommended` if there is a clear leader;
  - `near_tie` if two or more supported programs are within 4 points. This is a valid result, not a failure;
  - `insufficient_positive_evidence` otherwise.

## Routing order (each step replays all answers)

1. **Precision handoff** if a module can decide:
   - every rankable program is the module's (e.g. Spotify alone), or
   - after the project scenarios, the evidence shortlist sits entirely inside the module, with at least `minPrograms` (2) of its programs in play.
2. **Project scenarios:** each selected project's opening scenario (`project_ids`), in project display order, then by position.
3. **Resolution:** a clear leader, or the ceiling.
4. **Reality checks** of the active clusters whose core programs include the resolved program(s); recorded, never ranked.
5. **Next focus question:**
   - an authored general cluster question (no `project_ids`) that **separates the leader from the runner-up** (an option for each, not shared), in active-cluster order then position;
   - else a generated **head-to-head** between the two leaders;
   - else an explicit **`needs_focus_content`** step. The engine never guesses and never falls back to pool order.

Given the same projects, answers and data, the next step is always identical. There is no randomness.

## Generic head-to-head

When no authored question separates the two leaders, the engine builds `h2h:<a>|<b>:<i>`:
- option A is program a's work statement `i`, option B is program b's statement `i`, plus a neutral "neither";
- the pair is in canonical id order, which is not a ranking;
- `i` is the number of head-to-heads already asked for that pair.

The statements are curated data (`work_statements_he` in the catalog; THI-15 content). Nothing is generated at runtime, and no N×N pair content is authored. If either program lacks a statement at index `i`, the step is `needs_focus_content`.

## Precision modules and the V1 tech module

`PrecisionModuleAdapter` (`src/engine/v2/precision.ts`) answers:
- eligibility (`programIds`, `minPrograms`);
- which questions are its own (`ownsQuestion`);
- its next step for the programs in play and its answers (`next`): ask, or complete with its own result.

The only module is **`v1_tech`**: the unchanged V1 adaptive engine for CS / DS / MIS, receiving the programs in V1's canonical order. It keeps everything V1 does: opening questions, math self-rating, CS↔DS / CS↔MIS / DS↔MIS branches, near tie, one tiebreaker, no strong fit, evidence, reality checks, and 5–7 questions. V2's +3/+4/+5 points are never applied inside it.

### No duplicate Spotify question
V1's own Q1 already is the Spotify scenario ("חברה כמו ספוטיפיי נותנת לכם פרויקט"), with options that map to CS / DS / MIS. The tech cluster therefore has a single V2 question, **`T1`**:
- it `reuses` V1 Q1, with the same option ids and V1's own Hebrew copy, and no copy of its own;
- it maps A→CS, B→DS, C→MIS for generic scoring.

| Selection | What happens |
|---|---|
| **Spotify alone** | Immediate handoff. V1 asks its own Q1 first. This is exactly the V1 experience; a regression test compares question order and result for every three-program V1 sanity case. |
| **Spotify + another project** | T1 is asked once in generic mode. On handoff its answer is carried into V1 as `Q1`, so V1 continues at Q2. Only answers to questions that `reuse` a module question are carried, as the longest prefix the module accepts. |

A cross-cluster Spotify run asks the generic questions before handoff plus V1's remaining 4–6, so it can be longer than the 5–7 of a focused run.

## Result states

| State | Meaning |
|---|---|
| `recommended` | Generic clear leader. |
| `near_tie` | Two or more programs still close at the ceiling. |
| `insufficient_positive_evidence` | No defensible leader from expressed preferences (neutral / rejecting answers, or a leader with a single supporting answer). Never turned into a fake recommendation. |
| `precision` | The module's own result (for `v1_tech`, the V1 `FitResult` with its DEC-018 classes, including V1 no strong fit). |
| `needs_focus_content` (step, not a result) | Content gap: nothing can separate the leaders. Expected for non-tech projects until THI-15. |

### Open product decision: a generic "no strong fit" threshold
V1's normalized-fit thresholds (DEC-018) belong to V1's vector model and are **not** transplanted into V2 points. The accepted V2 docs define no generic no-strong-fit threshold. The generic engine therefore only distinguishes the three states above. For example, it does not treat "a clear leader built only on weak signals" as no fit. **Proposed, pending product review:** decide whether weak-but-positive generic results need their own state, and on what evidence, once THI-15 content and real usage exist.

## Pressure-test traces

Points/support are `score/support`. Generated by `tests/engine/v2/pressure.report.test.ts` (`CALIBRATION_REPORT=1`). B and C use synthetic fixture questions shaped like the approved bank (production content is THI-15). These are sanity checks; the weights were not tuned on them.

### A. Spotify (Tech), production data
| Answer | Points / support | Shortlist | Next step |
|---|---|---|---|
| select Spotify | - | - | precision v1_tech: ask Q1 |
| Q1=A | - | - | precision v1_tech: ask Q2 |
| Q2=A | - | - | precision v1_tech: ask Q3 |
| Q3=5 | - | - | precision v1_tech: ask CSDS-1 |
| CSDS-1=cs | - | - | precision v1_tech: ask CSDS-2 |
| CSDS-2=cs | - | - | complete: V1 CS (strong_fit) |

### B. Wolt (Business vs Economics), fixture
| Answer | Points / support | Shortlist | Next step |
|---|---|---|---|
| select Wolt | - | - | ask B1 (project_scenario) |
| B1=B | ECON 3/1 | ECON | ask B2 (separates_leaders) |
| B2=A | BA 3/1, ECON 3/1 | BA, ECON | ask B3 (separates_leaders) |
| B3=B | ECON 6/2, BA 3/1 | ECON, BA | ask B4 (separates_leaders). 6 vs 3 is not clear (lead 3 < 4) |
| B4=A | BA 7/2, ECON 6/2 | BA, ECON | ask h2h:business_administration\|economics_and_management:0 (head_to_head) |
| h2h …:0=B | ECON 10/3, BA 7/2 | ECON, BA | complete: near tie ECON/BA (ceiling_near_tie) |

### C. TikTok + Nike (Behavioral Science vs Communication & Management), fixture
| Answer | Points / support | Shortlist | Next step |
|---|---|---|---|
| select TikTok + Nike | - | - | ask P1 (project_scenario) |
| P1=B | BEH 3/1 | BEH | ask C1 (project_scenario) |
| C1=B | BEH 3/1, COMMGMT 3/1 | BEH, COMMGMT | ask h2h:behavioral_science\|communication_and_management:0 (head_to_head) |
| h2h …:0=B | COMMGMT 7/2, BEH 3/1 | COMMGMT | complete: COMMGMT (clear_leader) |

No authored Behavioral Science vs Communication & Management question exists or is needed.
