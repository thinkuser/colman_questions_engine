import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLeadRequest, leadContextFromResult, type LeadWebhookPayload } from "@/flow";
import { handleLeadRequest, type LeadHandlerDeps } from "@/server/leadHandler";
import { runPersona } from "../flow/v2PersonaRun";
import { V2_PERSONAS } from "../flow/v2Personas";

const WEBHOOK = "https://hooks.example.test/lead";
const NOW = new Date("2026-10-07T09:30:00.000Z");
const PII = { first: "דנה", last: "לוי-כהן", phone: "050-123-4567", phoneLocal: "0501234567" };

function body(personaId: string, overrides: Record<string, unknown> = {}) {
  const persona = V2_PERSONAS.find((candidate) => candidate.id === personaId)!;
  const { state, view } = runPersona(persona);
  return {
    ...buildLeadRequest({
      firstName: PII.first,
      lastName: PII.last,
      phone: PII.phone,
      consent: true,
      website: "",
      comparisonId: "journey-123",
      context: leadContextFromResult(view),
      selectedProjectIds: state.selectedProjectIds,
    }),
    ...overrides,
  };
}

const post = (payload: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/v2/lead", {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

function setup(fetchImpl?: LeadHandlerDeps["fetchImpl"], ...rest: [webhookUrl?: string]) {
  const webhookUrl = rest.length > 0 ? rest[0] : WEBHOOK;
  const fetchMock = vi.fn(fetchImpl ?? (async () => new Response("ok", { status: 200 })));
  const deps: LeadHandlerDeps = { webhookUrl, fetchImpl: fetchMock as unknown as typeof fetch, now: () => NOW };
  return { fetchMock, deps };
}

const sentPayload = (fetchMock: ReturnType<typeof setup>["fetchMock"]): LeadWebhookPayload =>
  JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);

afterEach(() => vi.restoreAllMocks());

