"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from "react";
import { V2_LEAD_COPY, type LeadCopy } from "@/data";
import {
  buildLeadRequest,
  validateLeadForm,
  type LeadField,
  type LeadEntryMode,
  type LeadFlowVersion,
  type LeadResultContext,
} from "@/flow";
import { ViewOnce } from "@/ui/components/ViewOnce";
import { submitLead as defaultSubmitLead, type LeadSubmitResult } from "./submitLead";

export interface LeadFormAnalytics {
  onView: () => void;
  onSubmit: () => void;
  /** Optional (V5 pilot measurement): every press of the submit button, valid or not. Never a field value. */
  onSubmitClick?: () => void;
  onSuccess: () => void;
  onError: (errorType: "validation" | "server" | "network") => void;
}

type Status = "idle" | "submitting" | "success";

const input =
  "block min-h-12 w-full rounded-xl border-2 border-colman-border bg-white px-3 py-2 text-base text-slate-900 " +
  "placeholder:text-slate-400 focus-visible:border-colman-blue focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-colman-blue aria-[invalid=true]:border-red-700";

/**
 * The V2 lead form. Personal data goes ONLY to the same-origin lead API (`submitLead`); the analytics callbacks receive
 * no values at all. The form never claims success unless the server confirmed it, keeps what was typed on any failure,
 * and blocks a second submit while one is in flight. Consent is a real, unchecked-by-default checkbox.
 */
