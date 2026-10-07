# V2 Routing and Scoring (THI-14)

How StudyMatch V2 narrows all-program discovery to a result, and how it hands the tech room to the unchanged V1 engine. Decision: DEC-030. V1 scoring (`docs/SCORING.md`, DEC-018 to DEC-021) is untouched.

**Mental model:** V2 knows which room to enter; V1 asks the smart questions inside the tech room.

```
career-project selection (1-2, routing only)
  -> project scenario(s)
  -> shortlist
  -> precision module when the shortlist is inside one (today: V1 CS / DS / MIS)
  -> otherwise focus questions over the evidence leading set (authored, else generated 2- or 3-way)
  -> reality check (evidence only)
  -> result: recommended / near tie / insufficient positive evidence, or the module's own result
```

Code: `src/engine/v2/` (pure, framework-free), wired to the real data in `src/flow/v2Step.ts` (`nextDiscoveryStep`). UI, persistence and analytics are THI-16.

## Scoring (generic V2 only)

| Signal | Points | Notes |
|---|---|---|
| Project selection | **0** | Builds the candidate pool only. Never a prior, never a tie-break. |
| Scenario answer | **+3** | To each program the chosen option points to. |
| Focus answer (authored or generated 2-/3-way) | **+4** | To each program the chosen option points to. |
| Curated tiebreaker | **+5** | Only after 3 scored answers. |
| Reality check | **0** | Recorded as evidence; never ranks (DEC-009). |

- These are transparent **calibration seeds**, not psychometric scores. They are never shown to candidates.
- **Multi-target answers:** an option that names several programs gives the **full** weight and **one** supporting answer to each. Weights are never split.
- **Neutral answers** (e.g. "neither") name no program, add no points and no support. They still count as a scored answer for the 3-answer minimum and the 5-answer ceiling.
- **Support** is the number of scored answers that pointed to a program. Only actual answers count. Project membership, pool order, catalogue order and cluster order never do.
- Every scored answer keeps its provenance: question id, chosen option, programs supported, weight class, and source (an authored cluster question, or a generated focus question with the programs it compared).

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
4. **Reality checks** for the resolved program(s), by explicit applicability (see "Reality checks" below); recorded, never ranked.
5. **Next focus question** over the **evidence leading set** (below):
   - an authored general cluster question (no `project_ids`) that **separates every member of the set** (each member has an option that points to it and to no other member), in active-cluster order then position;
   - else a generated **2- or 3-way focus question** from the members' work statements;
   - else an explicit **`needs_focus_content`** step listing the unresolved programs. The engine never guesses, never trims the set, and never falls back to pool order.

Given the same projects, answers and data, the next step is always identical. There is no randomness.

## Evidence leading set

Two different things are kept apart:
- **Full ranking** (`state.ranking`): every rankable program, including those at 0 points / 0 support, which share a rank. It is a diagnostic and is unchanged.
- **Evidence leading set** (`evidenceLeadingSet`, `src/engine/v2/genericFocus.ts`): the evidence-based contenders that adaptive question selection compares.

**A program with no supporting answer is not an evidence-based runner-up once another program has positive evidence** (DEC-022: classify only from expressed preferences; the same principle as the shortlist). It stays rankable and eligible for future questions, and becomes a contender, and can enter the shortlist, as soon as an actual answer supports it.

The set is built from shared ranks only, never from array position:
- **At least one program has support:** only supported programs count.
  - Two or more supported programs share the top rank: **that whole group**.
  - Otherwise: the leader plus **every supported** program sharing the next supported rank.
  - Exactly one supported program: **the leader alone**. This is not a recommendation: the clear-leader rule (3 answers, 2 supports, lead 4) still decides. Until then, an authored question that offers the leader and an alternative is asked; no 1-way question is generated.
- **No program has support yet:** the whole no-evidence group (every program at 0 / 0, sharing the top rank). No leader is invented; a broad authored question that separates them may be asked; at the ceiling a neutral path ends in `insufficient_positive_evidence`.

**Example (Wolt + Nike):** B1 and C1 both pick Business Administration, so BA is 6/2 and Economics, Accounting, Communication and Communication & Management are 0/0.
- Before this rule, the four zero-evidence programs shared the next rank, so the set had five programs and the router returned `needs_focus_content` after two answers.
- Now the set is `[BA]`. With two answers there is no recommendation yet, so the router asks B2, which tests BA against Economics and Accounting.
  - If the third answer supports BA, BA is the clear leader.
  - If it supports Economics, Economics joins the set (`[BA, ECON]`) and B3 separates them. The untested programs still do not join.

| Leading set | What is asked |
|---|---|
| 1 program | An authored question offering it and an alternative, else `needs_focus_content`. Never a synthetic 1-way question. |
| **2 programs** | An authored question separating both, else a generated **2-way** focus question. |
| **3 programs** | An authored question separating all three, else a generated **3-way** focus question. |
| **More than 3** (supported, or all without evidence) | An authored question separating all of them, else **`needs_focus_content`** with all their ids. Never a pair or triple chosen by id. |

Program ids decide only the **display order** of options and the canonical question id, never which contender is compared or omitted.

## Generated focus questions (2- or 3-way)

When no authored question separates the leading set, the engine builds `focus:<a>|<b>[|<c>]:<i>`:
- options A, B (and C) are each program's work statement `i`, in canonical id order, plus a neutral "neither";
- choosing a program's option gives that program **+4 and one support**, and nobody else anything;
- "neither" adds no points or support but counts toward the 3-answer minimum and the 5-answer ceiling;
- `i` is the number of generated focus questions already asked for exactly that program set.

