# StudyMatch V5 pilot — BigQuery KPI queries

DEC-038. GA4 BigQuery export (GoogleSQL). Definitions: `docs/V5_PILOT_MEASUREMENT.md` §6. **Not yet executed against real data**: the COLMAN GA4 export dataset is not referenced anywhere in the repo, so every query uses placeholders.

## Required substitutions
| Placeholder | Replace with |
|---|---|
| `GA4_PROJECT` | GCP project of the GA4 export |
| `GA4_DATASET` | GA4 export dataset, e.g. `analytics_123456789` |
| `REPORTING_DATASET` | A dataset you can write views to (same region as the export) |
| `'20261101'` / `'20261231'` | The `_TABLE_SUFFIX` date range of the pilot (YYYYMMDD) |

GA4 stores integers in `int_value` and strings in `string_value` (booleans arrive as strings or ints depending on the tag); the helpers below read any of them.

## 0. Base view (create once; every query below reads it)
```sql
-- v_studymatch_v5_events: one row per V5 StudyMatch event, parameters flattened.
CREATE OR REPLACE VIEW `GA4_PROJECT.REPORTING_DATASET.v_studymatch_v5_events` AS
WITH
raw AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date)                          AS event_date,
    TIMESTAMP_MICROS(event_timestamp)                          AS event_ts,
    event_name,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
    event_params
  FROM `GA4_PROJECT.GA4_DATASET.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20261101' AND '20261231'
),
prep AS (
  SELECT
    event_date, event_ts, event_name, user_pseudo_id, ga_session_id,
    -- string-ish parameters
    (SELECT COALESCE(p.value.string_value, CAST(p.value.int_value AS STRING)) FROM UNNEST(event_params) p WHERE p.key = 'flow_version')         AS flow_version,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'entry_mode')            AS entry_mode,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'comparison_id')         AS comparison_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'project_id')            AS project_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'project_ids')           AS project_ids,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'world_id')              AS world_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'world_ids')             AS world_ids,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'question_id')           AS question_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'answer_id')             AS answer_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'question_mode')         AS question_mode,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'question_kind')         AS question_kind,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'result_kind')           AS result_kind,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'recommended_program')   AS recommended_program,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'alternative_programs')  AS alternative_programs,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'program_id')            AS program_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'cta_position')          AS cta_position,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'link_role')             AS link_role,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'element_id')            AS element_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'element_type')          AS element_type,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'screen_id')             AS screen_id,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'destination_type')      AS destination_type,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'feedback_fit')          AS feedback_fit,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'feedback_helpfulness')  AS feedback_helpfulness,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'error_type')            AS error_type,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'utm_source')            AS utm_source,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'utm_medium')            AS utm_medium,
    (SELECT p.value.string_value FROM UNNEST(event_params) p WHERE p.key = 'utm_campaign')          AS utm_campaign,
    -- numeric parameters
    (SELECT COALESCE(p.value.int_value, SAFE_CAST(p.value.string_value AS INT64)) FROM UNNEST(event_params) p WHERE p.key = 'question_index')       AS question_index,
    (SELECT COALESCE(p.value.int_value, SAFE_CAST(p.value.string_value AS INT64)) FROM UNNEST(event_params) p WHERE p.key = 'selection_position')   AS selection_position,
    (SELECT COALESCE(p.value.int_value, SAFE_CAST(p.value.string_value AS INT64)) FROM UNNEST(event_params) p WHERE p.key = 'scored_answer_count')  AS scored_answer_count,
    (SELECT COALESCE(p.value.int_value, SAFE_CAST(p.value.string_value AS INT64)) FROM UNNEST(event_params) p WHERE p.key = 'total_answer_count')   AS total_answer_count,
    (SELECT COALESCE(p.value.int_value, SAFE_CAST(p.value.string_value AS INT64)) FROM UNNEST(event_params) p WHERE p.key = 'seeded_answer_count')  AS seeded_answer_count
  FROM raw
)
SELECT * FROM prep
WHERE flow_version = 'v5';
```
Sanity check after the first export days:
```sql
SELECT event_name, COUNT(*) AS events, COUNT(DISTINCT comparison_id) AS journeys
FROM `GA4_PROJECT.REPORTING_DATASET.v_studymatch_v5_events`
GROUP BY event_name ORDER BY events DESC;
```

Below, `V5` stands for `` `GA4_PROJECT.REPORTING_DATASET.v_studymatch_v5_events` ``.

## 1. Daily funnel
```sql
-- Daily semantic funnel (events, not ui_click).
WITH
agg AS (
  SELECT
    event_date,
    COUNTIF(event_name = 'studymatch_landing_view')                                  AS landing_views,
    COUNTIF(event_name = 'studymatch_start')                                         AS starts,
    COUNTIF(event_name = 'discovery_method_selected')                                AS method_choices,
    COUNTIF(event_name IN ('career_project_selection_completed','career_world_selection_completed')) AS discovery_completed,
    COUNT(DISTINCT IF(event_name = 'comparison_started', comparison_id, NULL))       AS journeys_started,
    COUNT(DISTINCT IF(event_name = 'studymatch_result_view', comparison_id, NULL))   AS results,
    COUNT(DISTINCT IF(event_name = 'result_program_click', comparison_id, NULL))     AS journeys_program_click,
    COUNT(DISTINCT IF(event_name = 'result_contact_click', comparison_id, NULL))     AS journeys_contact,
    COUNT(DISTINCT IF(event_name = 'lead_form_success', comparison_id, NULL))        AS leads
  FROM V5
  GROUP BY event_date
)
SELECT
  *,
  SAFE_DIVIDE(starts, landing_views)     AS landing_to_start_rate,
  SAFE_DIVIDE(results, journeys_started) AS completion_rate,
  SAFE_DIVIDE(leads, results)            AS lead_success_rate
