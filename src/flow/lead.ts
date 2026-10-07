import { z } from "zod";
import { CAREER_PROJECTS, getCatalogProgram, LEAD_CONSENT_VERSION, V2_PROGRAM_IDS } from "@/data";
import type { ProgramId } from "@/engine";
import { displayName } from "./resultView";
import type { GenericResultView, V2ResultView } from "./v2ResultView";

/**
 * V2 lead capture contract (THI-16 review pass). Pure and shared by the browser form (inline validation) and the
 * server route (the authority). Personal data lives ONLY in this contract: it is sent to the same-origin lead API and
 * forwarded to a server-side webhook, never to analytics, URLs, storage or logs.
 *
 * The result context (kind, primary/alternative programs, projects, journey id) is derived from the deterministic
 * result the candidate saw. The client sends only stable ids and roles; the server re-derives the Hebrew names from
 * the catalog and rejects ids or role combinations that no result can produce.
 */

export type LeadProgramRole = "alternative" | "peer" | "weak_direction";
export type LeadResultKind = "recommended" | "near_tie" | "insufficient_positive_evidence" | "v1_precision_result";

export const LEAD_RESULT_KINDS = [
  "recommended",
  "near_tie",
  "insufficient_positive_evidence",
  "v1_precision_result",
] as const satisfies readonly LeadResultKind[];

export interface LeadResultContext {
  resultKind: LeadResultKind;
  primaryProgramId: ProgramId | null;
  alternatives: Array<{ id: ProgramId; role: LeadProgramRole }>;
}

const NAME_MAX = 50;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’"״׳.\-־]*$/u;

export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function isValidName(raw: string): boolean {
  const value = normalizeName(raw);
  return value.length >= 2 && value.length <= NAME_MAX && NAME_PATTERN.test(value);
}

export interface NormalizedPhone {
  /** Israeli numbers in local form (`0501234567`); other international numbers as E.164. */
  phone: string;
  /** Always E.164 (`+972501234567`). */
  phoneE164: string;
}

function fromIsraeliLocal(digits: string): NormalizedPhone | null {
  if (!/^0(?:5\d{8}|7\d{8}|[2-489]\d{7})$/u.test(digits)) return null;
  return { phone: digits, phoneE164: `+972${digits.slice(1)}` };
}

function fromInternational(digits: string): NormalizedPhone | null {
  if (digits.startsWith("972")) return fromIsraeliLocal(`0${digits.slice(3)}`);
  if (!/^[1-9]\d{7,14}$/u.test(digits)) return null;
  return { phone: `+${digits}`, phoneE164: `+${digits}` };
}

/**
 * Accepts common Israeli formats (05X-XXXXXXX, spaces, hyphens, dots, parentheses, +972, 972, 00972, a stray "(0)")
 * for mobile (05X), VoIP (07X) and landline (02, 03, 04, 08, 09) numbers, and any other international number written
 * with a leading "+" or "00" (8-15 digits). Returns null otherwise. It does not check that the number exists.
 */
export function normalizePhone(raw: string): NormalizedPhone | null {
  const compact = raw
    .normalize("NFKC")
    .replace(/[\s\-.()‎‏‪-‮]/gu, "")
    .replace(/^(\+?972)0/u, "$1");
  if (!/^\+?\d+$/u.test(compact)) return null;
  if (compact.startsWith("+")) return fromInternational(compact.slice(1));
  if (compact.startsWith("00")) return fromInternational(compact.slice(2));
  if (compact.startsWith("972")) return fromInternational(compact);
  return fromIsraeliLocal(compact);
}

export type LeadField = "firstName" | "lastName" | "phone" | "consent";

export interface LeadFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  consent: boolean;
}

/** Client-side field validation: which fields are invalid (empty when the form can be sent). */
export function validateLeadForm(values: LeadFormValues): LeadField[] {
  const invalid: LeadField[] = [];
  if (!isValidName(values.firstName)) invalid.push("firstName");
  if (!isValidName(values.lastName)) invalid.push("lastName");
  if (!normalizePhone(values.phone)) invalid.push("phone");
  if (values.consent !== true) invalid.push("consent");
  return invalid;
}

// ----------------------------------------------------------------------------------------------------------------
// Result context (what the candidate was shown)

type RoleEntry = { id: ProgramId; role: LeadProgramRole };
const withRole = (ids: readonly ProgramId[], role: LeadProgramRole): RoleEntry[] => ids.map((id) => ({ id, role }));

function genericLeadContext(view: GenericResultView): LeadResultContext {
  const { analytics } = view;
  const ids = analytics.alternativeProgramIds;
  switch (view.kind) {
    case "recommended":
      return {
        resultKind: "recommended",
        primaryProgramId: analytics.recommendedProgramId,
        alternatives: withRole(ids, "alternative"),
      };
    case "near_tie":
      // No winner: both shown programs are peers.
      return { resultKind: "near_tie", primaryProgramId: null, alternatives: withRole(ids, "peer") };
    case "insufficient_positive_evidence":
      return {
        resultKind: "insufficient_positive_evidence",
        primaryProgramId: null,
        alternatives: withRole(ids, "weak_direction"),
      };
  }
}

