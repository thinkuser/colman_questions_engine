import { handleLeadRequest } from "@/server/leadHandler";

// Always dynamic: the response depends on server-only configuration and the request body.
export const dynamic = "force-dynamic";

/**
 * Same-origin lead intake for V2. The browser posts here; the server validates and forwards to `LEAD_WEBHOOK_URL`
 * (server-only; never exposed to the client). See docs/V2_EXPERIENCE.md ("Lead infrastructure").
 */
export async function POST(request: Request): Promise<Response> {
  return handleLeadRequest(request, {
    webhookUrl: process.env.LEAD_WEBHOOK_URL,
    fetchImpl: fetch,
    now: () => new Date(),
  });
}
