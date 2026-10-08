import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_ENDPOINT, FEEDBACK_SOURCE, canonicalList } from "@/flow/feedback";
import {
  FEEDBACK_MAX_BODY_BYTES,
  handleFeedbackRequest,
  hashResultStateKey,
  type FeedbackHandlerDeps,
} from "@/server/feedbackHandler";
import { submitFeedback } from "@/ui/discovery/submitFeedback";

const WEBHOOK = "https://hooks.example.test/feedback";
const RAW_KEY = "journey-1|wolt_city_expansion|V5-WOLT=A,B2=neither,B5=A";

const valid = (overrides: Record<string, unknown> = {}) => ({
  result_state_key: RAW_KEY,
  source: FEEDBACK_SOURCE,
  feedback_version: "v1",
  flow_version: "v5",
  entry_mode: "projects",
  comparison_id: "journey-1",
  result_kind: "recommended",
  recommended_program: "business_administration",
  alternative_programs: ["economics_and_management", "accounting"],
  selected_project_ids: ["wolt_city_expansion"],
  scored_answer_count: 4,
  total_answer_count: 5,
  feedback_fit: "quite_suitable",
  feedback_helpfulness: "yes",
  ...overrides,
});

const post = (payload: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/v5/feedback", {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

function setup(fetchImpl?: FeedbackHandlerDeps["fetchImpl"], ...rest: [webhookUrl?: string]) {
  const webhookUrl = rest.length > 0 ? rest[0] : WEBHOOK;
  const fetchMock = vi.fn(fetchImpl ?? (async () => Response.json({ ok: true, deduped: false }, { status: 200 })));
  const deps: FeedbackHandlerDeps = { webhookUrl, fetchImpl: fetchMock as unknown as typeof fetch };
  return { fetchMock, deps };
}

afterEach(() => vi.restoreAllMocks());

describe("V5 feedback API: valid requests", () => {
  it("forwards a recommended feedback with canonical values and the hash, and answers ok", async () => {
    const { fetchMock, deps } = setup();
    const response = await handleFeedbackRequest(post(valid()), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, deduped: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0]!;
    expect(String(target)).toBe(WEBHOOK);
    expect((init as RequestInit).method).toBe("POST");
    const forwarded = JSON.parse((init as RequestInit).body as string);
    expect(forwarded).toEqual({
      feedback_key_hash: createHash("sha256").update(RAW_KEY).digest("hex"),
      source: FEEDBACK_SOURCE,
      feedback_version: "v1",
      flow_version: "v5",
      entry_mode: "projects",
      comparison_id: "journey-1",
      result_kind: "recommended",
      recommended_program: "business_administration",
      alternative_programs: "accounting|economics_and_management",
      selected_project_ids: "wolt_city_expansion",
      selected_world_ids: "",
      scored_answer_count: 4,
      total_answer_count: 5,
      feedback_fit: "quite_suitable",
      feedback_helpfulness: "yes",
    });
  });

  it("accepts near-tie feedback (peers, two worlds) and normalizes the lists", async () => {
    const { fetchMock, deps } = setup();
    const response = await handleFeedbackRequest(
      post(
        valid({
          entry_mode: "worlds",
          result_kind: "near_tie",
          recommended_program: undefined,
          alternative_programs: ["communication_and_management", "communication"],
          selected_project_ids: undefined,
          selected_world_ids: ["law_justice", "business_markets"],
        }),
      ),
      deps,
    );
    expect(response.status).toBe(200);
    const forwarded = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(forwarded).toMatchObject({
      result_kind: "near_tie",
      recommended_program: "",
      alternative_programs: "communication|communication_and_management",
      selected_world_ids: "business_markets|law_justice",
      selected_project_ids: "",
    });
  });

  it("accepts insufficient-evidence feedback without fit (helpfulness only), and a fit-only submission", async () => {
    const { fetchMock, deps } = setup();
    const insufficient = await handleFeedbackRequest(
      post(
        valid({ result_kind: "insufficient_positive_evidence", feedback_fit: undefined, feedback_helpfulness: "no" }),
      ),
      deps,
    );
    expect(insufficient.status).toBe(200);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({
      feedback_fit: "",
      feedback_helpfulness: "no",
    });
    const fitOnly = await handleFeedbackRequest(post(valid({ feedback_helpfulness: undefined })), deps);
    expect(fitOnly.status).toBe(200);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      feedback_fit: "quite_suitable",
      feedback_helpfulness: "",
    });
  });

  it("passes the workflow's dedupe answer through", async () => {
    const { deps } = setup(async () => Response.json({ ok: true, deduped: true }));
    const response = await handleFeedbackRequest(post(valid()), deps);
    expect(await response.json()).toEqual({ ok: true, deduped: true });
  });
});

