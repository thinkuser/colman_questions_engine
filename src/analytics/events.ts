/**
 * Analytics vocabulary. Source of truth: docs/ANALYTICS.md.
 * Semantics and payload conventions: docs/ANALYTICS.md. Events are emitted through FunnelTracker (funnelTracker.ts).
 */

export const ANALYTICS_EVENTS = [
  "degree_compare_view",
  "degree_selected",
  "comparison_started",
  "question_view",
  "question_answer",
  "adaptive_branch_selected",
  "tie_breaker_view",
  "comparison_completed",
  "recommended_program",
  "secondary_program_view",
  "mirror_response",
  "curriculum_click",
  "career_click",
  "reality_check_view",
  "admission_click",
  "restart_comparison",
  "change_program",
  "advisor_cta_click",
  "whatsapp_click",
  "lead_submit",
  "comparison_share",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const ANALYTICS_PARAMS = [
  "comparison_id",
  "program_id",
  "result_kind",
  "leading_program",
  "program_1",
  "program_2",
  "program_3",
  "selected_program_count",
  "recommended_program",
  "secondary_program",
  "main_decision_pair",
  "fit_classification",
  "comparison_cluster",
  "question_id",
  "question_type",
  "answer_id",
  "branch_id",
  "question_index",
  "questions_answered",
  "is_tie_breaker",
  "mirror_response",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AnalyticsParamName = (typeof ANALYTICS_PARAMS)[number];

/** Only stable IDs and scalar values — no free-text candidate responses (privacy, ANALYTICS.md). */
export type AnalyticsParams = Partial<Record<AnalyticsParamName, string | number | boolean>>;
