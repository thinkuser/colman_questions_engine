/**
 * V5 pilot measurement vocabulary (DEC-038). Small, stable and closed: these values are what GTM / GA4 / BigQuery
 * reports group by, so they never carry display copy, answer text or personal data.
 *
 * `ui_click` is a UX / click-coverage event that fires IN ADDITION to the semantic events (studymatch_start,
 * career_project_selected, question_answer, result_program_click...). Semantic events stay the source of truth for
 * business KPIs; `ui_click` is for button-level interaction analysis and debugging.
 */

export const UI_ELEMENT_IDS = [
  "landing_start",
  "landing_start_over",
  "method_worlds",
  "method_projects",
  "method_back",
  "discovery_world_card",
  "discovery_project_card",
  "discovery_continue",
  "discovery_back",
  "ready_continue",
  "answer_option",
  "question_continue",
  "question_back",
  "question_restart",
  "result_program",
  "result_contact",
  "result_try_again",
  "result_all_programs",
  "result_detail_expand",
  "lead_submit",
  "feedback_fit_option",
  "feedback_helpfulness_option",
  "feedback_submit",
] as const;
export type UiElementId = (typeof UI_ELEMENT_IDS)[number];

export const UI_ELEMENT_TYPES = ["button", "link", "card", "answer_option", "detail_toggle"] as const;
export type UiElementType = (typeof UI_ELEMENT_TYPES)[number];

export const UI_SCREEN_IDS = [
  "landing",
  "method",
  "projects",
  "worlds",
  "ready",
  "question",
  "result",
  "lead",
  "feedback",
] as const;
export type UiScreenId = (typeof UI_SCREEN_IDS)[number];

export const UI_DESTINATION_TYPES = [
  "internal",
  "program",
  "all_programs",
  "lead_anchor",
  "restart",
  "discovery",
  "question",
  "external",
] as const;
export type UiDestinationType = (typeof UI_DESTINATION_TYPES)[number];

/** Pilot result feedback (structured only: no free text). */
export const FEEDBACK_VERSION = "v1";
export const FEEDBACK_FIT_VALUES = ["very_suitable", "quite_suitable", "not_sure", "not_suitable"] as const;
export type FeedbackFit = (typeof FEEDBACK_FIT_VALUES)[number];
export const FEEDBACK_HELPFULNESS_VALUES = ["yes", "somewhat", "no"] as const;
export type FeedbackHelpfulness = (typeof FEEDBACK_HELPFULNESS_VALUES)[number];

export interface ResultFeedbackAnswers {
  /** Absent for an insufficient-evidence result (no recommendation to judge) or when not answered. */
  fit?: FeedbackFit;
  helpfulness?: FeedbackHelpfulness;
}

/**
 * One `ui_click`. Identity comes from contextual ids (project_id, question_id, program_id...), never from dynamic
 * element ids or labels. The tracker adds flow_version, entry_mode, comparison_id, the selection and (on result
 * screens) the result context.
 */
export interface UiClickParams {
  element_id: UiElementId;
  element_type: UiElementType;
  screen_id: UiScreenId;
  destination_type?: UiDestinationType;
  /** Only on the method-card click (the mode being chosen); otherwise the tracker supplies the journey's mode. */
  entry_mode?: "worlds" | "projects";
  project_id?: string;
  world_id?: string;
  program_id?: string;
  question_id?: string;
  answer_id?: string;
  cta_position?: string;
  link_role?: string;
  detail_section?: string;
  feedback_fit?: FeedbackFit;
  feedback_helpfulness?: FeedbackHelpfulness;
}

// --- Pilot feedback dedupe (presentation state only; never journey, scoring or routing state) -----------------------

/** Its own key: feedback never enters the V5 journey payload (`colman-studymatch:v5:journey`). */
export const RESULT_FEEDBACK_STORAGE_KEY = "colman-studymatch:v5:result-feedback";
const MAX_REMEMBERED = 50;

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Identity of a result STATE: the journey id plus the selection and the full answer sequence (ids only). Going Back,
 * changing an answer and completing again gives a new key, so new feedback is allowed for the new result.
 */
export function resultFeedbackKey(
  journeyId: string | null,
  selectedIds: readonly string[],
  answers: ReadonlyArray<{ questionId: string; answerId: string }>,
): string {
  return `${journeyId ?? "no-journey"}|${selectedIds.join("+")}|${answers.map((a) => `${a.questionId}=${a.answerId}`).join(",")}`;
}

function remembered(storage: KeyValueStorage | null): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RESULT_FEEDBACK_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function hasSubmittedResultFeedback(storage: KeyValueStorage | null, key: string): boolean {
  return remembered(storage).includes(key);
}

export function rememberResultFeedback(storage: KeyValueStorage | null, key: string): void {
  try {
    const next = [...remembered(storage).filter((entry) => entry !== key), key].slice(-MAX_REMEMBERED);
    storage?.setItem(RESULT_FEEDBACK_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable: the in-memory "submitted" state still prevents a double submit on this page.
  }
}