describe("V5 feedback API: validation", () => {
  const rejects = async (payload: unknown, status = 400) => {
    const { fetchMock, deps } = setup();
    const response = await handleFeedbackRequest(post(payload), deps);
    expect(response.status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
    return response.json();
  };

  it("rejects a wrong flow version, feedback version or source", async () => {
    await rejects(valid({ flow_version: "v4" }));
    await rejects(valid({ feedback_version: "v2" }));
    await rejects(valid({ source: "colman_studymatch_v5" }));
  });

  it("rejects invalid enums, an invalid result kind and a missing entry mode", async () => {
    await rejects(valid({ feedback_fit: "great" }));
    await rejects(valid({ feedback_helpfulness: "maybe" }));
    await rejects(valid({ result_kind: "winner" }));
    await rejects(valid({ entry_mode: undefined }));
    await rejects(valid({ comparison_id: undefined }));
  });

  it("rejects a request with neither feedback answer, and a fit for an insufficient-evidence result", async () => {
    await rejects(valid({ feedback_fit: undefined, feedback_helpfulness: undefined }));
    await rejects(valid({ result_kind: "insufficient_positive_evidence" }));
  });

  it("rejects unknown programs / ids and an entry mode that does not match the selection", async () => {
    await rejects(valid({ recommended_program: "medicine" }));
    await rejects(valid({ selected_project_ids: ["wolt_new_city"] })); // a V4-only id
    await rejects(valid({ selected_project_ids: ["a", "b", "c"] }));
    await rejects(valid({ entry_mode: "worlds" })); // projects selected
    await rejects(valid({ selected_world_ids: ["law_justice"] })); // mixed lists
  });

  it("rejects an oversized state key and an oversized body", async () => {
    await rejects(valid({ result_state_key: "x".repeat(1001) }));
    const body = await rejects(valid({ comparison_id: "x".repeat(FEEDBACK_MAX_BODY_BYTES) }), 413);
    expect(body).toEqual({ ok: false, error: "payload_too_large" });
  });

  it("rejects personal data and any unknown field (strict schema), and non-JSON requests", async () => {
    for (const extra of [
      { first_name: "דנה" },
      { last_name: "לוי" },
      { phone: "0501234567" },
      { consent: true },
      { answer_text: "מאוד מתאים" },
      { raw_answers: "V5-WOLT=A" },
      { comment: "free text" },
    ])
      await rejects(valid(extra));
    const { deps } = setup();
    expect((await handleFeedbackRequest(post("{nope"), deps)).status).toBe(400);
    expect((await handleFeedbackRequest(post(valid(), { "content-type": "text/plain" }), deps)).status).toBe(415);
  });
});

describe("V5 feedback API: hash and privacy", () => {
  it("never forwards the raw result state key or any answer sequence; only the stable SHA-256", async () => {
    const { fetchMock, deps } = setup();
    await handleFeedbackRequest(post(valid()), deps);
    const sent = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(sent).not.toContain(RAW_KEY);
    expect(sent).not.toContain("result_state_key");
    expect(sent).not.toContain("V5-WOLT");
    expect(sent).toContain(hashResultStateKey(RAW_KEY));
    // Stable (same state -> same hash) and distinct per state.
    expect(hashResultStateKey(RAW_KEY)).toBe(hashResultStateKey(RAW_KEY));
    expect(hashResultStateKey(RAW_KEY)).not.toBe(hashResultStateKey(RAW_KEY + ",B3=A"));
    expect(hashResultStateKey(RAW_KEY)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("logs nothing from the request body on failures", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = setup(async () => new Response("boom", { status: 500 }));
    await handleFeedbackRequest(post(valid()), deps);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(RAW_KEY);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("journey-1");
  });

  it("uses the same canonical list form as analytics", () => {
    expect(canonicalList(["b", "a", "a"])).toBe("a|b");
    expect(canonicalList(undefined)).toBe("");
  });
});

describe("V5 feedback API: upstream behaviour", () => {
  it("answers 503 when the webhook is not configured or malformed (never pretends it was saved)", async () => {
    for (const url of [undefined, "", "   ", "not a url", "ftp://x.test/hook"]) {
      const { fetchMock, deps } = setup(undefined, url);
      const response = await handleFeedbackRequest(post(valid()), deps);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: "not_configured" });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("answers 502 when the upstream fails or rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = setup(async () => new Response("no", { status: 500 }));
    expect((await handleFeedbackRequest(post(valid()), failing.deps)).status).toBe(502);
    const down = setup(async () => {
      throw new TypeError("fetch failed");
    });
    const response = await handleFeedbackRequest(post(valid()), down.deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: "delivery_failed" });
  });

  it("times out an unresponsive upstream (8 s by default; injectable here) with a 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang = setup(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal!.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError")));
        }),
    );
    const response = await handleFeedbackRequest(post(valid()), { ...hang.deps, timeoutMs: 20 });
    expect(response.status).toBe(502);
  });

  it("treats a 2xx without a JSON body as saved (not deduped)", async () => {
    const { deps } = setup(async () => new Response("ok", { status: 200 }));
    expect(await (await handleFeedbackRequest(post(valid()), deps)).json()).toEqual({ ok: true, deduped: false });
  });
});

describe("browser submitFeedback", () => {
  it("posts to the same-origin endpoint (never a webhook) and reports true only on a confirmed ok", async () => {
    const calls: string[] = [];
    const ok = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return Response.json({ ok: true, deduped: false });
    });
    expect(await submitFeedback({ a: 1 }, ok as unknown as typeof fetch)).toBe(true);
    expect(calls).toEqual([FEEDBACK_ENDPOINT]);
    expect(FEEDBACK_ENDPOINT).toBe("/api/v5/feedback");
    for (const bad of [
      async () => new Response("{}", { status: 502 }),
      async () => Response.json({ ok: false }, { status: 200 }),
      async () => new Response("not json", { status: 200 }),
      async () => {
        throw new Error("offline");
      },
    ])
      expect(await submitFeedback({}, bad as unknown as typeof fetch)).toBe(false);
  });
});