FROM agg
ORDER BY event_date;
```

## 2. Completion rates (discovery and questionnaire)
```sql
WITH
agg AS (
  SELECT
    entry_mode,
    COUNTIF(event_name IN ('career_project_discovery_view','career_world_discovery_view'))         AS discovery_views,
    COUNTIF(event_name IN ('career_project_selection_completed','career_world_selection_completed')) AS discovery_completed,
    COUNT(DISTINCT IF(event_name = 'comparison_started', comparison_id, NULL))                      AS started,
    COUNT(DISTINCT IF(event_name = 'studymatch_result_view', comparison_id, NULL))                  AS results
  FROM V5
  WHERE entry_mode IS NOT NULL
  GROUP BY entry_mode
)
SELECT
  entry_mode,
  SAFE_DIVIDE(discovery_completed, discovery_views) AS discovery_completion_rate,
  SAFE_DIVIDE(results, started)                     AS questionnaire_completion_rate,
  started, results
FROM agg;
```

## 3. Result-kind distribution
```sql
-- One row per result state; the latest result view per journey.
WITH
results AS (
  SELECT comparison_id, result_kind, recommended_program, total_answer_count, entry_mode, project_ids, world_ids
  FROM V5
  WHERE event_name = 'studymatch_result_view'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY comparison_id ORDER BY event_ts DESC) = 1
)
SELECT
  result_kind,
  COUNT(*)                                        AS results,
  SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER ())    AS share
FROM results
GROUP BY result_kind
ORDER BY results DESC;
```
`v1_precision_result` = Tech precision rate.

## 4. Questions to result (median / average / P25 / P75)
```sql
WITH
results AS (
  SELECT comparison_id, entry_mode, total_answer_count
  FROM V5
  WHERE event_name = 'studymatch_result_view'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY comparison_id ORDER BY event_ts DESC) = 1
)
SELECT
  entry_mode,
  COUNT(*)                                                AS results,
  AVG(total_answer_count)                                 AS avg_questions,
  APPROX_QUANTILES(total_answer_count, 100)[OFFSET(25)]   AS p25_questions,
  APPROX_QUANTILES(total_answer_count, 100)[OFFSET(50)]   AS median_questions,
  APPROX_QUANTILES(total_answer_count, 100)[OFFSET(75)]   AS p75_questions