describe("lead API: valid submissions", () => {
  it.each([
    ["accounting", "recommended"],
    ["business_vs_economics", "near_tie"],
    ["insufficient", "insufficient_positive_evidence"],
    ["focused_tech", "v1_precision_result"],
  ])("forwards a %s result as %s and returns ok", async (personaId, kind) => {
    const { fetchMock, deps } = setup();
    const response = await handleLeadRequest(post(body(personaId)), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(WEBHOOK);
    expect((init as RequestInit).method).toBe("POST");
    const payload = sentPayload(fetchMock);
    expect(payload.result_kind).toBe(kind);
    expect(payload.first_name).toBe(PII.first);
    expect(payload.phone).toBe(PII.phoneLocal);
    expect(payload.comparison_id).toBe("journey-123");
    expect(payload.flow_version).toBe("v2");
    expect(payload.submitted_at).toBe(NOW.toISOString());
    expect(payload.selected_project_ids.length).toBeGreaterThan(0);
  });

  it("maps program roles correctly: primary only when there is a recommendation, peers for a tie", async () => {
    const roles = async (personaId: string) => {
      const { fetchMock, deps } = setup();
      await handleLeadRequest(post(body(personaId)), deps);
      return sentPayload(fetchMock);
    };
    const recommended = await roles("accounting");
    expect(recommended.primary_program?.id).toBe("accounting");
    expect(recommended.primary_program?.name).toMatch(/[֐-׿]/);
    expect(recommended.alternative_programs.every((entry) => entry.role === "alternative")).toBe(true);

    const tie = await roles("business_vs_economics");
    expect(tie.primary_program).toBeNull();
    expect(tie.alternative_programs.map((entry) => entry.role)).toEqual(["peer", "peer"]);

    const insufficient = await roles("insufficient");
    expect(insufficient.primary_program).toBeNull();
    expect(insufficient.alternative_programs.every((entry) => entry.role === "weak_direction")).toBe(true);

    const tech = await roles("focused_tech");
    expect(tech.primary_program?.id).toBe("computer_science");
    expect(tech.alternative_programs).toHaveLength(1);
  });

  it("includes both selected projects of a two-project journey", async () => {
    const { fetchMock, deps } = setup();
    await handleLeadRequest(post(body("tiktok_nike")), deps);
    expect(sentPayload(fetchMock).selected_project_ids.sort()).toEqual(
      ["nike_israel_launch", "tiktok_endless_scroll"].sort(),
    );
  });

  it("derives program names on the server: a client-supplied name is not accepted", async () => {
    const { fetchMock, deps } = setup();
    const tampered = body("accounting", { primary_program_name: "Injected" });
    const response = await handleLeadRequest(post(tampered), deps);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("lead API: validation", () => {
  const rejects = async (overrides: Record<string, unknown>, expectedFields?: string[]) => {
    const { fetchMock, deps } = setup();
    const response = await handleLeadRequest(post(body("accounting", overrides)), deps);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.ok).toBe(false);
    if (expectedFields) expect(json.fields).toEqual(expectedFields);
    expect(fetchMock).not.toHaveBeenCalled();
    return json;
  };

  it("rejects a missing first name", async () => {
    await rejects({ first_name: "  " }, ["firstName"]);
  });
  it("rejects a missing last name", async () => {
    await rejects({ last_name: "" }, ["lastName"]);
  });
  it("rejects an invalid phone", async () => {
    await rejects({ phone: "12-34" }, ["phone"]);
  });
  it("rejects consent that is false or absent", async () => {
    await rejects({ consent: false }, ["consent"]);
    const { deps, fetchMock } = setup();
    const missing = body("accounting");
    delete (missing as Record<string, unknown>).consent;
    const response = await handleLeadRequest(post(missing), deps);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a populated honeypot without forwarding anything", async () => {
    const json = await rejects({ website: "http://spam.example" });
    expect(json.error).toBe("rejected");
  });
  it("reports several invalid fields together", async () => {
    await rejects({ first_name: "", phone: "x" }, ["firstName", "phone"]);
  });
  it("rejects an email field (the form has none) and unknown program ids", async () => {
    await rejects({ email: "a@b.co" });
    await rejects({ primary_program_id: "not_a_program" });
  });
  it("rejects malformed JSON, a wrong content type and an oversized body", async () => {
    const { deps } = setup();
    expect((await handleLeadRequest(post("{not json"), deps)).status).toBe(400);
    expect((await handleLeadRequest(post(body("accounting"), { "content-type": "text/plain" }), deps)).status).toBe(
      415,
    );
    expect(
      (await handleLeadRequest(post({ ...body("accounting"), first_name: "x".repeat(20_000) }), deps)).status,
    ).toBe(413);
  });
});

describe("lead API: webhook configuration and failures", () => {
  it.each([undefined, "", "   ", "not a url", "ftp://example.test/hook"])(
    "returns 503 and never claims success when LEAD_WEBHOOK_URL is %j",
    async (value) => {
      const { fetchMock, deps } = setup(undefined, ...(value === undefined ? [undefined] : [value]));
      const response = await handleLeadRequest(post(body("accounting")), deps);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: "not_configured" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([400, 404, 429, 500, 503])("treats a webhook %i as a failed delivery (502)", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = setup(async () => new Response("nope", { status }));
    const response = await handleLeadRequest(post(body("accounting")), deps);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: "delivery_failed" });
  });

  it("treats a network error or timeout as a failed delivery", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = setup(async () => {
      throw new TypeError("fetch failed");
    });
    const response = await handleLeadRequest(post(body("accounting")), deps);
    expect(response.status).toBe(502);
  });

  it("never logs the candidate's personal data, even when delivery fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps } = setup(async () => {
      throw new Error(`boom ${PII.first} ${PII.phoneLocal}`);
    });
    await handleLeadRequest(post(body("accounting")), deps);
    await handleLeadRequest(post(body("accounting", { first_name: "" })), deps);
    const logged = JSON.stringify([...error.mock.calls, ...log.mock.calls, ...warn.mock.calls]);
    for (const secret of [PII.first, PII.last, PII.phone, PII.phoneLocal]) expect(logged).not.toContain(secret);
  });

  it("sets no-store and returns only a status code body, never the submitted values", async () => {
    const { deps } = setup();
    const response = await handleLeadRequest(post(body("accounting")), deps);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(PII.first);
    expect(text).not.toContain(PII.phoneLocal);
  });
});

describe("lead API: flow version", () => {
  it("forwards a V3 lead as flow_version v3, a V2 or untagged lead as v2, and rejects unknown versions", async () => {
    const forwarded = async (overrides: Record<string, unknown>) => {
      const { fetchMock, deps } = setup();
      const response = await handleLeadRequest(post(body("accounting", overrides)), deps);
      return { response, payload: response.status === 200 ? sentPayload(fetchMock) : null };
    };
    expect((await forwarded({ flow_version: "v3" })).payload?.flow_version).toBe("v3");
    expect((await forwarded({ flow_version: "v2" })).payload?.flow_version).toBe("v2");
    expect((await forwarded({})).payload?.flow_version).toBe("v2");
    expect((await forwarded({ flow_version: "v9" })).response.status).toBe(400);
  });

  it("keeps the webhook contract identical apart from flow_version", async () => {
    const keys = async (overrides: Record<string, unknown>) => {
      const { fetchMock, deps } = setup();
      await handleLeadRequest(post(body("business_vs_economics", overrides)), deps);
      return Object.keys(sentPayload(fetchMock)).sort();
    };
    expect(await keys({ flow_version: "v3" })).toEqual(await keys({ flow_version: "v2" }));
  });
});

