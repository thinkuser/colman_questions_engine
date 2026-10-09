"use client";

import { useEffect, useRef, useState } from "react";
import {
  hasSubmittedResultFeedback,
  rememberResultFeedback,
  type FeedbackFit,
  type FeedbackHelpfulness,
  type ResultFeedbackAnswers,
  type UiClickParams,
} from "@/analytics";
import type { ResultFeedbackCopy } from "@/data";
import type { V3ResultKind } from "@/flow";

/**
 * V5 pilot result feedback (DEC-038). Compact and optional: it never gates the result, the program links, the contact
 * buttons or the lead form. Structured choices only (no free text). Pure presentation + analytics: nothing here
 * reaches the engine, the journey, routing or ranking.
 *
 * - Recommended / near tie: "does the direction fit?" + "did it help narrow the options?".
 * - Insufficient positive evidence: no recommendation to judge, so only the helpfulness question (process wording).
 * One submission per result STATE (`resultKey`): remembered under its own storage key, so a refresh shows "thanks"
 * instead of the form; a new result after Back + different answers gets a new key and a fresh form.
 */

function storageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function Choices<T extends string>({
  name,
  legend,
  options,
  value,
  onChoose,
}: {
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChoose: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2" data-feedback-question={name}>
      <legend className="mb-2 text-base leading-snug font-semibold text-colman-blue-dark">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const pressed = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              data-feedback-value={option.value}
              onClick={() => onChoose(option.value)}
              className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue ${
                pressed
                  ? "border-colman-blue bg-colman-blue text-white"
                  : "border-colman-border bg-white text-colman-blue-dark hover:border-colman-blue"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ResultFeedback({
  kind,
  resultKey,
  copy,
  onView,
  onSubmit,
  onUiClick,
}: {
  kind: V3ResultKind;
  resultKey: string;
  copy: ResultFeedbackCopy;
  onView: () => void;
  /** Persists the feedback; resolves true only when the server confirmed it (DEC-039). */
  onSubmit: (answers: ResultFeedbackAnswers) => Promise<boolean>;
  onUiClick?: (params: UiClickParams) => void;
}) {
  const asksFit = kind !== "insufficient_positive_evidence";
  const [fit, setFit] = useState<FeedbackFit | null>(null);
  const [helpfulness, setHelpfulness] = useState<FeedbackHelpfulness | null>(null);
  const [submitted, setSubmitted] = useState(() => hasSubmittedResultFeedback(storageOrNull(), resultKey));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const ref = useRef<HTMLElement>(null);

  // Reported when the block is actually exposed (half visible), like the other result-view events.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onView();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onView]);

  const canSubmit = (asksFit && fit !== null) || helpfulness !== null;

  async function submit() {
    if (!canSubmit || submitted || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    // The attempt is always reported (ui_click). The semantic result_feedback_submit and the local "submitted" memory
    // happen only after the server confirmed persistence; a failure keeps the choices and allows a retry.
    onUiClick?.({ element_id: "feedback_submit", element_type: "button", screen_id: "feedback" });
    let saved = false;
    try {
      saved = await onSubmit({ ...(asksFit && fit ? { fit } : {}), ...(helpfulness ? { helpfulness } : {}) });
    } catch {
      saved = false;
    }
    inFlight.current = false;
    setSaving(false);
    if (saved) {
      rememberResultFeedback(storageOrNull(), resultKey);
      setSubmitted(true);
    } else {
      setFailed(true);
    }
  }

  return (
    <section
      ref={ref}
      aria-label={copy.title}
      data-testid="result-feedback"
      data-feedback-kind={asksFit ? "fit_and_helpfulness" : "helpfulness_only"}
      className="min-w-0 space-y-4 rounded-2xl border border-colman-border bg-white p-4"
    >
      {submitted ? (
        <p className="font-semibold text-colman-blue-dark" role="status" data-testid="result-feedback-thanks">
          {copy.thanks}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-colman-blue-dark">{copy.title}</h2>
            <p className="text-sm text-slate-600">{copy.note}</p>
          </div>
          {asksFit && (
            <Choices
              name="fit"
              legend={copy.fit.question}
              options={copy.fit.options}
              value={fit}
              onChoose={(value) => {
                onUiClick?.({
                  element_id: "feedback_fit_option",
                  element_type: "button",
                  screen_id: "feedback",
                  feedback_fit: value,
                });
                setFit(value);
              }}
            />
          )}
          <Choices
            name="helpfulness"
            legend={asksFit ? copy.helpfulness.question : copy.helpfulness.insufficientQuestion}
            options={copy.helpfulness.options}
            value={helpfulness}
            onChoose={(value) => {
              onUiClick?.({
                element_id: "feedback_helpfulness_option",
                element_type: "button",
                screen_id: "feedback",
                feedback_helpfulness: value,
              });
              setHelpfulness(value);
            }}
          />
          <button
            type="button"
            data-testid="result-feedback-submit"
            disabled={!canSubmit || saving}
            aria-busy={saving}
            onClick={submit}
            className="min-h-11 rounded-xl border-2 border-colman-blue px-5 font-semibold text-colman-blue transition-colors hover:bg-colman-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? copy.submitting : copy.submit}
          </button>
          {failed && (
            <p role="alert" data-testid="result-feedback-error" className="text-sm font-medium text-red-800">
              {copy.error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
