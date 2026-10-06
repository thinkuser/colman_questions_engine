"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useReducer, type ReactNode } from "react";
import type { DispatchOptions } from "@/analytics";
import { comparisonReducer, initialComparisonState, type ComparisonAction, type ComparisonState } from "@/flow";
import { getBrowserTracker } from "@/ui/analytics/browserTracker";
import { loadStoredComparison, saveStoredComparison } from "./storage";

/** Dispatch plus optional analytics options (`silent`: programmatic changes that are not candidate actions). */
export type TrackedDispatch = (action: ComparisonAction, options?: DispatchOptions) => void;

interface ComparisonContextValue {
  state: ComparisonState;
  dispatch: TrackedDispatch;
  /** False until the durable state has been restored on the client. Guards and steps wait for it. */
  hydrated: boolean;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

/** The flow state plus whether persisted state has been restored yet; both change in one atomic update. */
interface Shell {
  state: ComparisonState;
  hydrated: boolean;
}

type ShellAction = ComparisonAction | { type: "restored"; restored: ComparisonState | null };

function shellReducer(shell: Shell, action: ShellAction): Shell {
  if (action.type === "restored") {
    return { state: action.restored ?? shell.state, hydrated: true };
  }
  return { ...shell, state: comparisonReducer(shell.state, action) };
}

/**
 * Thin React binding over the pure flow reducer. No business rules live here.
 * On mount it restores the durable state (selection + answers) and from then on keeps it saved.
 */
export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [{ state, hydrated }, rawDispatch] = useReducer(shellReducer, {
    state: initialComparisonState,
    hydrated: false,
  });

  // Analytics observes: the action is recorded for replay, then applied by the unchanged product reducer.
  const dispatch = useCallback<TrackedDispatch>((action, options) => {
    getBrowserTracker()?.enqueue(action, options);
    rawDispatch(action);
  }, []);

  useEffect(() => {
    const restored = loadStoredComparison();
    // Restoring after a refresh is not a candidate action: analytics is initialised silently.
    getBrowserTracker()?.hydrate(restored, window.location.search);
    rawDispatch({ type: "restored", restored });
  }, []);

  // Layout effects run before any passive effect, so events caused by an action (answer, completion) are emitted
  // before the events of the screen it leads to (question_view).
  useLayoutEffect(() => {
    getBrowserTracker()?.flush();
  }, [state]);

  useEffect(() => {
    if (hydrated) {
      saveStoredComparison(state);
    }
  }, [state, hydrated]);

  return <ComparisonContext.Provider value={{ state, dispatch, hydrated }}>{children}</ComparisonContext.Provider>;
}

export function useComparison(): ComparisonContextValue {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error("useComparison must be used inside <ComparisonProvider>");
  }
  return context;
}
