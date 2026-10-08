import { describe, expect, it } from "vitest";
import {
  buildLeadRequest,
  buildLeadWebhookPayload,
  isValidName,
  leadContextFromResult,
  LeadRequestSchema,
  normalizePhone,
  validateLeadForm,
} from "@/flow";
import { runPersona } from "./v2PersonaRun";
import { V2_PERSONAS } from "./v2Personas";

const persona = (id: string) => V2_PERSONAS.find((candidate) => candidate.id === id)!;
const contextOf = (id: string) => {
  const run = runPersona(persona(id));
  return { run, context: leadContextFromResult(run.view) };
};
const NOW = new Date("2026-10-07T09:30:00.000Z");

describe("phone normalisation", () => {
  it.each([
    ["0501234567", "0501234567"],
    ["050-1234567", "0501234567"],
    ["050 123 4567", "0501234567"],
    ["(050) 123-4567", "0501234567"],
    ["050.123.4567", "0501234567"],
    ["+972501234567", "0501234567"],
    ["+972-50-123-4567", "0501234567"],
    ["972501234567", "0501234567"],
    ["00972501234567", "0501234567"],
    ["+972 (0)50 123 4567", "0501234567"],
    ["03-1234567", "031234567"],
    ["072-1234567", "0721234567"],
  ])("accepts %s as %s", (raw, local) => {
    expect(normalizePhone(raw)?.phone).toBe(local);
    expect(normalizePhone(raw)?.phoneE164).toBe(`+972${local.slice(1)}`);
  });

  it("accepts a foreign number written with a plus and keeps it as E.164", () => {
    expect(normalizePhone("+1 (212) 555-0100")).toEqual({ phone: "+12125550100", phoneE164: "+12125550100" });
  });

  it.each(["", "abc", "123", "0501234", "05012345678", "0112345678", "+972 50 123", "050-123-45x7", "++972501234567"])(
    "rejects %j",
    (raw) => {
      expect(normalizePhone(raw)).toBeNull();
    },
  );
});

describe("name validation", () => {
  it.each(["דנה", "יוסי-כהן", "O'Neil", "Anne Marie", "ג׳ורג׳", "  נועה  "])("accepts %j", (name) => {
    expect(isValidName(name)).toBe(true);
  });
  it.each(["", " ", "א", "12345", "<script>", "a".repeat(51), "😀😀"])("rejects %j", (name) => {
    expect(isValidName(name)).toBe(false);
  });
});

describe("client validation", () => {
  const good = { firstName: "דנה", lastName: "לוי", phone: "050-1234567", consent: true };
  it("reports every invalid field and nothing for a good form", () => {
    expect(validateLeadForm(good)).toEqual([]);
    expect(validateLeadForm({ firstName: "", lastName: "", phone: "1", consent: false })).toEqual([
      "firstName",
      "lastName",
      "phone",
      "consent",
    ]);
  });
});

