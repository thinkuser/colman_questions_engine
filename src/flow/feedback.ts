import { z } from "zod";
import { FEEDBACK_FIT_VALUES, FEEDBACK_HELPFULNESS_VALUES, FEEDBACK_VERSION } from "@/analytics/pilot";
import { V2_PROGRAM_IDS, V3_WORLDS, V5_PROJECTS } from "@/data";

/**
 * V5 pilot feedback persistence contract (DEC-039). The browser posts this structured body to the same-origin
 * `/api/v5/feedback`; the server validates it, replaces `result_state_key` by its SHA-256 (`feedback_key_hash`) and
 * forwards only canonical values to n8n. No free text, no personal data: the schema is strict, so any other field
 * (names, phone, labels, answer text...) makes the request invalid.
 */

export const FEEDBACK_SOURCE = "colman_studymatch_v5_feedback";
export const FEEDBACK_ENDPOINT = "/api/v5/feedback";
export const FEEDBACK_RESULT_KINDS = [
  "recommended",
  "near_tie",
  "insufficient_positive_evidence",
  "v1_precision_result",
] as const;

const programId = z.enum(V2_PROGRAM_IDS as [string, ...string[]]);
const projectId = z.enum(V5_PROJECTS.map((project) => project.id) as [string, ...string[]]);
const worldId = z.enum(V3_WORLDS.map((world) => world.id) as [string, ...string[]]);
const count = z.number().int().min(0).max(100);

export const FeedbackRequestSchema = z
  .strictObject({
    /** Raw result-state identity (contains the answer-id sequence): used ONLY to derive the hash, never forwarded. */
    result_state_key: z.string().min(1).max(1000),
    source: z.literal(FEEDBACK_SOURCE),
    feedback_version: z.literal(FEEDBACK_VERSION),
    flow_version: z.literal("v5"),
    entry_mode: z.enum(["worlds", "projects"]),
    comparison_id: z.string().min(1).max(100),
    result_kind: z.enum(FEEDBACK_RESULT_KINDS),
    recommended_program: programId.optional(),
    alternative_programs: z.array(programId).max(3).optional(),
    selected_project_ids: z.array(projectId).max(2).optional(),
    selected_world_ids: z.array(worldId).max(2).optional(),
    scored_answer_count: count,
    total_answer_count: count,
    feedback_fit: z.enum(FEEDBACK_FIT_VALUES).optional(),
    feedback_helpfulness: z.enum(FEEDBACK_HELPFULNESS_VALUES).optional(),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!value.feedback_fit && !value.feedback_helpfulness) issue("at least one feedback answer");
    if (value.result_kind === "insufficient_positive_evidence" && value.feedback_fit) {
      issue("no fit question for an insufficient-evidence result");
    }
    const projects = value.selected_project_ids ?? [];
    const worlds = value.selected_world_ids ?? [];
    if (new Set(projects).size !== projects.length || new Set(worlds).size !== worlds.length) issue("duplicate id");
    if (value.entry_mode === "projects" && (projects.length < 1 || worlds.length > 0)) {
      issue("projects mode needs projects only");
    }
    if (value.entry_mode === "worlds" && (worlds.length < 1 || projects.length > 0)) {
      issue("worlds mode needs worlds only");
    }
  });

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

/** Canonical list representation shared with analytics: sorted, de-duplicated, pipe-joined. */
export const canonicalList = (ids: readonly string[] | undefined): string => [...new Set(ids ?? [])].sort().join("|");

/** What n8n receives: exactly the Feedback tab columns (except `submitted_at`, stamped by n8n). */
export interface FeedbackWebhookPayload {
  feedback_key_hash: string;
  source: typeof FEEDBACK_SOURCE;
  feedback_version: string;
  flow_version: "v5";
  entry_mode: "worlds" | "projects";
  comparison_id: string;
  result_kind: string;
  recommended_program: string;
  alternative_programs: string;
  selected_project_ids: string;
  selected_world_ids: string;
  scored_answer_count: number;
  total_answer_count: number;
  feedback_fit: string;
  feedback_helpfulness: string;
}

export function buildFeedbackWebhookPayload(request: FeedbackRequest, feedbackKeyHash: string): FeedbackWebhookPayload {
  return {
    feedback_key_hash: feedbackKeyHash,
    source: request.source,
    feedback_version: request.feedback_version,
    flow_version: request.flow_version,
    entry_mode: request.entry_mode,
    comparison_id: request.comparison_id,
    result_kind: request.result_kind,
    recommended_program: request.recommended_program ?? "",
    alternative_programs: canonicalList(request.alternative_programs),
    selected_project_ids: canonicalList(request.selected_project_ids),
    selected_world_ids: canonicalList(request.selected_world_ids),
    scored_answer_count: request.scored_answer_count,
    total_answer_count: request.total_answer_count,
    feedback_fit: request.feedback_fit ?? "",
    feedback_helpfulness: request.feedback_helpfulness ?? "",
  };
}
