import {
  buildLeadWebhookPayload,
  isValidName,
  LeadRequestSchema,
  normalizePhone,
  type LeadField,
  type LeadWebhookPayload,
} from "@/flow";

/**
 * Server side of the V2 lead form (THI-16 review pass): validate, then forward to the configured webhook.
 *
 * PII boundary: the candidate's name and phone exist only in this request, the in-memory payload and the outbound
 * webhook call. They are never logged (failures log a status code and nothing else), never put in a URL and never
 * touch analytics. A missing or failing webhook is an honest error: a lead is never reported as sent when it was not.
 *
 * `LEAD_WEBHOOK_URL` is server-only (no NEXT_PUBLIC_ prefix), so the destination is never shipped to the browser.
 * The destination may later be n8n, a Sheets bridge, a CRM or anything else that accepts a JSON POST.
 */

export const LEAD_MAX_BODY_BYTES = 10_000;
export const LEAD_WEBHOOK_TIMEOUT_MS = 8_000;

export type LeadErrorCode =
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_json"
  | "invalid_request"
  | "validation"
  | "rejected"
  | "not_configured"
  | "delivery_failed";

export type LeadResponseBody = { ok: true } | { ok: false; error: LeadErrorCode; fields?: LeadField[] };

export interface LeadHandlerDeps {
  /** Value of the server-only `LEAD_WEBHOOK_URL`; empty or undefined means "not configured". */
  webhookUrl: string | undefined;
  fetchImpl: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
}

function respond(status: number, body: LeadResponseBody): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const fail = (status: number, error: LeadErrorCode, fields?: LeadField[]) =>
  respond(status, { ok: false, error, ...(fields ? { fields } : {}) });

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

export async function handleLeadRequest(request: Request, deps: LeadHandlerDeps): Promise<Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(415, "unsupported_media_type");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "invalid_json");
  }
  if (new TextEncoder().encode(text).length > LEAD_MAX_BODY_BYTES) return fail(413, "payload_too_large");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "invalid_json");
  }

  const parsed = LeadRequestSchema.safeParse(json);
  if (!parsed.success) {
    // A missing/false consent is a field problem the form can show; everything else is a malformed request.
    const fields: LeadField[] = [];
    const record = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    if (record.consent !== true) fields.push("consent");
    return fields.length > 0 && parsed.error.issues.every((issue) => issue.path[0] === "consent")
      ? fail(400, "validation", fields)
      : fail(400, "invalid_request");
  }

  const lead = parsed.data;
  // Honeypot: real people never see or fill this field.
  if (lead.website && lead.website.trim() !== "") return fail(400, "rejected");

  const phone = normalizePhone(lead.phone);
  const invalid: LeadField[] = [];
  if (!isValidName(lead.first_name)) invalid.push("firstName");
  if (!isValidName(lead.last_name)) invalid.push("lastName");
  if (!phone) invalid.push("phone");
  if (invalid.length > 0 || !phone) return fail(400, "validation", invalid);

  const target = webhookTarget(deps.webhookUrl);
  if (!target) return fail(503, "not_configured");

  const payload: LeadWebhookPayload = buildLeadWebhookPayload(lead, phone, deps.now());
  try {
    const response = await deps.fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? LEAD_WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[lead] webhook rejected the lead", { status: response.status });
      return fail(502, "delivery_failed");
    }
  } catch (error) {
    // Only the error class is logged: never the payload, and never a message that could echo it.
    console.error("[lead] webhook unreachable", { reason: error instanceof Error ? error.name : "unknown" });
    return fail(502, "delivery_failed");
  }
  return respond(200, { ok: true });
}
