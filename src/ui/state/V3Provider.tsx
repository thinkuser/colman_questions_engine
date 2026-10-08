"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  discoveryReducer,
  discoveryRoute,
  initialDiscoveryState,
  restoreV3Journey,
  serializeV3Journey,
  V3_STORAGE_KEY,
  type DiscoveryAction,
  type DiscoveryState,
} from "@/flow";
import { getV3Tracker } from "@/ui/analytics/v3Analytics";
import { V3_PATHS, type V3Route } from "@/ui/routes";

/**
 * Thin React binding over the SAME pure journey reducer V2 uses, with its own storage key and analytics tracker, so
 * V3 and V2 never share or overwrite each other's state. No business rules live here. The transition screen is a
 * pure UI step: `introSeen` is in-memory only (a refresh before the first answer simply shows it again).
 */

export type V3Dispatch = (action: DiscoveryAction, options?: { silent?: boolean }) => void;

interface V3ContextValue {
  state: DiscoveryState;
  dispatch: V3Dispatch;
  hydrated: boolean;
  introSeen: boolean;
  markIntroSeen: () => void;
  /** Restart the journey and go to the landing page (the guard must not bounce the URL to the projects screen). */
  restartToLanding: () => void;
  /** True while an intentional navigation to the landing is in flight (the guards stand down). */
  isLeavingToLanding: () => boolean;
  /** Called by the landing page once it is shown: the guards apply again. */
  arrivedAtLanding: () => void;
}

const V3Context = createContext<V3ContextValue | null>(null);

interface Shell {
  state: DiscoveryState;
  hydrated: boolean;
  introSeen: boolean;
}

type ShellAction = DiscoveryAction | { type: "restored"; restored: DiscoveryState | null } | { type: "intro_seen" };

function shellReducer(shell: Shell, action: ShellAction): Shell {
  switch (action.type) {
    case "restored": {
      const state = action.restored ?? shell.state;
      // A journey that already has answers has seen the intro; only a brand-new start shows it.
      return { ...shell, state, hydrated: true, introSeen: state.answers.length > 0 };
    }
    case "intro_seen":
      return { ...shell, introSeen: true };
    case "start":
    case "restart":
      return { ...shell, state: discoveryReducer(shell.state, action), introSeen: false };
    case "record_answer": {
      const state = discoveryReducer(shell.state, action);
      return { ...shell, state, introSeen: shell.introSeen || state.answers.length > 0 };
    }
    default:
      return { ...shell, state: discoveryReducer(shell.state, action) };
  }
}

function load(): DiscoveryState | null {
  try {
    const raw = window.localStorage.getItem(V3_STORAGE_KEY);
    const restored = restoreV3Journey(raw);
    if (raw !== null && restored === null) window.localStorage.removeItem(V3_STORAGE_KEY);
    return restored;
  } catch {
    return null;
  }
}

function save(state: DiscoveryState): void {
  try {
    const serialized = serializeV3Journey(state);
    if (serialized === null) window.localStorage.removeItem(V3_STORAGE_KEY);
    else window.localStorage.setItem(V3_STORAGE_KEY, serialized);
  } catch {
    // Best effort; the in-memory journey keeps working.
  }
}

export function V3Provider({ children }: { children: ReactNode }) {
  const [{ state, hydrated, introSeen }, rawDispatch] = useReducer(shellReducer, {
    state: initialDiscoveryState,
    hydrated: false,
    introSeen: false,
  });

  const dispatch = useCallback<V3Dispatch>((action, options) => {
    getV3Tracker()?.enqueue(action, options);
    rawDispatch(action);
  }, []);
  const markIntroSeen = useCallback(() => rawDispatch({ type: "intro_seen" }), []);
  const router = useRouter();
  const leavingToLanding = useRef(false);
  const isLeavingToLanding = useCallback(() => leavingToLanding.current, []);
  const arrivedAtLanding = useCallback(() => {
    leavingToLanding.current = false;
  }, []);
  const restartToLanding = useCallback(() => {
    leavingToLanding.current = true;
    dispatch({ type: "restart" });
    router.push(V3_PATHS.landing);
  }, [dispatch, router]);

  useEffect(() => {
    const restored = load();
    getV3Tracker()?.hydrate(restored, window.location.search);
    rawDispatch({ type: "restored", restored });
  }, []);

  useLayoutEffect(() => {
    getV3Tracker()?.flush();
  }, [state]);

  useEffect(() => {
    if (hydrated) save(state);
  }, [state, hydrated]);

  return (
    <V3Context.Provider
      value={{
        state,
        dispatch,
        hydrated,
        introSeen,
        markIntroSeen,
        restartToLanding,
        isLeavingToLanding,
        arrivedAtLanding,
      }}
    >
      {children}
    </V3Context.Provider>
  );
}

export function useV3(): V3ContextValue {
  const context = useContext(V3Context);
  if (!context) throw new Error("useV3 must be used inside <V3Provider>");
  return context;
}

/** The V3 screen this state belongs on (landing is never a target: it is a choice, not a state). */
export function v3Target(state: DiscoveryState, introSeen: boolean): Exclude<V3Route, "landing"> {
  const base = discoveryRoute(state);
  if (base === "select") return "projects";
  if (base === "result") return "result";
  return state.answers.length === 0 && !introSeen ? "ready" : "questions";
}

/** Redirects to the screen the journey allows (a deep link without state goes to the start). True when renderable. */
export function useV3Guard(route: Exclude<V3Route, "landing">): boolean {
  const { state, hydrated, introSeen, isLeavingToLanding } = useV3();
  const router = useRouter();
  const target = v3Target(state, introSeen);
  const allowed = route === target;
  useEffect(() => {
    if (hydrated && !allowed && !isLeavingToLanding()) router.replace(V3_PATHS[target]);
  }, [hydrated, allowed, router, target, isLeavingToLanding]);
  return hydrated && allowed;
}
