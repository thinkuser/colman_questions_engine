import { FEEDBACK_ENDPOINT } from "@/flow/feedback";

/**
 * Posts the structured V5 pilot feedback to the same-origin API (DEC-039). The n8n webhook is never known to the
 * browser. Only the outcome is returned: true means the server confirmed that the feedback was persisted.
 */
export async function submitFeedback(body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const json = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    return json?.ok === true;
  } catch {
    return false;
  }
}