FROM results
GROUP BY ROLLUP(entry_mode);
```

## 5. Feedback fit rate
```sql
WITH
fb AS (
  SELECT comparison_id, feedback_fit
  FROM V5
  WHERE event_name = 'result_feedback_submit' AND feedback_fit IS NOT NULL
)
SELECT
  COUNT(*)                                                                         AS fit_responses,
  SAFE_DIVIDE(COUNTIF(feedback_fit IN ('very_suitable','quite_suitable')), COUNT(*)) AS positive_fit_rate,  -- target >= 0.70
  SAFE_DIVIDE(COUNTIF(feedback_fit = 'not_suitable'), COUNT(*))                     AS clearly_wrong_rate, -- target < 0.15
  SAFE_DIVIDE(COUNTIF(feedback_fit = 'not_sure'), COUNT(*))                         AS not_sure_rate
FROM fb;
```

## 6. Feedback helpfulness (and response rate)
```sql
WITH
agg AS (
  SELECT
    COUNTIF(event_name = 'result_feedback_view')                                         AS feedback_views,
    COUNTIF(event_name = 'result_feedback_submit')                                       AS feedback_submits,
    COUNTIF(event_name = 'result_feedback_submit' AND feedback_helpfulness IS NOT NULL)  AS helpfulness_responses,
    COUNTIF(event_name = 'result_feedback_submit' AND feedback_helpfulness IN ('yes','somewhat')) AS helpful,
    COUNTIF(event_name = 'result_feedback_submit' AND feedback_helpfulness = 'yes')      AS helpful_yes
  FROM V5
)
SELECT
  SAFE_DIVIDE(feedback_submits, feedback_views)   AS response_rate,
  SAFE_DIVIDE(helpful, helpfulness_responses)     AS helpfulness_rate,
  SAFE_DIVIDE(helpful_yes, helpfulness_responses) AS helpfulness_yes_only_rate,
  helpfulness_responses
FROM agg;
```

## 7. Recommendation distribution
```sql
WITH
results AS (
  SELECT comparison_id, result_kind, recommended_program
  FROM V5
  WHERE event_name = 'studymatch_result_view' AND recommended_program IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY comparison_id ORDER BY event_ts DESC) = 1
)
SELECT
  recommended_program,
  COUNT(*)                                      AS recommendations,
  SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER ())  AS share
FROM results
GROUP BY recommended_program
ORDER BY recommendations DESC;
```

## 8. Business Administration share (overall and by opening door)
```sql
-- The opening door = the first selected project/world of the journey (selection_position = 1).
WITH
first_door AS (
  SELECT
    s.comparison_id,
    COALESCE(s.project_id, s.world_id) AS opening_door
  FROM (
    -- Selection events have no comparison_id (pre-journey); attach them to the journey started in the same session.
    SELECT
      sel.user_pseudo_id, sel.ga_session_id, sel.project_id, sel.world_id, start.comparison_id,
      ROW_NUMBER() OVER (PARTITION BY start.comparison_id ORDER BY sel.event_ts DESC) AS rn
    FROM V5 AS sel
    JOIN V5 AS start
      ON start.user_pseudo_id = sel.user_pseudo_id
     AND start.ga_session_id = sel.ga_session_id
     AND start.event_name = 'comparison_started'
     AND sel.event_ts <= start.event_ts
    WHERE sel.event_name IN ('career_project_selected','career_world_selected') AND sel.selection_position = 1
  ) AS s
  WHERE s.rn = 1
),
recs AS (
  SELECT comparison_id, recommended_program
  FROM V5
  WHERE event_name = 'studymatch_result_view' AND recommended_program IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY comparison_id ORDER BY event_ts DESC) = 1
)
SELECT
  COALESCE(f.opening_door, '(all)')                                                 AS opening_door,
  COUNT(*)                                                                          AS recommendations,
  SAFE_DIVIDE(COUNTIF(r.recommended_program = 'business_administration'), COUNT(*)) AS ba_share
