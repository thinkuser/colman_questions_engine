"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { comparisonReducer, initialComparisonState, type ComparisonAction, type ComparisonState } from "@/flow";

interface ComparisonContextValue {
  state: ComparisonState;
  dispatch: Dispatch<ComparisonAction>;
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null);

/** Thin React binding over the pure flow reducer. No business rules live here. */
export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(comparisonReducer, initialComparisonState);
  return <ComparisonContext.Provider value={{ state, dispatch }}>{children}</ComparisonContext.Provider>;
}

export function useComparison(): ComparisonContextValue {
  const context = useContext(ComparisonContext);
  if (!context) {
    throw new Error("useComparison must be used inside <ComparisonProvider>");
  }
  return context;
}