describe("lead API: world-led (V3) leads", () => {
  const worldBody = (overrides: Record<string, unknown> = {}) => ({
    ...body("business_vs_economics"),
    flow_version: "v3",
    selected_project_ids: [],
    selected_world_ids: ["business_markets", "law_justice"],
    ...overrides,
  });

  it("forwards selected_world_ids and an empty selected_project_ids, flow_version v3", async () => {
    const { fetchMock, deps } = setup();
    const response = await handleLeadRequest(post(worldBody()), deps);
    expect(response.status).toBe(200);
    const payload = sentPayload(fetchMock);
    expect(payload.flow_version).toBe("v3");
    expect(payload.selected_world_ids).toEqual(["business_markets", "law_justice"]);
    expect(payload.selected_project_ids).toEqual([]);
  });

  it("rejects unknown worlds, world ids in the project field and world selections outside V3", async () => {
    for (const bad of [
      worldBody({ selected_world_ids: ["not_a_world"] }),
      worldBody({ selected_project_ids: ["business_markets"], selected_world_ids: [] }),
      worldBody({ flow_version: "v2" }),
      worldBody({ selected_project_ids: ["wolt_new_city"] }),
    ]) {
      const { fetchMock, deps } = setup();
      const response = await handleLeadRequest(post(bad), deps);
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("leaves a V2 lead exactly as before: no selected_world_ids in the webhook payload", async () => {
    const { fetchMock, deps } = setup();
    await handleLeadRequest(post(body("accounting", { flow_version: "v2" })), deps);
    expect(sentPayload(fetchMock)).not.toHaveProperty("selected_world_ids");
  });
});

describe("lead API: V4 dual-entry leads", () => {
  const v4 = (mode: "worlds" | "projects", overrides: Record<string, unknown> = {}) => ({
    ...body("business_vs_economics"),
    flow_version: "v4",
    entry_mode: mode,
    selected_project_ids: mode === "projects" ? ["wolt_new_city"] : [],
    selected_world_ids: mode === "worlds" ? ["business_markets"] : [],
    ...overrides,
  });

  it.each(["worlds", "projects"] as const)("forwards a V4 %s lead with entry_mode and both lists", async (mode) => {
    const { fetchMock, deps } = setup();
    const response = await handleLeadRequest(post(v4(mode)), deps);
    expect(response.status).toBe(200);
    expect(sentPayload(fetchMock)).toMatchObject({
      flow_version: "v4",
      entry_mode: mode,
      selected_project_ids: mode === "projects" ? ["wolt_new_city"] : [],
      selected_world_ids: mode === "worlds" ? ["business_markets"] : [],
    });
  });

  it("rejects mismatched, mixed, missing-mode and invalid V4 selections", async () => {
    for (const bad of [
      v4("worlds", { selected_project_ids: ["wolt_new_city"] }),
      v4("projects", { selected_world_ids: ["business_markets"] }),
      v4("worlds", { entry_mode: "projects" }),
      v4("worlds", { entry_mode: undefined }),
      v4("worlds", { selected_world_ids: ["not_a_world"] }),
      v4("projects", { selected_project_ids: ["business_markets"] }),
    ]) {
      const { fetchMock, deps } = setup();
      expect((await handleLeadRequest(post(bad), deps)).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("still accepts V2 and V3 leads unchanged, and rejects entry_mode on them", async () => {
    const ok = async (b: Record<string, unknown>) => (await handleLeadRequest(post(b), setup().deps)).status;
    expect(await ok(body("accounting", { flow_version: "v2" }))).toBe(200);
    expect(
      await ok({
        ...body("business_vs_economics"),
        flow_version: "v3",
        selected_project_ids: [],
        selected_world_ids: ["law_justice"],
      }),
    ).toBe(200);
    expect(await ok(body("accounting", { flow_version: "v2", entry_mode: "projects" }))).toBe(400);
  });
});
