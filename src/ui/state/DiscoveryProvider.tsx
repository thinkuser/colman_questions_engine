"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useReducer, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DiscoveryDispatchOptions } from "@/analytics";
import {
  canAccessDiscoveryRoute,
  discoveryReducer,
  discoveryRoute,
  initialDiscoveryState,
  type DiscoveryAction,
  type DiscoveryRoute,
  type DiscoveryState,
} from "@/flow";
import { getDiscoveryTracker } from "@/ui/analytics/discoveryBrowserTracker";
import { V2_PATHS } from "@/ui/routes";
import { loadStoredDiscovery, saveStoredDiscovery } from "./discoveryStorage";

export type DiscoveryDispatch = (action: DiscoveryAction, options?: DiscoveryDispatchOptions) => void;

interface DiscoveryContextValue {
  state: DiscoveryState;
  dispatch: DiscoveryDispatch;
  /** False until the durable journey has been restored on the client. Guards and steps wait for it. */
  hydrated: boolean;
}

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

interface Shell {
  state: DiscoveryState;
  hydrated: boolean;
}

type ShellAction = DiscoveryAction | { type: "restored"; restored: DiscoveryState | null };

function shellReducer(shell: Shell, action: ShellAction): Shell {
  if (action.type === "restored") return { state: action.restored ?? shell.state, hydrated: true };
  return { ...shell, state: discoveryReducer(shell.state, action) };
}

/**
 * Thin React binding over the pure V2 journey reducer. No business rules live here. On mount it restores the durable
 * journey (projects + answers) and from then on keeps it saved. Analytics observes: actions are recorded for replay,
 * then applied by the unchanged product reducer.
 */
export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const [{ state, hydrated }, rawDispatch] = useReducer(shellReducer, {
    state: initialDiscoveryState,
    hydrated: false,
  });

  const dispatch = useCallback<DiscoveryDispatch>((action, options) => {
    getDiscoveryTracker()?.enqueue(action, options);
    rawDispatch(action);
  }, []);

  useEffect(() => {
    const restored = loadStoredDiscovery();
    getDiscoveryTracker()?.hydrate(restored, window.location.search);
    rawDispatch({ type: "restored", restored });
  }, []);

  // Layout effects run before passive effects, so events caused by an action are emitted before the next screen's.
  useLayoutEffect(() => {
    getDiscoveryTracker()?.flush();
  }, [state]);

  useEffect(() => {
    if (hydrated) saveStoredDiscovery(state);
  }, [state, hydrated]);

  return <DiscoveryContext.Provider value={{ state, dispatch, hydrated }}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryContextValue {
  const context = useContext(DiscoveryContext);
  if (!context) throw new Error("useDiscovery must be used inside <DiscoveryProvider>");
  return context;
}

/**
 * Keeps the URL in sync with the journey: if this route is not reachable, redirect to the one the state allows (a deep
 * link to /v2/result without a finished journey goes to /v2). Waits for restoration first, so a refresh on a question is
 * not bounced. Returns true only when the route may be rendered.
 */
export function useDiscoveryGuard(route: DiscoveryRoute): boolean {
  const { state, hydrated } = useDiscovery();
  const router = useRouter();
  const allowed = canAccessDiscoveryRoute(state, route);
  const target = V2_PATHS[discoveryRoute(state)];
  useEffect(() => {
    if (hydrated && !allowed) router.replace(target);
  }, [hydrated, allowed, router, target]);
  return hydrated && allowed;
}
