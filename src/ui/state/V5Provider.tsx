"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { withStudyMatchOutboundUtm } from "@/analytics";
import { V5_COPY, V5_FEEDBACK_COPY, V5_LEAD_COPY, V5_UI_COPY, v5Text } from "@/data";
import {
  initialJourneyState,
  journeyReducer,
  restoreV5Journey,
  serializeV5Journey,
  strategyForV5EntryMode,
  V5_STORAGE_KEY,
  type JourneyAction,
  type JourneyState,
  type V5EntryMode,
  type V5Journey,
} from "@/flow";
import { getV5Tracker, rememberV5EntrySearch, useV5Analytics, v5EntrySearch } from "@/ui/analytics/v5Analytics";
import {
  ExperienceContext,
  type ExperienceDispatch,
  type ExperienceRoute,
  type ExperienceValue,
} from "@/ui/experience/ExperienceContext";
import { V5_PATHS } from "@/ui/routes";
import { v5Allows, v5Target } from "./v5Rules";

/**
 * V5 dual-entry experience with balanced project-led discovery (DEC-037). The same host as V4 (the redesigned screens,
 * the method screen, the same back/restart/direct-URL rules), with V5's own strategies, storage key, analytics trackers
 * and routes: worlds -> WORLD_STRATEGY (identical to V4 worlds), projects -> PROJECT_STRATEGY (the ten V5 projects,
 * never V2's BRAND_STRATEGY). The entry mode is not evidence. V2, V3 and V4 are never read, written or cleared from
 * here. Copy: V4's gender-inclusive layer (DEC-036) plus V5's own inclusive project content.
 */

interface Shell {
  entryMode: V5EntryMode | null;
  journey: JourneyState;
  hydrated: boolean;
  introSeen: boolean;
}

type ShellAction =
  | JourneyAction
  | { type: "restored"; restored: V5Journey | null }
  | { type: "intro_seen" }
  | { type: "set_mode"; mode: V5EntryMode };

function shellReducer(shell: Shell, action: ShellAction): Shell {
  const strategy = strategyForV5EntryMode(shell.entryMode);
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
      // Restart clears all of V5 (including the chosen method): back to the landing.
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

function load(): V5Journey | null {
  try {
    const raw = window.localStorage.getItem(V5_STORAGE_KEY);
    const restored = restoreV5Journey(raw);
    if (raw !== null && restored === null) window.localStorage.removeItem(V5_STORAGE_KEY);
    return restored;
  } catch {
    return null;
  }
}

function save(value: V5Journey): void {
  try {
    const serialized = serializeV5Journey(value);
    if (serialized === null) window.localStorage.removeItem(V5_STORAGE_KEY);
    else window.localStorage.setItem(V5_STORAGE_KEY, serialized);
  } catch {
    // Best effort; the in-memory journey keeps working.
  }
}

export function V5Provider({ children }: { children: ReactNode }) {
  const [{ entryMode, journey, hydrated, introSeen }, rawDispatch] = useReducer(shellReducer, {
    entryMode: null,
    journey: initialJourneyState,
    hydrated: false,
    introSeen: false,
  });
  const strategy = strategyForV5EntryMode(entryMode);
  const modeRef = useRef<V5EntryMode | null>(null);
  useEffect(() => {
    modeRef.current = entryMode;
  }, [entryMode]);

  const dispatch = useCallback<ExperienceDispatch>((action, options) => {
    getV5Tracker(modeRef.current)?.enqueue(action, options);
    rawDispatch(action);
  }, []);
  const setMode = useCallback((mode: V5EntryMode) => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    // A new method starts a fresh journey: resync that mode's tracker (emits nothing).
    getV5Tracker(mode)?.hydrate(initialJourneyState, v5EntrySearch(window.location.search));
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
    router.push(V5_PATHS.landing);
  }, [dispatch, router]);

  useEffect(() => {
    const restored = load();
    modeRef.current = restored?.entryMode ?? null;
    // Inbound UTMs of the entry page are kept for the whole visit (the method screen's URL has no query).
    rememberV5EntrySearch(window.location.search);
    getV5Tracker(restored?.entryMode ?? null)?.hydrate(
      restored?.journey ?? null,
      v5EntrySearch(window.location.search),
    );
    rawDispatch({ type: "restored", restored });
  }, []);

  useLayoutEffect(() => {
    getV5Tracker(entryMode)?.flush();
  }, [entryMode, journey]);

  useEffect(() => {
    if (hydrated) save({ entryMode, journey });
  }, [entryMode, journey, hydrated]);

  const analytics = useV5Analytics(entryMode);

  const pathFor = useCallback(
    (route: ExperienceRoute): string => {
      if (route === "discover") return entryMode === "projects" ? V5_PATHS.projects : V5_PATHS.worlds;
      return V5_PATHS[route];
    },
    [entryMode],
  );

  const discoverPathFor = useCallback(
    (mode: V5EntryMode): string => (mode === "projects" ? V5_PATHS.projects : V5_PATHS.worlds),
    [],
  );

  const ensureEntryMode = useCallback(
    (mode: V5EntryMode): boolean => {
      if (!hydrated) return false;
      if (entryMode === mode) return true;
      const empty = journey.phase === "selecting" && journey.selectedIds.length === 0 && journey.answers.length === 0;
      if (entryMode === null || empty) {
        setMode(mode);
        return false;
      }
      // A journey in progress belongs to its own method: never switch it silently.
      router.replace(pathFor(v5Target(entryMode, journey, introSeen)));
      return false;
    },
    [hydrated, entryMode, journey, introSeen, setMode, router, pathFor],
  );

  const value = useMemo<ExperienceValue>(
    () => ({
      flowVersion: "v5",
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
      target: () => v5Target(entryMode, journey, introSeen),
      allows: v5Allows,
      landingNext: (inProgress) => (inProgress ? v5Target(entryMode, journey, introSeen) : "start"),
      projectsCopy: V5_COPY.projects,
      hasEntryChoice: true,
      ui: V5_UI_COPY,
      t: v5Text,
      leadCopy: V5_LEAD_COPY,
      ensureEntryMode,
      selectEntryMode: setMode,
      discoverPathFor,
      // Pilot measurement (DEC-038): fixed outbound UTMs and the result feedback block, V5 only.
      outboundUrl: withStudyMatchOutboundUtm,
      resultFeedbackCopy: V5_FEEDBACK_COPY,
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
      discoverPathFor,
    ],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
