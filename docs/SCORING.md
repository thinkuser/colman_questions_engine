# Scoring Engine V1

The deterministic fit engine, implemented in `src/engine` (THI-7). It decides fit. An LLM may only explain the result (DEC-003). The engine is pure: it receives questions, answers, program vectors and reality-check definitions as input. It never reads admissions (DEC-008), UI state, or the data layer directly.

Status:
- Formula: **accepted** (DEC-019).
- Q3 math mapping: **accepted** (DEC-020).
- All thresholds: **proposed, pending review** (DEC-018). They must be **revalidated in THI-8** once the real pair-question signals exist.

## Formula (DEC-019)

For the questions actually asked, with weight `w(q)` from the question type (scenario 3, tradeoff 3, preference 2, self_rating 1.5, career_label 1):

```
C[d]                 = Σ_q w(q) × signal(chosen option of q)[d]                    candidate vector
contribution(q,o,P)  = w(q) × Σ_d signal(o)[d] × P[d]
raw_fit(P)           = Σ_d C[d] × P[d]           (= Σ_q contribution(q, chosen, P))
ideal(P)             = Σ_q max_o contribution(q, o, P)                             attainable ideal
normalized_fit(P)    = clamp(raw_fit(P) / ideal(P), 0, 1);   no usable signal if ideal(P) <= 0
```

- The ideal uses the **same questions, options, weights, signals, and dimensions** the candidate saw; there is no hand-entered ceiling.
- `normalized_fit` drives ranking, classification, and near-tie logic. `raw_fit` is diagnostic only. **Neither is ever shown as a percentage** (DEC-004).
- All dimensions have equal weight, because the docs define no dimension weights.
- Exact ties keep selection order, so the output is deterministic.

### Decompositions (for explanation, not scoring)
- Per dimension: `C[d] × P[d] / ideal(P)`. These sum to the unclamped `raw_fit / ideal`, which equals `normalized_fit` whenever the ratio is ≥ 0.
- Per answer: `contribution(q, chosen, P) / ideal(P)`. The same sum.
- Evidence keeps **every** answered question, including answers that worked against #1. `topVsSecond` is the answer's share of #1 minus its share of #2, and the evidence values sum to the top-two gap.
- The trade-off holds signed per-dimension deltas between #1 and #2, which also sum to the gap. THI-10 writes the copy.

## Result semantics
| Field | Rule |
|---|---|
| `fitClassification` | Class of the top-ranked program |
| `bestFitProgram` | Top program, or **`null` when `no_strong_fit`** (DEC-010) |
| `secondaryProgram` | Second program, or `null` when `no_strong_fit` |
| `mainDecision` | Top two by normalized fit; **kept even for `no_strong_fit`** |
| `nearTie` | Top-two gap `< NEAR_TIE_MAX_GAP`; computed always, **never overrides `no_strong_fit`** |
| `realityChecks` | Triggered checks for the top two only; never modify scores |

## Constants

| Constant | Value | Status |
|---|---|---|
| `QUESTION_TYPE_WEIGHTS` | 3 / 3 / 2 / 1.5 / 1 | Documented (QUESTION_ENGINE.md) |
| `FIT_THRESHOLDS.strong_fit` | `normalized_fit ≥ 0.80` | **Proposed** (DEC-018) |
| `FIT_THRESHOLDS.good_fit` | `≥ 0.65` | **Proposed** |
| `FIT_THRESHOLDS.consider_carefully` | `≥ 0.50`; below → `no_strong_fit` | **Proposed** |
| `NEAR_TIE_MAX_GAP` | top-two gap `< 0.05` | **Proposed** |
| `REALITY_CHECK_BOTTOM_FRACTION` | value `< min + (max − min) / 3` | **Proposed** (formula specified in review) |
| `REALITY_CHECK_MAX_SIGNAL` | value also `< 0` (net-negative evidence) | **Proposed**, an addition in this PR (see below) |
| `mathToleranceSignal` | `math_affinity = answer − 3` | Accepted (DEC-020) |

### Reality-check trigger
For each related dimension of a check, the engine computes the attainable range of `C[d]` over the questions actually asked: each question contributes its minimum or maximum option. A dimension is **materially low** when:
1. the range has variation (`max > min`); and
2. `C[d] < min + (max − min) / 3`; and
3. `C[d] < 0`, meaning net-negative evidence.

A check fires when at least one related dimension is materially low, and only for the top two programs. It never changes scores.

**Why condition 3 was added:** without it, simply *not choosing* a dimension's options triggered warnings. The value sits at 0, which is the bottom of a 0..max range. In the first calibration run, 8 of 10 sanity cases fired checks. For example, Persona A (math = 5) got the MIS "technical and quantitative load" warning only because they never chose a statistics option. With condition 3, checks fire only on real negative signals, such as low math tolerance or "least attractive: coding". This is proposed for review as the meaning of "materially".

## Calibration method and rationale

Thresholds are **seeds**, chosen for interpretability rather than fitted to personas:
- **strong ≥ 0.80:** the candidate achieved at least 80% of what the asked questions could express for this program. Most heavily weighted answers are aligned.
- **good ≥ 0.65:** most of the program's attainable fit, with some answers pointing elsewhere.
- **consider ≥ 0.50:** about half aligned; a genuine mixed picture.
- **no strong fit < 0.50:** less than half of the program's attainable fit.
- **near tie < 0.05:** the top two are within 5% of their own ideals.

