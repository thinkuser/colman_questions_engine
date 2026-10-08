import { createHash } from "node:crypto";
import { buildFeedbackWebhookPayload, FeedbackRequestSchema } from "@/flow/feedback";

/**
 * Server side of the V5 pilot feedback (DEC-039): validate, hash the result-state key, forward to the server-only
 * `FEEDBACK_WEBHOOK_URL` (n8n -> the Feedback tab). Same security principle as the lead flow: the browser never
 * sees the webhook URL; nothing from the request body is logged (failures log a status code or error class only);
 * a missing or failing webhook is an honest error, so the client never claims feedback was saved when it was not.
 *
 * Privacy: the raw `result_state_key` contains the answer-id sequence. It is hashed here (SHA-256) and the hash is the
 * only thing forwarded, so it never reaches n8n, the sheet or analytics.
 */

export const FEEDBACK_MAX_BODY_BYTES = 4_000;
export const FEEDBACK_WEBHOOK_TIMEOUT_MS = 8_000;

export type FeedbackErrorCode =
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_json"
  | "invalid_request"
  | "not_configured"
  | "delivery_failed";

export type FeedbackResponseBody = { ok: true; deduped: boolean } | { ok: false; error: FeedbackErrorCode };

export interface FeedbackHandlerDeps {
  /** Value of the server-only `FEEDBACK_WEBHOOK_URL`; empty or undefined means "persistence unavailable". */
  webhookUrl: string | undefined;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

const respond = (status: number, body: FeedbackResponseBody) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (status: number, error: FeedbackErrorCode) => respond(status, { ok: false, error });

export const hashResultStateKey = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

function webhookTarget(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export async function handleFeedbackRequest(request: Request, deps: FeedbackHandlerDeps): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "unsupported_media_type");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "invalid_json");
  }
  if (new TextEncoder().encode(text).length > FEEDBACK_MAX_BODY_BYTES) return fail(413, "payload_too_large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json");
  }
  const parsed = FeedbackRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "invalid_request");

  const target = webhookTarget(deps.webhookUrl);
  if (!target) return fail(503, "not_configured");

  const payload = buildFeedbackWebhookPayload(parsed.data, hashResultStateKey(parsed.data.result_state_key));
  try {
    const response = await deps.fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? FEEDBACK_WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[feedback] webhook rejected the feedback", { status: response.status });
      return fail(502, "delivery_failed");
    }
    let deduped = false;
    try {
      deduped = ((await response.json()) as { deduped?: unknown } | null)?.deduped === true;
    } catch {
      // A 2xx without a JSON body still means the workflow accepted the feedback.
    }
    return respond(200, { ok: true, deduped });
  } catch (error) {
    console.error("[feedback] webhook unreachable", { reason: error instanceof Error ? error.name : "unknown" });
    return fail(502, "delivery_failed");
  }
}
