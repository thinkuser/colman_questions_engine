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
  initialJourneyState,
  journeyReducer,
  journeyRoute,
  restoreV3Journey,
  serializeV3Journey,
  V3_STORAGE_KEY,
  type DiscoveryStrategy,
  type JourneyAction,
  type JourneyState,
} from "@/flow";
import { getV3Tracker } from "@/ui/analytics/v3Analytics";
import { V3_PATHS, type V3Route } from "@/ui/routes";
import { V3_STRATEGY } from "@/ui/v3/config";

/**
 * Thin React binding over the pure, strategy-driven journey reducer, with its own storage key and analytics tracker,
 * so V3 and V2 never share or overwrite each other's state. No business rules live here. The transition screen is a
 * pure UI step: `introSeen` is in memory only (a refresh before the first answer simply shows it again).
 */

export type V3Dispatch = (action: JourneyAction, options?: { silent?: boolean }) => void;

interface V3ContextValue {
  strategy: DiscoveryStrategy;
  state: JourneyState;
  dispatch: V3Dispatch;
  hydrated: boolean;
  introSeen: boolean;
  markIntroSeen: () => void;
  /** Restart the journey and go to the landing page (the guard must not bounce the URL elsewhere). */
  restartToLanding: () => void;
  /** True while an intentional navigation to the landing is in flight (the guards stand down). */
  isLeavingToLanding: () => boolean;
  /** Called by the landing page once it is shown: the guards apply again. */
  arrivedAtLanding: () => void;
}

const V3Context = createContext<V3ContextValue | null>(null);

interface Shell {
  state: JourneyState;
  hydrated: boolean;
  introSeen: boolean;
}

type ShellAction = JourneyAction | { type: "restored"; restored: JourneyState | null } | { type: "intro_seen" };

function createShellReducer(strategy: DiscoveryStrategy) {
  return (shell: Shell, action: ShellAction): Shell => {
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
        return { ...shell, state: journeyReducer(strategy, shell.state, action), introSeen: false };
      case "record_answer": {
        const state = journeyReducer(strategy, shell.state, action);
        return { ...shell, state, introSeen: shell.introSeen || state.answers.length > 0 };
      }
      default:
        return { ...shell, state: journeyReducer(strategy, shell.state, action) };
    }
  };
}

const shellReducer = createShellReducer(V3_STRATEGY);

function load(strategy: DiscoveryStrategy): JourneyState | null {
  try {
    const raw = window.localStorage.getItem(V3_STORAGE_KEY);
    const restored = restoreV3Journey(strategy, raw);
    // Anything that does not restore (an old version-1 brand payload, another strategy, a stale answer) is cleared.
    if (raw !== null && restored === null) window.localStorage.removeItem(V3_STORAGE_KEY);
    return restored;
  } catch {
    return null;
  }
}

function save(strategy: DiscoveryStrategy, state: JourneyState): void {
  try {
    const serialized = serializeV3Journey(strategy, state);
    if (serialized === null) window.localStorage.removeItem(V3_STORAGE_KEY);
    else window.localStorage.setItem(V3_STORAGE_KEY, serialized);
  } catch {
    // Best effort; the in-memory journey keeps working.
  }
}

export function V3Provider({ children }: { children: ReactNode }) {
  const strategy = V3_STRATEGY;
  const [{ state, hydrated, introSeen }, rawDispatch] = useReducer(shellReducer, {
    state: initialJourneyState,
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
    const restored = load(strategy);
    getV3Tracker()?.hydrate(restored, window.location.search);
    rawDispatch({ type: "restored", restored });
  }, [strategy]);

  useLayoutEffect(() => {
    getV3Tracker()?.flush();
  }, [state]);

  useEffect(() => {
    if (hydrated) save(strategy, state);
  }, [strategy, state, hydrated]);

  return (
    <V3Context.Provider
      value={{
        strategy,
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

/** The V3 screen this state belongs on. A journey with nothing chosen yet belongs on the landing page. */
export function v3Target(strategy: DiscoveryStrategy, state: JourneyState, introSeen: boolean): V3Route {
  const base = journeyRoute(strategy, state);
  if (base === "select") return state.selectedIds.length === 0 && state.phase === "selecting" ? "landing" : "discover";
  if (base === "result") return "result";
  return state.answers.length === 0 && !introSeen ? "ready" : "questions";
}

/**
 * Redirects to the screen the journey allows. The discovery screen is always reachable from the landing (an empty
 * selection is a valid place to be); any other deep link without a journey goes to the landing. True when renderable.
 */
export function useV3Guard(route: Exclude<V3Route, "landing">): boolean {
  const { strategy, state, hydrated, introSeen, isLeavingToLanding } = useV3();
  const router = useRouter();
  const target = v3Target(strategy, state, introSeen);
  const allowed = route === target || (route === "discover" && target === "landing");
  useEffect(() => {
    if (hydrated && !allowed && !isLeavingToLanding()) router.replace(V3_PATHS[target]);
  }, [hydrated, allowed, router, target, isLeavingToLanding]);
  return hydrated && allowed;
}