FROM recs AS r
LEFT JOIN first_door AS f USING (comparison_id)
GROUP BY ROLLUP(f.opening_door)
ORDER BY recommendations DESC;
```
WATCH metric, not a failure threshold.

## 9. KPIs by entry_mode
```sql
WITH
journeys AS (
  SELECT
    comparison_id,
    ANY_VALUE(entry_mode)                                        AS entry_mode,
    LOGICAL_OR(event_name = 'studymatch_result_view')            AS has_result,
    LOGICAL_OR(event_name = 'result_program_click')              AS has_program_click,
    LOGICAL_OR(event_name = 'result_contact_click')              AS has_contact,
    LOGICAL_OR(event_name = 'lead_form_success')                 AS has_lead,
    MAX(IF(event_name = 'studymatch_result_view', total_answer_count, NULL)) AS questions,
    MAX(IF(event_name = 'result_feedback_submit', feedback_fit, NULL))       AS feedback_fit
  FROM V5
  WHERE comparison_id IS NOT NULL
  GROUP BY comparison_id
)
SELECT
  entry_mode,
  COUNT(*)                                                         AS journeys,
  SAFE_DIVIDE(COUNTIF(has_result), COUNT(*))                       AS completion_rate,
  APPROX_QUANTILES(questions, 100)[OFFSET(50)]                     AS median_questions,
  SAFE_DIVIDE(COUNTIF(has_program_click), COUNTIF(has_result))     AS program_click_rate,
  SAFE_DIVIDE(COUNTIF(has_contact), COUNTIF(has_result))           AS contact_intent_rate,
  SAFE_DIVIDE(COUNTIF(has_lead), COUNTIF(has_result))              AS lead_success_rate,
  SAFE_DIVIDE(COUNTIF(feedback_fit IN ('very_suitable','quite_suitable')), COUNTIF(feedback_fit IS NOT NULL)) AS positive_fit_rate
FROM journeys
GROUP BY entry_mode;
```

## 10. KPIs by project_id
```sql
-- A journey counts for every project in its selection (project_ids is canonical "a|b").
WITH
journeys AS (
  SELECT
    comparison_id,
    ANY_VALUE(project_ids)                                                   AS project_ids,
    LOGICAL_OR(event_name = 'studymatch_result_view')                        AS has_result,
    MAX(IF(event_name = 'studymatch_result_view', result_kind, NULL))        AS result_kind,
    MAX(IF(event_name = 'studymatch_result_view', recommended_program, NULL)) AS recommended_program,
    MAX(IF(event_name = 'studymatch_result_view', total_answer_count, NULL)) AS questions,
    MAX(IF(event_name = 'result_feedback_submit', feedback_fit, NULL))       AS feedback_fit,
    LOGICAL_OR(event_name = 'result_program_click')                          AS has_program_click,
    LOGICAL_OR(event_name = 'result_contact_click')                          AS has_contact,
    LOGICAL_OR(event_name = 'lead_form_success')                             AS has_lead
  FROM V5
  WHERE entry_mode = 'projects' AND comparison_id IS NOT NULL
  GROUP BY comparison_id
),
by_project AS (
  SELECT j.*, project_id, ARRAY_LENGTH(SPLIT(j.project_ids, '|')) = 2 AS is_pair
  FROM journeys AS j, UNNEST(SPLIT(j.project_ids, '|')) AS project_id
)
SELECT
  project_id,
  COUNT(*)                                                               AS journeys,
  SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER ())                           AS selection_share,
  SAFE_DIVIDE(COUNTIF(is_pair), COUNT(*))                                AS pair_share,
  SAFE_DIVIDE(COUNTIF(has_result), COUNT(*))                             AS completion_rate,
  APPROX_QUANTILES(questions, 100)[OFFSET(50)]                           AS median_questions,
  SAFE_DIVIDE(COUNTIF(result_kind = 'recommended'), COUNTIF(has_result))                     AS recommended_rate,
  SAFE_DIVIDE(COUNTIF(result_kind = 'near_tie'), COUNTIF(has_result))                        AS near_tie_rate,
  SAFE_DIVIDE(COUNTIF(result_kind = 'insufficient_positive_evidence'), COUNTIF(has_result))  AS insufficient_rate,
  SAFE_DIVIDE(COUNTIF(result_kind = 'v1_precision_result'), COUNTIF(has_result))             AS tech_precision_rate,
  SAFE_DIVIDE(COUNTIF(feedback_fit IN ('very_suitable','quite_suitable')), COUNTIF(feedback_fit IS NOT NULL)) AS positive_fit_rate,
  SAFE_DIVIDE(COUNTIF(feedback_fit = 'not_suitable'), COUNTIF(feedback_fit IS NOT NULL))     AS wrong_result_rate,
  SAFE_DIVIDE(COUNTIF(has_program_click), COUNTIF(has_result))           AS program_ctr,
  SAFE_DIVIDE(COUNTIF(has_contact), COUNTIF(has_result))                 AS contact_intent,
  SAFE_DIVIDE(COUNTIF(has_lead), COUNTIF(has_result))                    AS lead_success
