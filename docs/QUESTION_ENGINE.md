# Question Engine V1

## Goal
Ask only the questions that materially reduce uncertainty between the candidate's selected programs. Typical experience: 5–7 questions.

## Question sequence
1. Three common opening questions.
2. Score initial candidate vector.
3. Identify top-two programs / main decision.
4. Ask 2–3 pair-specific questions.
5. Ask a tie-breaker only when needed.
6. Return fit result + evidence + trade-off + reality checks.

## Weight classes
- `scenario`: 3.0
- `tradeoff`: 3.0
- `preference`: 2.0
- `self_rating`: 1.5
- `career_label`: 1.0

Scenario and trade-off questions should dominate self-assessment and career-title preferences.

## Opening questions

### Q1 — project choice
Prompt: A company such as Spotify gives you a project. What sounds most interesting?
- A: Build a new app feature and make it fast/reliable. Signals: `software_building +2`, `coding_depth +1`, `abstract_problem_solving +1`.
- B: Build a model that predicts what the user will want next. Signals: `data_modeling +2`, `statistical_thinking +1`, `math_affinity +0.5`.
- C: Understand why users churn and design a solution with product/data/technology teams. Signals: `business_context +1.5`, `systems_process +1.5`, `bridge_role +2`.
Type: `scenario`, weight 3.

### Q2 — desired outcome
Prompt: At the end of a successful day, which sentence would feel best?
- A: We built something that works. → `software_building +2`, `coding_depth +1`.
- B: We discovered something we did not know before. → `data_modeling +2`, `statistical_thinking +1`.
- C: We solved a real organizational problem. → `business_context +1.5`, `systems_process +1.5`, `bridge_role +1`.
Type: `tradeoff`, weight 3.

### Q3 — math tolerance
Prompt: How do you feel about studies with significant mathematics?
Scale 1–5 from `prefer as little as possible` to `I enjoy mathematical challenge`.
Primary signal: `math_affinity = answer − 3` (1 → −2 … 5 → +2), DEC-020.
Type: `self_rating`, weight 1.5.
Important: low math tolerance creates a possible reality-check warning; it does not automatically disqualify Data Science or Computer Science.

## Pair branch: Computer Science vs Data Science

### CSDS-1
What sounds more interesting?
- A: Find the most efficient way for a computer to solve a problem. → CS signals: `abstract_problem_solving`, `coding_depth`.
- B: Receive lots of data and discover the pattern hidden in it. → DS signals: `data_modeling`, `statistical_thinking`.

### CSDS-2
You receive a dataset with one million customers. What is your first instinct?
- A: How do I build a system that can ingest/process it? → CS.
- B: What can I learn or predict from it? → DS.

### CSDS-3
Which group of subjects sounds more interesting?
- A: Algorithms, operating systems, data structures, software development. → CS.
- B: Statistics, machine learning, models, data analysis. → DS.

## Pair branch: Computer Science vs Management Information Systems

### CSMIS-1
Which role sounds more like you?
- A: The person who deeply understands how to build the technology. → CS.
- B: The person who understands both technology and why the business needs it. → MIS.

### CSMIS-2
A company needs a new customer-management system. Which would you rather do?
- A: Design and develop the system. → CS.
- B: Understand needs, define the solution, and coordinate the teams that build it. → MIS.

### CSMIS-3
Which bothers you less?
- A: Spending a long time solving a complex technical problem. → CS.
- B: Having many conversations to understand what the system needs to do. → MIS.

## Pair branch: Data Science vs Management Information Systems

### DSMIS-1
What interests you more?
- A: Can we predict which customer will churn? → DS.
- B: Why are customers churning and what should the company change? → MIS.

### DSMIS-2
An AI model you built is 95% accurate. What question comes next?
- A: How can we improve it to 97%? → DS.
- B: How do we get the organization to use it to make decisions? → MIS.

### DSMIS-3
Which future sounds more attractive?
- A: Be the expert who knows the most about the data/models. → DS.
- B: Be the person who connects data, technology, and business decisions. → MIS.

## V1 pair-question signals (DEC-021)
Source of truth: `src/data/content/question_bank.json`, tested against this table. Option A favours the first program of the pair and option B the second.