export function LeadForm({
  context,
  selectedProjectIds,
  comparisonId,
  analytics,
  submit = defaultSubmitLead,
  flowVersion = "v2",
  placeholders,
  copy = V2_LEAD_COPY,
  selectedWorldIds,
  entryMode,
}: {
  context: LeadResultContext;
  selectedProjectIds: readonly string[];
  comparisonId: () => string | null;
  analytics: LeadFormAnalytics;
  /** Injectable for tests; defaults to the real same-origin request. */
  submit?: (body: Record<string, unknown>) => Promise<LeadSubmitResult>;
  /** Which UI produced the lead; sent as `flow_version`. V2 is the default. */
  flowVersion?: LeadFlowVersion;
  /** Optional example placeholders (V3). When given, the separate phone hint is not rendered. */
  placeholders?: { firstName: string; lastName: string; phone: string };
  /** Optional copy (V4's gender-inclusive wording). Defaults to the V2 copy; fields, consent and payload are the same. */
  copy?: LeadCopy;
  /** World-led discovery (V3): sent as `selected_world_ids` (and `selected_project_ids` stays empty). */
  selectedWorldIds?: readonly string[];
  /** V4 only: the discovery method used (sent as `entry_mode`). */
  entryMode?: LeadEntryMode;
}) {
  const uid = useId();
  const [values, setValues] = useState({ firstName: "", lastName: "", phone: "", consent: false });
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Set<LeadField>>(new Set());
  const [status, setStatus] = useState<Status>("idle");
  const [sendFailed, setSendFailed] = useState(false);
  const inFlight = useRef(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const id = (name: string) => `${uid}-${name}`;

  const showErrors = (fields: LeadField[]) => {
    setErrors(new Set(fields));
    const order: Array<[LeadField, RefObject<HTMLInputElement | null>]> = [
      ["firstName", firstRef],
      ["lastName", lastRef],
      ["phone", phoneRef],
      ["consent", consentRef],
    ];
    order.find(([field]) => fields.includes(field))?.[1].current?.focus();
  };

  const change = (field: "firstName" | "lastName" | "phone") => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors.has(field)) setErrors((current) => new Set([...current].filter((name) => name !== field)));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || status !== "idle") return;
    setSendFailed(false);

    const invalid = validateLeadForm(values);
    if (invalid.length > 0) {
      showErrors(invalid);
      analytics.onError("validation");
      return;
    }
    setErrors(new Set());

    inFlight.current = true;
    setStatus("submitting");
    analytics.onSubmit();
    const result = await submit(
      buildLeadRequest({
        ...values,
        flowVersion,
        website: honeypot,
        comparisonId: comparisonId(),
        context,
        selectedProjectIds,
        selectedWorldIds,
        entryMode,
      }),
    ).catch((): LeadSubmitResult => ({ ok: false, kind: "network" }));
    inFlight.current = false;

    if (result.ok) {
      setStatus("success");
      analytics.onSuccess();
      // Move focus to the confirmation so assistive technology announces it; the result stays visible.
      requestAnimationFrame(() => successRef.current?.focus());
      return;
    }
    setStatus("idle");
    analytics.onError(result.kind);
    if (result.kind === "validation") showErrors(result.fields);
    else setSendFailed(true);
  }

  const submitting = status === "submitting";
  const fieldError = (field: LeadField) => errors.has(field);

  return (
    <ViewOnce onView={analytics.onView}>
      <section
        aria-labelledby={id("title")}
        data-testid="lead-form"
        className="colman-wash min-w-0 overflow-hidden rounded-2xl border-2 border-colman-border"
      >
        <div className="colman-gradient h-1.5" aria-hidden="true" />
        <div className="space-y-4 p-4 sm:p-5">
          <header className="space-y-1">
            <h2 id={id("title")} className="text-xl leading-snug font-bold text-colman-blue-dark">
              {copy.title}
            </h2>
            <p className="leading-snug text-slate-700">{copy.intro}</p>
          </header>

          {status === "success" ? (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              data-testid="lead-success"
              className="space-y-1 rounded-xl bg-white p-4 outline-none focus-visible:outline-2 focus-visible:outline-colman-blue"
            >
              <p className="text-lg font-bold text-colman-blue-dark">{copy.success.title}</p>
              <p className="text-slate-700">{copy.success.body}</p>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="relative space-y-4" aria-busy={submitting}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor={id("first")} className="block text-sm font-semibold text-slate-800">
                    {copy.fields.firstName}
                  </label>
                  <input
                    ref={firstRef}
                    id={id("first")}
                    name="first_name"
                    type="text"
                    autoComplete="given-name"
                    required
                    maxLength={50}
                    placeholder={placeholders?.firstName}
                    value={values.firstName}
                    onChange={change("firstName")}
                    aria-invalid={fieldError("firstName")}
                    aria-describedby={fieldError("firstName") ? id("first-error") : undefined}
                    className={input}
                  />
                  {fieldError("firstName") && (
                    <p id={id("first-error")} className="text-sm font-medium text-red-700">
                      {copy.errors.firstName}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor={id("last")} className="block text-sm font-semibold text-slate-800">
                    {copy.fields.lastName}
                  </label>
                  <input
                    ref={lastRef}
                    id={id("last")}
                    name="last_name"
                    type="text"
                    autoComplete="family-name"
                    required
                    maxLength={50}
                    placeholder={placeholders?.lastName}
                    value={values.lastName}
                    onChange={change("lastName")}
                    aria-invalid={fieldError("lastName")}
                    aria-describedby={fieldError("lastName") ? id("last-error") : undefined}
                    className={input}
                  />
                  {fieldError("lastName") && (
                    <p id={id("last-error")} className="text-sm font-medium text-red-700">
                      {copy.errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor={id("phone")} className="block text-sm font-semibold text-slate-800">
                  {copy.fields.phone}
                </label>
                <input
                  ref={phoneRef}
                  id={id("phone")}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={30}
                  dir="ltr"
                  placeholder={placeholders?.phone}
                  value={values.phone}
                  onChange={change("phone")}
                  aria-invalid={fieldError("phone")}
                  aria-describedby={
                    [placeholders ? null : id("phone-hint"), fieldError("phone") ? id("phone-error") : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={`${input} text-right`}
                />
                {!placeholders && (
                  <p id={id("phone-hint")} className="text-sm text-slate-600">
                    {copy.phoneHint}
                  </p>
                )}
                {fieldError("phone") && (
                  <p id={id("phone-error")} className="text-sm font-medium text-red-700">
                    {copy.errors.phone}
                  </p>
                )}
              </div>

              {/* Honeypot: invisible to people and assistive technology; a filled value makes the server reject. */}
              <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor={id("website")}>Website</label>
                <input
                  id={id("website")}
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                  data-testid="lead-honeypot"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={id("consent")}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-white/70 p-3"
                >
                  <input
                    ref={consentRef}
                    id={id("consent")}
                    name="consent"
                    type="checkbox"
                    checked={values.consent}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, consent: event.target.checked }));
                      if (event.target.checked)
                        setErrors((current) => new Set([...current].filter((n) => n !== "consent")));
                    }}
                    aria-invalid={fieldError("consent")}
                    aria-describedby={fieldError("consent") ? id("consent-error") : undefined}
                    className="mt-1 size-6 shrink-0 cursor-pointer accent-colman-blue"
                  />
                  <span className="text-sm leading-snug text-slate-800">{copy.consent}</span>
                </label>
                {fieldError("consent") && (
                  <p id={id("consent-error")} className="text-sm font-medium text-red-700">
                    {copy.errors.consent}
                  </p>
                )}
              </div>

              {errors.size > 0 && (
                <p role="alert" className="text-sm font-semibold text-red-700">
                  {copy.errors.summary}
                </p>
              )}
              {sendFailed && (
                <p role="alert" data-testid="lead-error" className="rounded-xl bg-red-50 p-3 font-medium text-red-800">
                  {copy.errors.send}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                onClick={() => analytics.onSubmitClick?.()}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-colman-blue px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-colman-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? copy.submitting : copy.submit}
              </button>
            </form>
          )}
        </div>
      </section>
    </ViewOnce>
  );
}
