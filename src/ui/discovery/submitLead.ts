import type { LeadField } from "@/flow";

export const LEAD_ENDPOINT = "/api/v2/lead";

export type LeadSubmitResult =
  { ok: true } | { ok: false; kind: "validation"; fields: LeadField[] } | { ok: false; kind: "server" | "network" };

interface LeadResponseJson {
  ok?: unknown;
  error?: unknown;
  fields?: unknown;
}

const FIELDS: readonly LeadField[] = ["firstName", "lastName", "phone", "consent"];

/**
 * Posts the lead to the same-origin API. The destination webhook is never known to the browser. Only the outcome is
 * returned: nothing about the request body is logged, stored or sent anywhere else.
 */
export async function submitLead(
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<LeadSubmitResult> {
  let response: Response;
  try {
    response = await fetchImpl(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  let json: { ok?: unknown; error?: unknown; fields?: unknown } | null = null;
  try {
    json = (await response.json()) as LeadResponseJson;
  } catch {
    json = null;
  }

  if (response.ok && json?.ok === true) return { ok: true };
  if (response.status === 400 && json?.error === "validation" && Array.isArray(json.fields)) {
    const fields = json.fields.filter((field): field is LeadField => FIELDS.includes(field as LeadField));
    if (fields.length > 0) return { ok: false, kind: "validation", fields };
  }
  return { ok: false, kind: "server" };
}