| Q | Type | A signals | B signals |
|---|---|---|---|
| CSDS-1 | tradeoff | abstract_problem_solving +2, coding_depth +1 | data_modeling +2, statistical_thinking +1 |
| CSDS-2 | scenario | software_building +2, coding_depth +1 | data_modeling +2, statistical_thinking +1 |
| CSDS-3 | preference | abstract_problem_solving +1, coding_depth +1, software_building +1 | statistical_thinking +1.5, data_modeling +1.5 |
| CSMIS-1 | preference | software_building +2, abstract_problem_solving +1 | bridge_role +2, business_context +1 |
| CSMIS-2 | scenario | software_building +2, coding_depth +1 | systems_process +1.5, bridge_role +1.5 |
| CSMIS-3 | tradeoff | abstract_problem_solving +1.5, coding_depth +0.5 | bridge_role +1.5, systems_process +0.5 |
| DSMIS-1 | tradeoff | data_modeling +2, statistical_thinking +1 | business_context +2, systems_process +1 |
| DSMIS-2 | scenario | data_modeling +1.5, statistical_thinking +1, math_affinity +0.5 | bridge_role +2, business_context +1 |
| DSMIS-3 | preference | data_modeling +1.5, statistical_thinking +1.5 | bridge_role +2, business_context +1 |

**Neutral option:** every pair question also offers "Neither of these really appeals to me", with **no signal**. This is the explicit neutral information that lets a genuine `no_strong_fit` emerge (THI-7 showed positive-only questions never produce it) without adding a question.

## Tie-breakers (DEC-021)
Asked at most once, only after pair-3, and only for a near tie that is not `no_strong_fit`. Each targets the **current** top two. They have no neutral option.

| Q | Pair | Type | A | B |
|---|---|---|---|---|
| TB-CSDS | CS/DS | tradeoff | Logical certainty: abstract_problem_solving +2 | Patterns under uncertainty: statistical_thinking +2 |
| TB-CSMIS | CS/MIS | tradeoff | Write code: coding_depth +2 | Define what the code should do: systems_process +1, bridge_role +1 |
| TB-DSMIS | DS/MIS | tradeoff | Better model: data_modeling +2 | Better business decision: business_context +2 |

## Additional question bank
Use as alternatives/A-B-test candidates, not all at once.
- Understand how a system works vs how people use it.
- Logical certainty vs patterns under uncertainty.
- Build an app vs build a prediction model.
- When a product fails, what do you investigate first?
- Write code vs define what the code should do.
- Interest in companies, customers, and organizational processes.
- Better algorithm vs better business decision.
- Which option is least attractive? (negative signal)

## Adaptive selection rules
- Never ask a question whose signals are nearly identical for the remaining programs.
- Prefer the highest-discrimination question for the current top-two pair.
- Avoid redundant questions that measure the same dimension in nearly the same way.
- Stop after 5–7 questions if confidence is sufficient.
- If top-two scores remain close, ask one tie-breaker.
- **Exact V1 rules (DEC-021):**
  1. Q1–Q3.
  2. Lock the branch from the current top two.
  3. Pair-1 and pair-2. **Stop at 5** if both favour the same program, neither is "neither", and the result is not a near tie.
  4. Otherwise pair-3. **Stop at 6** if `no_strong_fit` or not a near tie.
  5. Otherwise **one** tie-breaker for the current top two, then **stop at 7** regardless.

  Never keep asking until the result becomes mathematically decisive. A close result is valid.
- If all selected programs show weak fit, stop forcing a winner and return `no_strong_fit`.
- The question bank must carry enough neutral or negative information (e.g. "neither", "least attractive", "none of these") to identify genuine `no_strong_fit` candidates. With positive-only options, every answer combination scores at least partial fit, and candidates are pushed towards a pilot program (THI-7 calibration, `docs/SCORING.md`).

## Scoring concept
Each answer updates a normalized candidate vector. Program fit is based on weighted similarity between candidate vector and program vector.

Pseudo-formula:
`fit(program) = sum(dimension_weight[d] * similarity(candidate[d], program[d]))`

The exact normalization and thresholds must be implemented in a simple, testable function and covered by unit tests.

Implemented in THI-7. The formula (DEC-019) and the proposed thresholds (DEC-018, pending review and revalidation in THI-8) are documented in `docs/SCORING.md`.

## Evidence
Store answer-level evidence so result copy can say why the match occurred. Result explanations must point back to concrete choices, not generic text.