describe("result context -> lead roles", () => {
  it("recommended: the recommendation is primary and the supported runner-up an alternative", () => {
    const { run, context } = contextOf("accounting");
    expect(context.resultKind).toBe("recommended");
    expect(context.primaryProgramId).toBe(persona("accounting").expect.programs[0]);
    expect(context.alternatives.every((entry) => entry.role === "alternative")).toBe(true);
    expect(context.alternatives.length).toBeLessThanOrEqual(1);
    expect(run.view.type).toBe("generic");
  });

  it("near tie: no winner, both shown programs are peers", () => {
    const { context } = contextOf("business_vs_economics");
    expect(context.resultKind).toBe("near_tie");
    expect(context.primaryProgramId).toBeNull();
    expect(context.alternatives).toHaveLength(2);
    expect(context.alternatives.every((entry) => entry.role === "peer")).toBe(true);
  });

  it("insufficient positive evidence: no primary, a weak direction at most once", () => {
    const { context } = contextOf("insufficient");
    expect(context.resultKind).toBe("insufficient_positive_evidence");
    expect(context.primaryProgramId).toBeNull();
    expect(context.alternatives.length).toBeLessThanOrEqual(1);
    expect(context.alternatives.every((entry) => entry.role === "weak_direction")).toBe(true);
  });

  it("Tech precision: the V1 best fit is primary, the V1 secondary is an alternative", () => {
    const { run, context } = contextOf("focused_tech");
    expect(run.view.type).toBe("precision");
    expect(context.resultKind).toBe("v1_precision_result");
    expect(context.primaryProgramId).toBe(persona("focused_tech").expect.programs[0]);
    expect(context.alternatives).toHaveLength(1);
    expect(context.alternatives[0]?.role).toBe("alternative");
  });

  it("every acceptance persona produces a context that the request schema accepts", () => {
    for (const candidate of V2_PERSONAS) {
      const { state, view } = runPersona(candidate);
      const body = buildLeadRequest({
        firstName: "דנה",
        lastName: "לוי",
        phone: "0501234567",
        consent: true,
        website: "",
        comparisonId: "journey-1",
        context: leadContextFromResult(view),
        selectedProjectIds: state.selectedProjectIds,
      });
      const parsed = LeadRequestSchema.safeParse(body);
      expect(parsed.success, candidate.id).toBe(true);
    }
  });
});

describe("request schema", () => {
  const valid = () => {
    const { run, context } = contextOf("business_vs_economics");
    return buildLeadRequest({
      firstName: "דנה",
      lastName: "לוי",
      phone: "0501234567",
      consent: true,
      website: "",
      comparisonId: "journey-1",
      context,
      selectedProjectIds: run.state.selectedProjectIds,
    });
  };

  it("rejects consent that is not exactly true, unknown keys, unknown ids and impossible role combinations", () => {
    expect(LeadRequestSchema.safeParse({ ...valid(), consent: false }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...valid(), email: "a@b.co" }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...valid(), primary_program_id: "made_up" }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...valid(), selected_project_ids: [] }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...valid(), selected_project_ids: ["nope"] }).success).toBe(false);
    // A near tie cannot name a winner.
    expect(LeadRequestSchema.safeParse({ ...valid(), primary_program_id: "psychology" }).success).toBe(false);
    // A recommendation needs a primary.
    expect(
      LeadRequestSchema.safeParse({
        ...valid(),
        result_kind: "recommended",
        primary_program_id: null,
        alternative_programs: [],
      }).success,
    ).toBe(false);
  });
});

describe("webhook payload", () => {
  it("carries the PII, the consent version, the result context, program ids AND Hebrew names", () => {
    const { run, context } = contextOf("business_vs_economics");
    const request = LeadRequestSchema.parse(
      buildLeadRequest({
        firstName: "  דנה ",
        lastName: "לוי",
        phone: "+972-50-123-4567",
        consent: true,
        website: "",
        comparisonId: "journey-1",
        context,
        selectedProjectIds: run.state.selectedProjectIds,
      }),
    );
    const payload = buildLeadWebhookPayload(request, normalizePhone(request.phone)!, NOW);
    expect(payload).toMatchObject({
      first_name: "דנה",
      last_name: "לוי",
      phone: "0501234567",
      phone_e164: "+972501234567",
      consent: true,
      flow_version: "v2",
      comparison_id: "journey-1",
      result_kind: "near_tie",
      primary_program: null,
      selected_project_ids: ["wolt_new_city"],
      submitted_at: "2026-10-07T09:30:00.000Z",
    });
    expect(payload.consent_text_version).toMatch(/^\d{4}-/);
    expect(payload.alternative_programs.map((entry) => entry.role)).toEqual(["peer", "peer"]);
    for (const program of payload.alternative_programs) {
      expect(program.id).toMatch(/^[a-z_]+$/);
      expect(program.name).toMatch(/[֐-׿]/); // a human-readable Hebrew name
    }
    expect(Object.keys(payload)).not.toContain("email");
  });
});
