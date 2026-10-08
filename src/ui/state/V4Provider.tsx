"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { V4_COPY } from "@/data";
import {
  initialJourneyState,
  journeyReducer,
  restoreV4Journey,
  serializeV4Journey,
  strategyForEntryMode,
  V4_STORAGE_KEY,
  type JourneyAction,
  type JourneyState,
  type V4EntryMode,
  type V4Journey,
} from "@/flow";
import { getV4Tracker, useV4Analytics } from "@/ui/analytics/v4Analytics";
import {
  ExperienceContext,
  type ExperienceDispatch,
  type ExperienceRoute,
  type ExperienceValue,
} from "@/ui/experience/ExperienceContext";
import { V4_PATHS } from "@/ui/routes";
import { v4Allows, v4Target } from "./v4Rules";

/**
 * V4 dual-entry experience (DEC-035): the redesigned UX, where the candidate first chooses HOW to discover (working
 * worlds or brand projects). The entry mode is not evidence: it only selects the discovery strategy (WORLD_STRATEGY or
 * BRAND_STRATEGY); everything downstream is the same engine. Own storage key and analytics trackers, so V2 and V3 are
 * never read, written or cleared from here.
 */

interface Shell {
  entryMode: V4EntryMode | null;
  journey: JourneyState;
  hydrated: boolean;
  introSeen: boolean;
}

type ShellAction =
  | JourneyAction
  | { type: "restored"; restored: V4Journey | null }
  | { type: "intro_seen" }
  | { type: "set_mode"; mode: V4EntryMode };

function shellReducer(shell: Shell, action: ShellAction): Shell {
  const strategy = strategyForEntryMode(shell.entryMode);
  switch (action.type) {
    case "restored": {
      const restored = action.restored ?? { entryMode: shell.entryMode, journey: shell.journey };
      return { ...restored, hydrated: true, introSeen: restored.journey.answers.length > 0 };
    }
    case "intro_seen":
      return { ...shell, introSeen: true };
    case "set_mode":
      // Choosing the same method keeps the journey; changing it starts a fresh journey for the new strategy.
      return shell.entryMode === action.mode
        ? shell
        : { ...shell, entryMode: action.mode, journey: initialJourneyState, introSeen: false };
    case "restart":
      // Restart clears all of V4 (including the chosen method): back to the landing.
      return { ...shell, entryMode: null, journey: initialJourneyState, introSeen: false };
    case "start":
      return { ...shell, journey: journeyReducer(strategy, shell.journey, action), introSeen: false };
    case "record_answer": {
      const journey = journeyReducer(strategy, shell.journey, action);
      return { ...shell, journey, introSeen: shell.introSeen || journey.answers.length > 0 };
    }
    default:
      return { ...shell, journey: journeyReducer(strategy, shell.journey, action) };
  }
}

function load(): V4Journey | null {
  try {
    const raw = window.localStorage.getItem(V4_STORAGE_KEY);
    const restored = restoreV4Journey(raw);
    if (raw !== null && restored === null) window.localStorage.removeItem(V4_STORAGE_KEY);
    return restored;
  } catch {
    return null;
  }
}

function save(value: V4Journey): void {
  try {
    const serialized = serializeV4Journey(value);
    if (serialized === null) window.localStorage.removeItem(V4_STORAGE_KEY);
    else window.localStorage.setItem(V4_STORAGE_KEY, serialized);
  } catch {
    // Best effort; the in-memory journey keeps working.
  }
}

export function V4Provider({ children }: { children: ReactNode }) {
  const [{ entryMode, journey, hydrated, introSeen }, rawDispatch] = useReducer(shellReducer, {
    entryMode: null,
    journey: initialJourneyState,
    hydrated: false,
    introSeen: false,
  });
  const strategy = strategyForEntryMode(entryMode);
  const modeRef = useRef<V4EntryMode | null>(null);
  useEffect(() => {
    modeRef.current = entryMode;
  }, [entryMode]);

  const dispatch = useCallback<ExperienceDispatch>((action, options) => {
    getV4Tracker(modeRef.current)?.enqueue(action, options);
    rawDispatch(action);
  }, []);
  const setMode = useCallback((mode: V4EntryMode) => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    // A new method starts a fresh journey: resync that mode's tracker (emits nothing).
    getV4Tracker(mode)?.hydrate(initialJourneyState, window.location.search);
    rawDispatch({ type: "set_mode", mode });
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
    router.push(V4_PATHS.landing);
  }, [dispatch, router]);

  useEffect(() => {
    const restored = load();
    modeRef.current = restored?.entryMode ?? null;
    getV4Tracker(restored?.entryMode ?? null)?.hydrate(restored?.journey ?? null, window.location.search);
    rawDispatch({ type: "restored", restored });
  }, []);

  useLayoutEffect(() => {
    getV4Tracker(entryMode)?.flush();
  }, [entryMode, journey]);

  useEffect(() => {
    if (hydrated) save({ entryMode, journey });
  }, [entryMode, journey, hydrated]);

  const analytics = useV4Analytics(entryMode);

  const pathFor = useCallback(
    (route: ExperienceRoute): string => {
      if (route === "discover") return entryMode === "projects" ? V4_PATHS.projects : V4_PATHS.worlds;
      return V4_PATHS[route];
    },
    [entryMode],
  );

  const ensureEntryMode = useCallback(
    (mode: V4EntryMode): boolean => {
      if (!hydrated) return false;
      if (entryMode === mode) return true;
      const empty = journey.phase === "selecting" && journey.selectedIds.length === 0 && journey.answers.length === 0;
      if (entryMode === null || empty) {
        setMode(mode);
        return false;
      }
      // A journey in progress belongs to its own method: never switch it silently.
      router.replace(pathFor(v4Target(entryMode, journey, introSeen)));
      return false;
    },
    [hydrated, entryMode, journey, introSeen, setMode, router, pathFor],
  );

  const value = useMemo<ExperienceValue>(
    () => ({
      flowVersion: "v4",
      strategy,
      entryMode,
      state: journey,
      dispatch,
      hydrated,
      introSeen,
      markIntroSeen,
      restartToLanding,
      isLeavingToLanding,
      arrivedAtLanding,
      analytics,
      pathFor,
      target: () => v4Target(entryMode, journey, introSeen),
      allows: v4Allows,
      landingNext: (inProgress) => (inProgress ? v4Target(entryMode, journey, introSeen) : "start"),
      projectsCopy: V4_COPY.projects,
      hasEntryChoice: true,
      ensureEntryMode,
      selectEntryMode: setMode,
    }),
    [
      strategy,
      entryMode,
      journey,
      dispatch,
      hydrated,
      introSeen,
      markIntroSeen,
      restartToLanding,
      isLeavingToLanding,
      arrivedAtLanding,
      analytics,
      pathFor,
      ensureEntryMode,
      setMode,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