They were then **validated, not tuned**, in two ways:
1. The sanity cases below (`tests/engine/personas.test.ts`).
2. An exhaustive enumeration of every answer combination for each pair flow:

```
CALIBRATION_REPORT=1 pnpm vitest run tests/engine/calibration.report.test.ts
```

No threshold was changed after seeing the results. The sanity-case answers reflect each persona's described traits and were fixed before the run.

**Fixtures:**
- Q1, Q2 and Q3 use the documented signals and the DEC-020 mapping.
- The pair questions (`SYN_CSDS_*`, `SYN_CSMIS_*`, `SYN_DSMIS_*`), their `neither` options, and `SYN_LEAST_ATTRACTIVE` are **synthetic, assumed signals**.

### Sanity-case table
Real program vectors and reality checks; synthetic pair signals. Values are internal `normalized_fit`, never shown to candidates.

| Case | Ranking (normalized fit) | Class | Best | Near tie | Reality checks |
|---|---|---|---|---|---|
| Persona A (CS) | CS 1.000 > MIS 0.757 > DS 0.753 | strong_fit | CS | no | — |
| Persona B (DS) | DS 0.970 > MIS 0.674 > CS 0.633 | strong_fit | DS | no | — |
| Persona C (MIS) | MIS 0.968 > DS 0.465 > CS 0.387 | strong_fit | MIS | no | — |
| Persona D (no fit) | MIS 0.459 > DS 0.097 > CS 0.000 | **no_strong_fit** | null | no | DS math/stats/programming; MIS technical load |
| Low math, CS interests | CS 0.875 > MIS 0.681 > DS 0.624 | strong_fit | CS | no | CS math load; MIS technical load |
| Low math, DS interests | DS 0.879 > MIS 0.622 > CS 0.538 | strong_fit | DS | no | DS math/stats/programming; MIS technical load |
| Mixed CS/DS (2 selected) | DS 0.849 > CS 0.819 | strong_fit | DS | **yes** | — |
| Mixed three-way | MIS 0.785 > DS 0.731 > CS 0.703 | good_fit | MIS | no (gap 0.054) | — |
| Weak profile | MIS 0.416 > CS 0.297 > DS 0.258 | no_strong_fit | null | no | — |
| Mirrored CS/DS (2 selected) | DS 0.867 > CS 0.793 | strong_fit | DS | no (gap 0.074) | — |

### Exhaustive answer-space distribution (classification of the top program)
| Flow (all 3 programs selected) | Combinations | strong | good | consider | no strong | near tie | top-fit p10 / p50 / p90 |
|---|---|---|---|---|---|---|---|
| CS vs DS questions | 1215 | 28.1% | 40.8% | 25.2% | 5.8% | 24.6% | 0.542 / 0.713 / 0.869 |
| … without `neither` options | 360 | 77.8% | 22.2% | 0.0% | **0.0%** | 31.7% | 0.772 / 0.839 / 0.935 |
| CS vs MIS questions | 405 | 26.9% | 40.2% | 26.2% | 6.7% | 24.4% | 0.536 / 0.713 / 0.870 |
| … without `neither` options | 180 | 58.3% | 41.7% | 0.0% | **0.0%** | 22.2% | 0.718 / 0.809 / 0.913 |
| DS vs MIS questions | 405 | 24.0% | 39.8% | 27.7% | 8.6% | 31.9% | 0.519 / 0.704 / 0.865 |
| … without `neither` options | 180 | 51.1% | 47.2% | 1.7% | **0.0%** | 25.6% | 0.704 / 0.801 / 0.911 |

### Findings for review (not fixed by tuning)
1. **Positive-only questions can never produce `no_strong_fit`.** Without neutral or negative options, no answer combination falls below 0.50; the best program always gets at least partial credit. This confirms the THI-8 requirement below.
2. **Persona D clears the line only narrowly** (0.459 vs the 0.50 threshold). This depends heavily on how much neutral or negative information the real questions carry.
3. **Mixed profiles can still land in `good_fit`.** "Mixed three-way" gives all three programs 0.70–0.79. MIS has a broad vector (4s on software, data and coding), so scattered answers earn partial credit everywhere. The small gap is the more useful signal here; consider a margin-aware classification in THI-8 if this proves common.
4. **MIS is often second for clear CS or DS candidates** (Persona A: MIS 0.757 just ahead of DS 0.753). This comes from the documented vectors, not the formula.
5. **Near ties are frequent across the full answer space** (22–32%). THI-8's tie-breaker budget must fit the 5–7 question target; this may justify revisiting `NEAR_TIE_MAX_GAP`.

## Requirements handed to THI-8
- **The real question bank must carry enough neutral or negative information** (e.g. "neither", "least attractive", "none of these") to identify genuine `no_strong_fit` candidates. Otherwise the engine will push everyone towards one of the pilot programs (finding 1).
- **Revalidate all DEC-018 thresholds** against the real CSDS / CSMIS / DSMIS signals by re-running the calibration report and updating this document.
- **Q3 must use `mathToleranceSignal`** (DEC-020) with type `self_rating`.
- Pass **every option** of each asked question to the engine; the attainable ideal depends on them.
