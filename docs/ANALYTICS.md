# Analytics Plan V1

## Principle
Measurement is part of the product, not an afterthought. Every major step should be observable in GA4 and analyzable in BigQuery.

## Core events
- `degree_compare_view`
- `degree_selected`
- `comparison_started`
- `question_view`
- `question_answer`
- `adaptive_branch_selected`
- `tie_breaker_view`
- `comparison_completed`
- `recommended_program`
- `secondary_program_view`
- `mirror_response`
- `curriculum_click`
- `career_click`
- `reality_check_view`
- `admission_click`
- `restart_comparison`
- `change_program`
- `advisor_cta_click`
- `whatsapp_click`
- `lead_submit`
- `comparison_share`

## Recommended parameters
- `program_1`
- `program_2`
- `program_3`
- `selected_program_count`
- `recommended_program`
- `secondary_program`
- `main_decision_pair`
- `fit_classification`
- `comparison_cluster`
- `question_id`
- `question_type`
- `answer_id`
- `branch_id`
- `question_index`
- `questions_answered`
- `is_tie_breaker`
- `mirror_response`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

## Questions the data should answer
- Which program pairs/triplets generate the most comparison demand?
- Which questions most often change the leading recommendation?
- Where do candidates abandon the experience?
- Which program tends to win within each pair?
- How frequently do near-ties and no-strong-fit outcomes occur?
- Which result sections are most engaged with?
- Which comparison pairs generate the highest advisor/lead conversion?
- Does recommendation alignment eventually correlate with enrollment, if CRM/enrollment data can be joined later?

## Implementation notes
- Keep stable internal IDs for programs, questions, answers, and branches.
- Avoid sending free-text candidate responses unless explicitly required and privacy-reviewed.
- Preserve source/UTM context through the full session and lead handoff.