FROM by_project
GROUP BY project_id
ORDER BY journeys DESC;
```
Recommended-program distribution per project: add `recommended_program` to the `GROUP BY`.

## 11. KPIs by world_id
Same as §10 with `entry_mode = 'worlds'`, `world_ids` and `world_id`.

## 12. Result program click rate
```sql
WITH
journeys AS (
  SELECT
    comparison_id,
    MAX(IF(event_name = 'studymatch_result_view', recommended_program, NULL)) AS recommended_program,
    MAX(IF(event_name = 'studymatch_result_view', result_kind, NULL))         AS result_kind,
    LOGICAL_OR(event_name = 'studymatch_result_view')                         AS has_result,
    LOGICAL_OR(event_name = 'result_program_click')                           AS has_program_click
  FROM V5
  WHERE comparison_id IS NOT NULL
  GROUP BY comparison_id
)
SELECT
  result_kind, recommended_program,
  COUNTIF(has_result)                                            AS results,
  SAFE_DIVIDE(COUNTIF(has_program_click), COUNTIF(has_result))   AS program_click_rate
FROM journeys
WHERE has_result
GROUP BY result_kind, recommended_program
ORDER BY results DESC;
```

## 13. Contact intent
```sql
SELECT
  SAFE_DIVIDE(
    COUNT(DISTINCT IF(event_name = 'result_contact_click', comparison_id, NULL)),
    COUNT(DISTINCT IF(event_name = 'studymatch_result_view', comparison_id, NULL))
  ) AS contact_intent_rate
FROM V5;
```

## 14. Lead conversion
```sql
WITH
agg AS (
  SELECT
    COUNT(DISTINCT IF(event_name = 'studymatch_result_view', comparison_id, NULL)) AS results,
    COUNT(DISTINCT IF(event_name = 'lead_form_view', comparison_id, NULL))         AS form_views,
    COUNT(DISTINCT IF(event_name = 'lead_form_submit', comparison_id, NULL))       AS submits,
    COUNT(DISTINCT IF(event_name = 'lead_form_success', comparison_id, NULL))      AS successes,
    COUNTIF(event_name = 'lead_form_error' AND error_type = 'validation')          AS validation_errors,
    COUNTIF(event_name = 'lead_form_error' AND error_type IN ('server','network')) AS delivery_errors
  FROM V5
)
SELECT
  SAFE_DIVIDE(form_views, results)  AS lead_form_start_rate,
  SAFE_DIVIDE(submits, form_views)  AS lead_submit_rate,
  SAFE_DIVIDE(successes, results)   AS lead_success_rate,
  validation_errors, delivery_errors
FROM agg;
```

## 15. Question drop-off
```sql
-- For each question position: journeys that saw it, answered it, and ended there without a result.
WITH
q AS (
  SELECT comparison_id, question_index, question_id, event_name
  FROM V5
  WHERE event_name IN ('question_view','question_answer')
),
results AS (
  SELECT DISTINCT comparison_id FROM V5 WHERE event_name = 'studymatch_result_view'
),
last_seen AS (
  SELECT comparison_id, MAX(question_index) AS last_index
  FROM q WHERE event_name = 'question_view'
  GROUP BY comparison_id
)
SELECT
  q.question_index,
  q.question_id,
  COUNT(DISTINCT IF(q.event_name = 'question_view', q.comparison_id, NULL))   AS viewed,
  COUNT(DISTINCT IF(q.event_name = 'question_answer', q.comparison_id, NULL)) AS answered,
  COUNT(DISTINCT IF(q.event_name = 'question_view' AND l.last_index = q.question_index AND r.comparison_id IS NULL, q.comparison_id, NULL)) AS abandoned_here
