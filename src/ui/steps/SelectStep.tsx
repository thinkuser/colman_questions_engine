"use client";

import { useRouter } from "next/navigation";
import { PILOT_PROGRAMS } from "@/data";
import { canStartQuestions, MAX_SELECTED_PROGRAMS } from "@/flow";
import { ProgramName } from "@/ui/components/ProgramName";
import { StepIndicator } from "@/ui/components/StepIndicator";
import { copy } from "@/ui/copy.he";
import { STEP_PATHS } from "@/ui/routes";
import { useComparison } from "@/ui/state/ComparisonProvider";

export function SelectStep() {
  const { state, dispatch, hydrated } = useComparison();
  const router = useRouter();
  const selectedCount = state.selectedProgramIds.length;

  if (!hydrated) {
    return null;
  }

  function handleStart() {
    dispatch({ type: "start_questions" });
    router.push(STEP_PATHS.questions);
  }

  return (
    <section className="space-y-6">
      <StepIndicator current="select" />
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{copy.select.heading}</h1>
        <p className="text-slate-600">{copy.select.instructions}</p>
      </header>

      <fieldset className="space-y-3">
        <legend className="sr-only">{copy.select.instructions}</legend>
        {PILOT_PROGRAMS.map((program) => {
          const checked = state.selectedProgramIds.includes(program.id);
          const disabled = !checked && selectedCount >= MAX_SELECTED_PROGRAMS;
          return (
            <label
              key={program.id}
              data-program-id={program.id}
              className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition-colors ${
                checked ? "border-brand bg-brand/5" : "border-slate-200 bg-white"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                className="size-6 shrink-0 accent-brand"
                checked={checked}
                disabled={disabled}
                onChange={() => dispatch({ type: "toggle_program", programId: program.id })}
              />
              <ProgramName program={program} className="min-w-0 flex-1 text-lg font-semibold" />
              {checked && (
                <span className="shrink-0 text-sm font-semibold text-brand">{copy.select.selectedLabel}</span>
              )}
            </label>
          );
        })}
      </fieldset>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-600" aria-live="polite">
          {copy.select.selectedCount(selectedCount, MAX_SELECTED_PROGRAMS)}
        </span>
        <button
          type="button"
          className="min-h-12 rounded-xl bg-brand px-6 py-3 font-semibold text-white disabled:opacity-40"
          disabled={!canStartQuestions(state)}
          onClick={handleStart}
        >
          {copy.select.start}
        </button>
      </div>
    </section>
  );
}
