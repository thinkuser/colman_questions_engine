"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { V2_LEAD_COPY, V3_COPY } from "@/data";
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
import { getV3Tracker, useV3Analytics } from "@/ui/analytics/v3Analytics";
import {
  ExperienceContext,
  useExperience,
  useExperienceGuard,
  type ExperienceDispatch,
  type ExperienceValue,
} from "@/ui/experience/ExperienceContext";
import { V3_PATHS, type V3Route } from "@/ui/routes";
import { V3_STRATEGY } from "@/ui/v3/config";

/**
 * Thin React binding over the pure, strategy-driven journey reducer, with its own storage key and analytics tracker,
 * so V3 and V2 never share or overwrite each other's state. No business rules live here. The transition screen is a
 * pure UI step: `introSeen` is in memory only (a refresh before the first answer simply shows it again).
 * It supplies the shared experience context (V3: world-led, fixed strategy, V3 routes and analytics).
 */

export type V3Dispatch = ExperienceDispatch;

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
/** V3 renders shared content as is. */
const identity = (text: string) => text;

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

  const analytics = useV3Analytics();
  const value = useMemo<ExperienceValue>(
    () => ({
      flowVersion: "v3",
      strategy,
      entryMode: "worlds",
      state,
      dispatch,
      hydrated,
      introSeen,
      markIntroSeen,
      restartToLanding,
      isLeavingToLanding,
      arrivedAtLanding,
      analytics,
      pathFor: (route) => (route === "start" ? V3_PATHS.landing : V3_PATHS[route]),
      target: () => v3Target(strategy, state, introSeen),
      // Unchanged V3 rule: the discovery screen is always reachable from the landing.
      allows: (route, target) => route === target || (route === "discover" && target === "landing"),
      landingNext: () => {
        const target = v3Target(strategy, state, introSeen);
        return target === "landing" ? "discover" : target;
      },
      projectsCopy: { headline: V3_COPY.discovery.headline, support: V3_COPY.discovery.support },
      hasEntryChoice: false,
      ui: V3_COPY,
      t: identity,
      leadCopy: V2_LEAD_COPY,
      ensureEntryMode: () => true,
      selectEntryMode: () => {},
    }),
    [
      strategy,
      state,
      dispatch,
      hydrated,
      introSeen,
      markIntroSeen,
      restartToLanding,
      isLeavingToLanding,
      arrivedAtLanding,
      analytics,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

/** V3's hook name, kept for the existing imports: the shared experience context. */
export const useV3 = useExperience;

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
 * (The rule itself is the `allows` / `target` pair the provider supplies.)
 */
export const useV3Guard = useExperienceGuard;
