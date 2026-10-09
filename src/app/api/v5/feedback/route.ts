import { handleFeedbackRequest } from "@/server/feedbackHandler";

// Always dynamic: the response depends on server-only configuration and the request body.
export const dynamic = "force-dynamic";

/**
 * Same-origin V5 pilot feedback intake (DEC-039). The browser posts here; the server validates, hashes the result-state
 * key and forwards to `FEEDBACK_WEBHOOK_URL` (server-only, never exposed to the client).
 */
export async function POST(request: Request): Promise<Response> {
  return handleFeedbackRequest(request, { webhookUrl: process.env.FEEDBACK_WEBHOOK_URL, fetchImpl: fetch });
}
