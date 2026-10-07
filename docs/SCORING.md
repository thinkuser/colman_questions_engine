# Scoring Engine V1

> **V1 only.** This is the V1 CS / DS / MIS vector engine. It runs unchanged as the V2 `v1_tech` precision module. Generic V2 points, stop rules and routing are separate: see `docs/V2_SCORING.md` (DEC-030).

The deterministic fit engine, implemented in `src/engine` (THI-7). It decides fit. An LLM may only explain the result (DEC-003). The engine is pure: it receives questions, answers, program vectors and reality-check definitions as input. It never reads admissions (DEC-008), UI state, or the data layer directly.

Status:
- Formula: **accepted** (DEC-019).
- Q3 math mapping: **accepted** (DEC-020).
- All thresholds: **accepted as the V1 pilot operational baseline** (DEC-018); heuristics, not scientifically validated, to be revisited with real-candidate data and not tuned before the pilot. **Revalidated in THI-8** against the real question bank (DEC-021) and kept unchanged; see "THI-8 revalidation" below.

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
| `REALITY_CHECK_MAX_SIGNAL` | value also `< 0` (net-negative evidence) | **Proposed** (THI-7) |
| Explicit-negative trigger | any chosen option with a negative signal on the dimension | **Proposed** (THI-8) |
| `mathToleranceSignal` | `math_affinity = answer − 3` | Accepted (DEC-020) |

### Reality-check trigger
For each related dimension of a check, the engine computes the attainable range of `C[d]` over the questions actually asked: each question contributes its minimum or maximum option. The range must have variation (`max > min`). The dimension is then **materially low** when **either** trigger holds:
- **`net_negative_bottom_third`:** `C[d] < min + (max − min) / 3` **and** `C[d] < 0` (net-negative evidence); or
- **`explicit_negative_answer`:** the candidate explicitly chose an option with a negative signal on it (e.g. Q3 = 1–2 on math), even if other answers bring the aggregate `C[d]` back to zero or above.

A check fires when at least one related dimension is materially low, and only for the top two programs. Positive or neutral answers alone never trigger. Each triggered dimension reports its `reasons` and `explicitNegativeQuestionIds`. Checks never change scores, ranking, or classification.

**Why condition 3 was added:** without it, simply *not choosing* a dimension's options triggered warnings. The value sits at 0, which is the bottom of a 0..max range. In the first calibration run, 8 of 10 sanity cases fired checks. For example, Persona A (math = 5) got the MIS "technical and quantitative load" warning only because they never chose a statistics option. With condition 3, checks fire only on real negative signals, such as low math tolerance or "least attractive: coding". This is the accepted V1 meaning of "materially" (DEC-018).

## Calibration method and rationale

Thresholds are **seeds**, chosen for interpretability rather than fitted to personas:
- **strong ≥ 0.80:** the candidate achieved at least 80% of what the asked questions could express for this program. Most heavily weighted answers are aligned.
- **good ≥ 0.65:** most of the program's attainable fit, with some answers pointing elsewhere.
- **consider ≥ 0.50:** about half aligned; a genuine mixed picture.
- **no strong fit < 0.50:** less than half of the program's attainable fit.
- **near tie < 0.05:** the top two are within 5% of their own ideals.

They are **validated, not tuned**, in two ways:
1. The sanity cases below (`tests/engine/personas.test.ts`), run through the real adaptive flow.
2. An exhaustive enumeration of every answer path through the adaptive flow, for each selection:

```
CALIBRATION_REPORT=1 pnpm vitest run tests/engine/calibration.report.test.ts
```

No threshold has been changed after seeing results. The sanity-case answer policies reflect each persona's described traits and were fixed before the run.

**History:** THI-7 validated the seeds against synthetic pair signals. Its main finding was that positive-only questions can never produce `no_strong_fit`, which led to the neutral options in DEC-021. THI-8 replaced the synthetic fixtures with the real question bank.

## THI-8 revalidation (real question bank, DEC-021)

**Outcome: DEC-018 stays unchanged.** No threshold shows an obvious failure with the real bank:
- coherent personas get strong fits in 5 questions;
- explicit rejection ("neither" on all three pair questions) reaches a genuine `no_strong_fit` in 6;
- mixed profiles stay inside the 7-question budget;
- a close result is returned as close.

The **reality-check rule** gained the explicit-negative trigger (finding 1). It changes warnings only: question counts, rankings, classifications, and the distribution below are identical with and without it.

### Sanity-case table
Real vectors, reality checks, question bank, and adaptive flow. Values are internal `normalized_fit`, never shown to candidates.