The statements are curated data (`work_statements_he` in the catalog; three per program, authored in THI-15). Nothing is generated at runtime, and no N×N pair or triple content is authored. If any member lacks a statement at index `i`, the step is `needs_focus_content`; with three statements per program this cannot happen before the ceiling in any production path except a program set that is asked about three times in a row (see "Content availability").

## Reality checks

A reality check declares which program(s) it is about in `reality_for_program_ids` (data) / `realityForProgramIds` (engine). Applicability is explicit, never inferred from cluster membership or order:
- **Required** on every reality check: non-empty, valid program ids, each a core or adjacent program of the check's cluster. Its options name no programs, carry a `reality_level`, and are worth 0. **Forbidden** on every other question kind.
- After resolution, the router searches **all** clusters (not only the active ones) for unanswered checks whose applicability includes a resolved program. So when Business Administration wins as an adjacent program inside the Law cluster, a Business Administration check is asked; the Law check is not borrowed.
- **At most one check per resolved program.** For a near tie, the programs are taken in their ranked order, so each one can get its own check. A check about several programs covers each of them.
- Among checks that apply to the same program, the lowest question id goes first: ordering only among genuinely applicable checks, never a cluster or position heuristic.
- No applicable check: the flow completes cleanly.
- Recorded in `realityEvidence` with `forProgramIds`; scores, support, ranking and the answer count never change.

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

A cross-cluster Spotify run asks the generic questions before handoff plus V1's remaining 4–6, so it can be longer than the 5–7 of a focused run. **Accepted product decision:** this is inherent to "V2 decides the room, V1 decides inside it"; THI-16 QA must measure the actual journey length.

## Result states

| State | Meaning |
|---|---|
| `recommended` | Generic clear leader. |
| `near_tie` | Two or more programs still close at the ceiling. |
| `insufficient_positive_evidence` | No defensible leader from expressed preferences (neutral / rejecting answers, or a leader with a single supporting answer). Never turned into a fake recommendation. |
| `precision` | The module's own result (for `v1_tech`, the V1 `FitResult` with its DEC-018 classes, including V1 no strong fit). |
| `needs_focus_content` (step, not a result) | Content gap: nothing can separate the evidence leading set (a lone supported leader with no authored alternative left, more than three contenders, or missing work statements). Lists the contenders' ids. Not reached by any production non-tech selection (see "Content availability"). |

### Open product decision: a generic "no strong fit" threshold
V1's normalized-fit thresholds (DEC-018) belong to V1's vector model and are **not** transplanted into V2 points. The accepted V2 docs define no generic no-strong-fit threshold. The generic engine therefore only distinguishes the three states above. For example, it does not treat "a clear leader built only on weak signals" as no fit. **Proposed, pending product review:** decide whether weak-but-positive generic results need their own state, and on what evidence, once THI-15 content and real usage exist.

## Content availability (THI-15)
The production content makes the routing rules above concrete:
- **Openers are forced; follow-ups have a neutral option.** Project-opening scenarios (B1, P1, P2, C1, L1, D1) always name a program, so the first answer is a real work-preference signal. Every later authored focus question includes a neutral "neither" (0 points, 0 support, counts toward the ceiling). A candidate can therefore say a follow-up does not fit them without forcing a program into evidence.
- **At least five authored scored questions** are available to every single project (Law and Interior Design six, People five per project from six in the cluster). A lone supported leader is tested by authored questions that offer it and an alternative until a clear leader or the 5-answer ceiling.
- **`insufficient_positive_evidence` is production-reachable:** opener plus neutral for every follow-up ends there at five scored answers (one support, once).
- **Walk of every answer path** of the 6 single-project and 15 two-project non-tech selections (19,381 complete paths): 4,740 recommended, 14,624 near ties, 17 insufficient positive evidence, **0 content gaps**. At most 5 scored answers, at most 7 candidate answers including reality checks. Law and Interior Design carry L7 / D7 (narrow comparisons with Business Administration) so a lone adjacent Business leader can always be tested to the ceiling with authored content.
- **Near ties are frequent by path count** because every non-neutral answer supports some program and a clear leader needs a lead of at least 4. Path counts weight options equally; real frequencies need THI-16 usage data.
- Spotify combined with another project is longer than the 5-7 of a focused run (up to 11 answers measured). Accepted in THI-14; THI-16 QA must measure the real journey length.

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
| B1=B | ECON 3/1 | ECON | ask B2 (separates_leaders). Evidence set: [ECON] (BA and ACC are untested at 0/0); B2 tests ECON against them |
| B2=A | BA 3/1, ECON 3/1 | BA, ECON | ask B3 (separates_leaders) |
| B3=B | ECON 6/2, BA 3/1 | ECON, BA | ask B4 (separates_leaders). 6 vs 3 is not clear (lead 3 < 4) |
| B4=A | BA 7/2, ECON 6/2 | BA, ECON | ask focus:business_administration\|economics_and_management:0 (generic_focus) |
| focus …:0=B | ECON 10/3, BA 7/2 | ECON, BA | complete: near tie ECON/BA (ceiling_near_tie) |

### C. TikTok + Nike (Behavioral Science vs Communication & Management), fixture
| Answer | Points / support | Shortlist | Next step |
|---|---|---|---|
| select TikTok + Nike | - | - | ask P1 (project_scenario) |
| P1=B | BEH 3/1 | BEH | ask C1 (project_scenario) |
| C1=B | BEH 3/1, COMMGMT 3/1 | BEH, COMMGMT | ask focus:behavioral_science\|communication_and_management:0 (generic_focus) |
| focus …:0=B | COMMGMT 7/2, BEH 3/1 | COMMGMT | complete: COMMGMT (clear_leader) |

No authored Behavioral Science vs Communication & Management question exists or is needed.
