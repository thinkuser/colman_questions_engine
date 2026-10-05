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
