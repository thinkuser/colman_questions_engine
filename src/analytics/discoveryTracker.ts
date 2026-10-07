import { z } from "zod";
import { CAREER_PROJECTS } from "@/data";
import {
  buildV2QuestionView,
  buildV2ResultView,
  discoveryReducer,
  discoveryStep,
  initialDiscoveryState,
  type DiscoveryAction,
  type DiscoveryState,
} from "@/flow";
import { hasUtm, parseUtm, UTM_KEYS, type UtmContext } from "./context";
import type { AnalyticsEventName, AnalyticsParams } from "./events";
import type { StorageLike } from "./funnelTracker";
import { trackEvent, type DataLayerEvent, type DataLayerHost } from "./track";

/**
 * Funnel analytics for the V2 discovery journey (THI-16). Same principles as the V1 `FunnelTracker`:
 * analytics OBSERVES the product. Events are derived by replaying dispatched actions through the product's own pure
 * reducer, so a rejected action (double tap, stale answer, a third project) changes no state and emits no event;
 * restoring state after a refresh is never an action; every failure is swallowed; nothing needs GTM/GA4.
 * Payloads carry only ids, counts and booleans: no answer text, no free text, no scores or support, no personal data.
 * Session context lives in its own sessionStorage record (not the V1 one, not the durable journey payload).
 */

export const DISCOVERY_ANALYTICS_STORAGE_KEY = "colman-studymatch:analytics-v2";
export const DISCOVERY_ANALYTICS_STORAGE_VERSION = 1;
export const FLOW_VERSION = "v2";

const StoredContextSchema = z.strictObject({
  version: z.literal(DISCOVERY_ANALYTICS_STORAGE_VERSION),
  comparison_id: z.string().min(1).nullable(),
  utm: z.strictObject(Object.fromEntries(UTM_KEYS.map((key) => [key, z.string().optional()])) as never),
  last_question_view: z.string().nullable(),
});

export interface DiscoveryDispatchOptions {
  silent?: boolean;
}

export interface DiscoveryTrackerOptions {
  host: DataLayerHost | null;
  storage?: StorageLike | null;
  uuid?: () => string;
  debug?: (payload: DataLayerEvent) => void;
}

interface QueuedAction {
  action: DiscoveryAction;
  silent: boolean;
}

const isRunning = (state: DiscoveryState) => state.phase === "answering";
const canonical = (ids: readonly string[]) => [...new Set(ids)].sort().join("|");

function defaultUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class DiscoveryTracker {
  private readonly host: DataLayerHost | null;
  private readonly storage: StorageLike | null;
  private readonly uuid: () => string;
  private readonly debug?: (payload: DataLayerEvent) => void;

  private state: DiscoveryState = initialDiscoveryState;
  private journeyId: string | null = null;
  private utm: UtmContext = {};
  private lastQuestionView: string | null = null;
  private queue: QueuedAction[] = [];
  private fired = new Set<string>();
  /** Bumped on every completion so result-page "view once" events can fire again for a re-completed result. */
  private epoch = 0;

  constructor(options: DiscoveryTrackerOptions) {
    this.host = options.host;
    this.storage = options.storage ?? null;
    this.uuid = options.uuid ?? defaultUuid;
    this.debug = options.debug;
  }

  /** Initialise from the restored product state and the URL. Emits nothing (a refresh is not a candidate action). */
  hydrate(restored: DiscoveryState | null, search = ""): void {
    this.state = restored ?? initialDiscoveryState;
    const stored = this.load();
    this.utm = hasUtm(stored.utm) ? stored.utm : parseUtm(search);
    this.lastQuestionView = stored.last_question_view;
    this.journeyId = isRunning(this.state) ? (stored.comparison_id ?? this.uuid()) : null;
    this.persist();
  }

  enqueue(action: DiscoveryAction, options: DiscoveryDispatchOptions = {}): void {
    this.queue.push({ action, silent: options.silent === true });
  }

  /** Replay queued actions through the product reducer and emit the resulting events, in order. */
  flush(): void {
    const items = this.queue.splice(0);
    for (const { action, silent } of items) {
      const prev = this.state;
      const next = discoveryReducer(prev, action);
      this.state = next;
      try {
        this.transition(prev, action, next, silent);
      } catch {
        // Analytics must never affect the product.
      }
    }
  }

  getState(): DiscoveryState {
    return this.state;
  }

  getJourneyId(): string | null {
    return this.journeyId;
  }

  /** The project-selection screen was shown. `token` is stable per mounted view. */
  discoveryViewed(token: string): void {
    if (!this.once(`discovery:${token}`)) return;
    this.safely(() =>
      this.emit("career_project_discovery_view", {
        flow_version: FLOW_VERSION,
        project_count_available: CAREER_PROJECTS.filter((project) => project.enabled).length,
        ...this.utmParams(),
      }),
    );
  }

  /** The displayed question was exposed (once per logical exposure; Back shows a new one, a refresh does not). */
  questionViewed(): void {
    this.safely(() => {
      const step = discoveryStep(this.state);
      if (step?.status !== "ask") return;
      const view = buildV2QuestionView(step);
      const id = this.ensureJourneyId();
      const key = `${id}:${this.state.answers.length}:${view.id}`;
      if (key === this.lastQuestionView) return;
      this.lastQuestionView = key;
      this.persist();
      this.emit("question_view", {
        ...this.context(),
        ...this.questionParams(view, this.state.answers.length + 1),
      });
    });
  }

  mirrorResponse(value: "yes" | "no"): void {
    this.resultEvent("mirror_response", { mirror_response: value });
  }

  admissionClick(): void {
    this.resultEvent("admission_click");
  }

  advisorClick(): void {
    this.resultEvent("advisor_cta_click");
  }

  /** The candidate opened an official program page. `role` says whether it was the main or another direction. */
  officialProgramClick(programId: string, role: "primary" | "alternative" | "peer"): void {
    this.resultEvent("official_program_click", { program_id: programId, link_role: role });
  }

  /** The result page was shown (once per completed result). */
  resultViewed(): void {
    this.safely(() => {
      const result = this.result();
      if (!result || !this.once(`result:${this.journeyId}:${this.epoch}`)) return;
      this.emit("studymatch_result_view", { ...this.context(), ...this.resultParams(result.analytics) });
    });
  }

  secondaryProgramViewed(): void {
    if (!this.once(`secondary:${this.journeyId}:${this.epoch}`)) return;
    const alternative = this.result()?.analytics.alternativeProgramIds[0];
    this.resultEvent("secondary_program_view", alternative ? { program_id: alternative } : {});
  }

  realityCheckViewed(programId: string): void {
    if (!this.once(`reality:${this.journeyId}:${this.epoch}:${programId}`)) return;
    this.resultEvent("reality_check_view", { program_id: programId });
  }

  // ---------------------------------------------------------------------------------------------------------

  private transition(prev: DiscoveryState, action: DiscoveryAction, next: DiscoveryState, silent: boolean): void {
    const previousJourneyId = this.journeyId;
    if (action.type === "start" && next !== prev && next.phase === "answering") {
      this.journeyId = this.uuid();
    } else if (!isRunning(next)) {
      this.journeyId = null;
    } else if (!this.journeyId) {
      this.journeyId = this.uuid();
    }
    if (next !== prev) this.lastQuestionView = null;
    this.persist();
    if (silent) return;

    switch (action.type) {
      case "toggle_project":
        this.selectionEvents(prev, next);
        break;
      case "start":
        if (next !== prev && next.phase === "answering") {
          const selection = {
            ...this.context({ state: next }),
            project_ids: canonical(next.selectedProjectIds),
            selection_count: next.selectedProjectIds.length,
          };
          this.emit("career_project_selection_completed", selection);
          this.emit("comparison_started", this.context({ state: next }));
          this.handoffIfEntered(prev, next);
        }
        break;
      case "record_answer":
        if (next.answers.length === prev.answers.length + 1) this.answerEvents(prev, next);
        break;
      case "go_back":
        if (next !== prev) {
          this.emit("discovery_back", {
            ...this.context({ state: prev, journeyId: previousJourneyId }),
            questions_answered: prev.answers.length,
          });
        }
        break;
      case "restart":
        if (prev.selectedProjectIds.length > 0 || prev.answers.length > 0) {
          this.emit("restart_comparison", {
            ...this.context({ state: prev, journeyId: previousJourneyId }),
            questions_answered: prev.answers.length,
          });
        }
        break;
      default:
        break;
    }
  }

  private selectionEvents(prev: DiscoveryState, next: DiscoveryState): void {
    const before = new Set(prev.selectedProjectIds);
    const after = new Set(next.selectedProjectIds);
    for (const id of next.selectedProjectIds) {
      if (before.has(id)) continue;
      this.emit("career_project_selected", {
        flow_version: FLOW_VERSION,
        project_id: id,
        selection_count: next.selectedProjectIds.length,
        selection_position: next.selectedProjectIds.indexOf(id) + 1,
        ...this.utmParams(),
      });
    }
    for (const id of prev.selectedProjectIds) {
      if (after.has(id)) continue;
      this.emit("career_project_deselected", {
        flow_version: FLOW_VERSION,
        project_id: id,
        selection_count: next.selectedProjectIds.length,
        ...this.utmParams(),
      });
    }
  }

  private answerEvents(prev: DiscoveryState, next: DiscoveryState): void {
    const before = discoveryStep(prev);
    if (before?.status !== "ask") return;
    const view = buildV2QuestionView(before);
    const answerId = next.answers.at(-1)!.answerId;
    const option = view.options.find((candidate) => candidate.id === answerId);
    this.emit("question_answer", {
      ...this.context({ state: next }),
      ...this.questionParams(view, prev.answers.length + 1),
      answer_id: answerId,
      is_neutral: option?.isNeutral === true,
    });

    const after = discoveryStep(next);
    if (before.mode === "generic" && after?.status === "ask" && after.mode === "precision") {
      this.emit("precision_module_handoff", {
        ...this.context({ state: next }),
        module_id: after.moduleId,
        seeded_answer_count: after.state.precision?.carriedAnswers.length ?? 0,
      });
    }

    if (after?.status === "complete") {
      this.epoch += 1;
      const result = buildV2ResultView(after, next.selectedProjectIds, next.answers);
      const completed: AnalyticsParams = {
        ...this.context({ state: next }),
        ...this.resultParams(result.analytics),
        questions_answered: next.answers.length,
      };
      this.emit("comparison_completed", completed);
      if (result.analytics.recommendedProgramId) this.emit("recommended_program", completed);
    }
  }

  /** Spotify alone starts directly in the precision module: that is the (unseeded) handoff. */
  private handoffIfEntered(prev: DiscoveryState, next: DiscoveryState): void {
    const step = discoveryStep(next);
    if (prev.phase !== "answering" && step?.status === "ask" && step.mode === "precision") {
      this.emit("precision_module_handoff", {
        ...this.context({ state: next }),
        module_id: step.moduleId,
        seeded_answer_count: step.state.precision?.carriedAnswers.length ?? 0,
      });
    }
  }

  private questionParams(view: ReturnType<typeof buildV2QuestionView>, questionIndex: number): AnalyticsParams {
    const { analytics } = view;
    return {
      question_id: view.id,
      question_index: questionIndex,
      question_mode: analytics.mode,
      ...(analytics.kind ? { question_kind: analytics.kind } : {}),
      is_generated_focus: analytics.isGeneratedFocus,
      ...(analytics.focusProgramCount ? { focus_program_count: analytics.focusProgramCount } : {}),
    };
  }

  private resultParams(info: NonNullable<ReturnType<DiscoveryTracker["result"]>>["analytics"]): AnalyticsParams {
    return {
      result_kind: info.resultKind,
      ...(info.recommendedProgramId ? { recommended_program: info.recommendedProgramId } : {}),
      ...(info.alternativeProgramIds.length > 0 ? { alternative_programs: canonical(info.alternativeProgramIds) } : {}),
      selected_project_count: info.selectedProjectCount,
      scored_answer_count: info.scoredAnswerCount,
      total_answer_count: info.totalAnswerCount,
    };
  }

  private result() {
    const step = discoveryStep(this.state);
    return step?.status === "complete"
      ? buildV2ResultView(step, this.state.selectedProjectIds, this.state.answers)
      : null;
  }

  private resultEvent(event: AnalyticsEventName, extra: AnalyticsParams = {}): void {
    this.safely(() => {
      const result = this.result();
      if (!result) return;
      this.emit(event, { ...this.context(), ...this.resultParams(result.analytics), ...extra });
    });
  }

  private utmParams(): AnalyticsParams {
    const params: AnalyticsParams = {};
    for (const key of UTM_KEYS) if (this.utm[key]) params[key] = this.utm[key];
    return params;
  }

  private context(options: { state?: DiscoveryState; journeyId?: string | null } = {}): AnalyticsParams {
    const state = options.state ?? this.state;
    const id = options.journeyId === undefined ? this.journeyId : options.journeyId;
    return {
      flow_version: FLOW_VERSION,
      ...(id ? { comparison_id: id } : {}),
      selected_project_count: state.selectedProjectIds.length,
      ...(state.selectedProjectIds.length > 0 ? { project_ids: canonical(state.selectedProjectIds) } : {}),
      ...this.utmParams(),
    };
  }

  private ensureJourneyId(): string {
    this.journeyId ??= this.uuid();
    return this.journeyId;
  }

  private once(key: string): boolean {
    if (this.fired.has(key)) return false;
    this.fired.add(key);
    return true;
  }

  private emit(event: AnalyticsEventName, params: AnalyticsParams): void {
    const payload = trackEvent(event, params, this.host);
    if (payload) this.debug?.(payload);
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch {
      // Analytics must never affect the product.
    }
  }

  private load(): z.infer<typeof StoredContextSchema> {
    const empty = {
      version: DISCOVERY_ANALYTICS_STORAGE_VERSION,
      comparison_id: null,
      utm: {},
      last_question_view: null,
    } as const;
    try {
      const raw = this.storage?.getItem(DISCOVERY_ANALYTICS_STORAGE_KEY);
      if (!raw) return { ...empty, utm: {} };
      const parsed = StoredContextSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : { ...empty, utm: {} };
    } catch {
      return { ...empty, utm: {} };
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        DISCOVERY_ANALYTICS_STORAGE_KEY,
        JSON.stringify({
          version: DISCOVERY_ANALYTICS_STORAGE_VERSION,
          comparison_id: this.journeyId,
          utm: this.utm,
          last_question_view: this.lastQuestionView,
        }),
      );
    } catch {
      // Storage can be unavailable; analytics context is then simply not preserved.
    }
  }
}