FROM q
LEFT JOIN last_seen AS l USING (comparison_id)
LEFT JOIN results AS r USING (comparison_id)
GROUP BY q.question_index, q.question_id
ORDER BY q.question_index, viewed DESC;
```

## 16. CTA clicks by position and role
```sql
SELECT
  event_name, cta_position, link_role,
  COUNT(*)                       AS clicks,
  COUNT(DISTINCT comparison_id)  AS journeys
FROM V5
WHERE event_name IN ('result_program_click','result_contact_click')
GROUP BY event_name, cta_position, link_role
ORDER BY clicks DESC;
```

## 17. ui_click audit (coverage and UX)
```sql
-- Every element_id should appear; unknown ids or missing screen/type indicate an instrumentation regression.
SELECT
  screen_id, element_id, element_type, destination_type,
  COUNT(*)                                   AS clicks,
  COUNT(DISTINCT user_pseudo_id)             AS users,
  COUNTIF(comparison_id IS NULL)             AS clicks_without_journey  -- expected only on landing / method
FROM V5
WHERE event_name = 'ui_click'
GROUP BY screen_id, element_id, element_type, destination_type
ORDER BY screen_id, clicks DESC;
```
Refused third selections: `element_id IN ('discovery_project_card','discovery_world_card')` clicks minus `career_*_selected` / `_deselected` events in the same session.

## 18. Self-selected vs externally assigned cohorts
```sql
-- A journey is SELF-SELECTED when its session has discovery_method_selected before comparison_started;
-- otherwise EXTERNALLY ASSIGNED (direct /v5/worlds or /v5/projects link; the app never fabricates the method event).
WITH
starts AS (
  SELECT comparison_id, user_pseudo_id, ga_session_id, entry_mode, event_ts AS started_at
  FROM V5 WHERE event_name = 'comparison_started'
),
methods AS (
  SELECT user_pseudo_id, ga_session_id, event_ts AS chosen_at, entry_mode AS chosen_mode
  FROM V5 WHERE event_name = 'discovery_method_selected'
),
cohorts AS (
  SELECT
    s.comparison_id, s.entry_mode,
    IF(LOGICAL_OR(m.chosen_at <= s.started_at AND m.chosen_mode = s.entry_mode), 'self_selected', 'externally_assigned') AS cohort
  FROM starts AS s
  LEFT JOIN methods AS m USING (user_pseudo_id, ga_session_id)
  GROUP BY s.comparison_id, s.entry_mode
),
outcomes AS (
  SELECT
    comparison_id,
    LOGICAL_OR(event_name = 'studymatch_result_view')                         AS has_result,
    MAX(IF(event_name = 'studymatch_result_view', total_answer_count, NULL))  AS questions,
    MAX(IF(event_name = 'result_feedback_submit', feedback_fit, NULL))        AS feedback_fit,
    LOGICAL_OR(event_name = 'lead_form_success')                              AS has_lead
  FROM V5 WHERE comparison_id IS NOT NULL
  GROUP BY comparison_id
)
SELECT
  c.cohort, c.entry_mode,
  COUNT(*)                                                       AS journeys,
  SAFE_DIVIDE(COUNTIF(o.has_result), COUNT(*))                   AS completion_rate,
  APPROX_QUANTILES(o.questions, 100)[OFFSET(50)]                 AS median_questions,
  SAFE_DIVIDE(COUNTIF(o.feedback_fit IN ('very_suitable','quite_suitable')), COUNTIF(o.feedback_fit IS NOT NULL)) AS positive_fit_rate,
  SAFE_DIVIDE(COUNTIF(o.has_lead), COUNTIF(o.has_result))        AS lead_success_rate
FROM cohorts AS c
JOIN outcomes AS o USING (comparison_id)
GROUP BY c.cohort, c.entry_mode
ORDER BY c.cohort, c.entry_mode;
```
Interpretation: compare Worlds vs Projects **within `externally_assigned`** for strategy performance; the `self_selected` split measures preference, not performance. If the assigned links carry their own inbound UTMs (recommended, e.g. `utm_content=assigned_worlds`), use them as the primary cohort key instead of the session heuristic.
