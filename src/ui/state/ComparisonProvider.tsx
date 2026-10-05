"use client";

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { comparisonReducer, initialComparisonState, type ComparisonAction, type ComparisonState } from "@/flow";
import { loadStoredComparison, saveStoredComparison } from "./storage";

interface ComparisonContextValue {
  state: ComparisonState;
  dispatch: Dispatch<ComparisonAction>;
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
  const [{ state, hydrated }, dispatch] = useReducer(shellReducer, { state: initialComparisonState, hydrated: false });

  useEffect(() => {
    dispatch({ type: "restored", restored: loadStoredComparison() });
  }, []);

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