/** Maps a V2 result to the lead's program roles. A near tie has no winner: `primaryProgramId` is null, both are peers. */
export function leadContextFromResult(view: V2ResultView): LeadResultContext {
  if (view.type === "precision") {
    return {
      resultKind: "v1_precision_result",
      primaryProgramId: view.analytics.recommendedProgramId,
      alternatives: withRole(view.analytics.alternativeProgramIds, "alternative"),
    };
  }
  return genericLeadContext(view);
}

// ----------------------------------------------------------------------------------------------------------------
// Request contract (browser -> /api/v2/lead)

const programIdSchema = z.enum(V2_PROGRAM_IDS as [ProgramId, ...ProgramId[]]);
const projectIdSchema = z.enum(CAREER_PROJECTS.map((project) => project.id) as [string, ...string[]]);

export const LeadRequestSchema = z
  .strictObject({
    first_name: z.string().max(200),
    last_name: z.string().max(200),
    phone: z.string().max(60),
    consent: z.literal(true),
    /** Honeypot: a visually hidden field real people never fill in. Must be empty. */
    website: z.string().max(200).optional(),
    comparison_id: z.string().min(1).max(100).nullable(),
    result_kind: z.enum(LEAD_RESULT_KINDS),
    primary_program_id: programIdSchema.nullable(),
    alternative_programs: z
      .array(z.strictObject({ id: programIdSchema, role: z.enum(["alternative", "peer", "weak_direction"]) }))
      .max(3),
    selected_project_ids: z.array(projectIdSchema).min(1).max(2),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    const roles = value.alternative_programs.map((entry) => entry.role);
    const ids = [value.primary_program_id, ...value.alternative_programs.map((entry) => entry.id)].filter(Boolean);
    if (new Set(ids).size !== ids.length) issue("duplicate program");
    if (new Set(value.selected_project_ids).size !== value.selected_project_ids.length) issue("duplicate project");
    const only = (role: LeadProgramRole) => roles.every((candidate) => candidate === role);
    switch (value.result_kind) {
      case "recommended":
      case "v1_precision_result":
        if (!value.primary_program_id) issue("primary program required");
        if (!only("alternative") || roles.length > 1) issue("at most one alternative");
        break;
      case "near_tie":
        if (value.primary_program_id !== null) issue("a near tie has no primary program");
        if (roles.length !== 2 || !only("peer")) issue("a near tie has two peers");
        break;
      case "insufficient_positive_evidence":
        if (value.primary_program_id !== null) issue("no primary program");
        if (roles.length > 1 || !only("weak_direction")) issue("at most one weak direction");
        break;
    }
  });

export type LeadRequest = z.infer<typeof LeadRequestSchema>;

export interface LeadSubmitInput extends LeadFormValues {
  website: string;
  comparisonId: string | null;
  context: LeadResultContext;
  selectedProjectIds: readonly string[];
}

/** The JSON body the browser posts. Values are sent as typed; the server trims, validates and normalises. */
export function buildLeadRequest(input: LeadSubmitInput): Record<string, unknown> {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    consent: input.consent,
    website: input.website,
    comparison_id: input.comparisonId,
    result_kind: input.context.resultKind,
    primary_program_id: input.context.primaryProgramId,
    alternative_programs: input.context.alternatives,
    selected_project_ids: [...input.selectedProjectIds],
  };
}

// ----------------------------------------------------------------------------------------------------------------
// Webhook payload (server -> LEAD_WEBHOOK_URL)

export interface LeadProgramRef {
  id: ProgramId;
  name: string;
}

export interface LeadWebhookPayload {
  first_name: string;
  last_name: string;
  phone: string;
  phone_e164: string;
  consent: true;
  consent_text_version: string;
  flow_version: "v2";
  comparison_id: string | null;
  result_kind: LeadResultKind;
  /** The recommendation; null for a near tie (no winner) and for insufficient positive evidence. */
  primary_program: LeadProgramRef | null;
  alternative_programs: Array<LeadProgramRef & { role: LeadProgramRole }>;
  selected_project_ids: string[];
  submitted_at: string;
}

function programRef(id: ProgramId): LeadProgramRef {
  const program = getCatalogProgram(id);
  if (!program) throw new Error(`Unknown program "${id}"`);
  return {
    id,
    name: displayName({ id, nameHe: program.nameHe, nameEn: program.nameEn, qualifierHe: program.qualifierHe }),
  };
}

/** Builds the webhook body from a request that already passed `LeadRequestSchema` and field validation. */
export function buildLeadWebhookPayload(
  request: LeadRequest,
  phone: NormalizedPhone,
  submittedAt: Date,
): LeadWebhookPayload {
  return {
    first_name: normalizeName(request.first_name),
    last_name: normalizeName(request.last_name),
    phone: phone.phone,
    phone_e164: phone.phoneE164,
    consent: true,
    consent_text_version: LEAD_CONSENT_VERSION,
    flow_version: "v2",
    comparison_id: request.comparison_id,
    result_kind: request.result_kind,
    primary_program: request.primary_program_id ? programRef(request.primary_program_id) : null,
    alternative_programs: request.alternative_programs.map((entry) => ({ ...programRef(entry.id), role: entry.role })),
    selected_project_ids: [...request.selected_project_ids],
    submitted_at: submittedAt.toISOString(),
  };
}