| Case | Qs | Branch path | Ranking (normalized fit) | Class | Best | Stop | Reality checks |
|---|---|---|---|---|---|---|---|
| Persona A (CS) | 5 | CSDS-1 cs, CSDS-2 cs | CS 1.000 > DS 0.756 > MIS 0.732 | strong_fit | CS | pair answers agree | — |
| Persona B (DS) | 5 | CSDS-1 ds, CSDS-2 ds | DS 0.963 > MIS 0.662 > CS 0.586 | strong_fit | DS | pair answers agree | — |
| Persona C (MIS) | 5 | DSMIS-1 mis, DSMIS-2 mis | MIS 0.962 > DS 0.444 > CS 0.407 | strong_fit | MIS | pair answers agree | — |
| Persona D ("neither" ×3) | 6 | DSMIS-1/2/3 neither | MIS 0.477 > DS 0.168 > CS 0.154 | **no_strong_fit** | null | no_strong_fit | DS math/stats/programming; MIS technical load |
| D′ (MIS-style answers, math 1) | 5 | DSMIS-1 mis, DSMIS-2 mis | MIS 0.923 > DS 0.370 > CS 0.322 | strong_fit | MIS | pair answers agree | DS math/stats/programming; MIS technical load |
| Low math + CS interests | 5 | CSDS-1 cs, CSDS-2 cs | CS 0.857 > MIS 0.648 > DS 0.607 | strong_fit | CS | pair answers agree | CS math load; MIS technical load |
| Low math + DS interests | 5 | DSMIS-1 ds, DSMIS-2 ds | DS 0.852 > CS 0.585 > MIS 0.538 | strong_fit | DS | pair answers agree | CS math load; DS math/stats/programming (explicit Q3 = 1) |
| Mixed CS/DS (2 selected) | 7 | CSDS-1 cs, -2 ds, -3 cs, TB ds | DS 0.867 > CS 0.794 | strong_fit | DS | tie-breaker asked | — |
| Mixed three-way | 6 | CSMIS-1 mis, -2 cs, -3 mis | MIS 0.807 > CS 0.651 > DS 0.643 | strong_fit | MIS | clear after pair-3 | — |
| Weak profile | 6 | CSMIS-1/2/3 neither | MIS 0.446 > DS 0.322 > CS 0.313 | no_strong_fit | null | no_strong_fit | — |
| Persona B, CS+DS only | 5 | CSDS-1 ds, CSDS-2 ds | DS 0.963 > CS 0.586 | strong_fit | DS | pair answers agree | — |
| Persona C, CS+MIS only | 5 | CSMIS-1 mis, CSMIS-2 mis | MIS 0.959 > CS 0.374 | strong_fit | MIS | pair answers agree | — |

### Exhaustive answer-path distribution
Every possible answer path through the adaptive flow. This includes incoherent random paths, so it shows behaviour rather than expected candidate outcomes.

| Selection | Paths | strong | good | consider | no strong | 5 Qs | 6 Qs | 7 Qs | Tie-breaker | Final near tie | Final pair ≠ branch |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CS+DS+MIS | 1282 | 17.9% | 43.2% | 31.5% | 7.3% | 5.9% | 59.9% | 34.2% | 34.2% | 23.9% | 24.3% |
| CS+DS | 1316 | 12.6% | 35.7% | 35.9% | 15.7% | 5.5% | 56.9% | 37.5% | 37.5% | 32.3% | 0% |
| CS+MIS | 1223 | 11.0% | 41.0% | 36.5% | 11.4% | 6.2% | 67.6% | 26.2% | 26.2% | 18.6% | 0% |
| DS+MIS | 1252 | 11.3% | 40.7% | 37.1% | 10.9% | 6.2% | 63.3% | 30.5% | 30.5% | 22.0% | 0% |

Reading it:
- Every path ends in 5–7 questions, and at most one tie-breaker is ever asked.
- Only about 6% of *all* paths stop at 5, because stopping at 5 needs two agreeing, non-neutral pair answers. Coherent candidates, however, typically stop at 5 (see the sanity table).
- About a quarter of paths still end as near ties after the single tie-breaker. By design, those results are returned as close rather than asking more questions.

### Findings for review
1. **Reality-check gap: resolved by the explicit-negative trigger, approved in the THI-8 review.** With only the net rule (`C[d] < 0`), low-math DS (Q3 = 1) got **no math warning**: the DS answers' small math signals cancelled the explicit "prefer as little math as possible" (−3 from Q3, +1.5 from Q1-B, +1.5 from DSMIS-2-ds, net 0). Across all answer paths, 16–34% of candidates who rated math 1–2 got no reality check at all.

   | | Net rule only | With explicit-negative trigger |
   |---|---|---|
   | Low math + DS interests | — | CS math load; DS math/stats/programming |
   | Q3 ≤ 2 paths with no check | 16–34% | 0% |
   | Paths with any check | ~30% | ~39% |
   | Other sanity cases; fit, ranking, question counts | — | unchanged |
2. **D′ is a strong MIS fit** (0.923, with reality checks). This is accepted (DEC-022): classification uses only the preferences a candidate actually expresses.
3. **Mixed profiles can still land in `good_fit` or `strong_fit`** when one program wins most heavily weighted answers. "Mixed three-way" ends at MIS 0.807 after pair-3. This seems acceptable for a decision-support product, and the evidence and trade-off output shows the mix.
4. **MIS is still often second for clear CS or DS candidates** (Persona A: DS 0.756, MIS 0.732), because of the documented vectors.
5. **The final pair differs from the locked branch in ~24% of all three-program paths.** The tie-breaker follows the current top two (DEC-021), and the result reports the true `mainDecision`.
