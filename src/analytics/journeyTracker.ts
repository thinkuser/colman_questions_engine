import { z } from "zod";
import {
  buildV2ResultView,
  buildV3QuestionView,
  initialJourneyState,
  journeyReducer,
  journeyStep,
  type DiscoveryStrategy,
  type JourneyAction,
  type JourneyState,
  type ResultAnalytics,
} from "@/flow";
import { hasUtm, parseUtm, UTM_KEYS, type UtmContext } from "./context";
import type { AnalyticsEventName, AnalyticsParamName, AnalyticsParams } from "./events";
import type { StorageLike } from "./funnelTracker";
import { trackEvent, type DataLayerEvent, type DataLayerHost } from "./track";

/**
 * Funnel analytics for the V3 experience. Same principles as the V2 `DiscoveryTracker` (which stays exactly as the
 * frozen baseline): analytics OBSERVES the product; events are derived by replaying dispatched actions through the
 * product's own pure reducer, so a rejected action emits nothing; restoring after a refresh emits nothing; failures
 * are swallowed; payloads carry ids, counts and booleans only (no answer text, no personal data).
 *
 * It is driven by a DISCOVERY STRATEGY, so the same tracker reports world-led discovery (`career_world_*`) or, if the
 * V3 experience is ever run brand-led, project discovery (`career_project_*`). Every event carries `flow_version`.
 */

export interface SelectionVocabulary {
  view: AnalyticsEventName;
  selected: AnalyticsEventName;
  deselected: AnalyticsEventName;
  completed: AnalyticsEventName;
  idParam: AnalyticsParamName;
  idsParam: AnalyticsParamName;
  countParam: AnalyticsParamName;
  availableParam: AnalyticsParamName;
}

export const WORLD_VOCABULARY: SelectionVocabulary = {
  view: "career_world_discovery_view",
  selected: "career_world_selected",
  deselected: "career_world_deselected",
  completed: "career_world_selection_completed",
  idParam: "world_id",
  idsParam: "world_ids",
  countParam: "selected_world_count",
  availableParam: "world_count_available",
};

export const PROJECT_VOCABULARY: SelectionVocabulary = {
  view: "career_project_discovery_view",
  selected: "career_project_selected",
  deselected: "career_project_deselected",
  completed: "career_project_selection_completed",
  idParam: "project_id",
  idsParam: "project_ids",
  countParam: "selected_project_count",
  availableParam: "project_count_available",
};

export const vocabularyFor = (strategy: DiscoveryStrategy): SelectionVocabulary =>
  strategy.id === "worlds" ? WORLD_VOCABULARY : PROJECT_VOCABULARY;

export type JourneyLeadErrorType = "validation" | "server" | "network";

export interface JourneyTrackerOptions {
  host: DataLayerHost | null;
  strategy: DiscoveryStrategy;
  flowVersion: string;
  storageKey: string;
  storage?: StorageLike | null;
  uuid?: () => string;
  debug?: (payload: DataLayerEvent) => void;
}

const STORAGE_VERSION = 1;
const StoredContextSchema = z.strictObject({
  version: z.literal(STORAGE_VERSION),
  comparison_id: z.string().min(1).nullable(),
  utm: z.strictObject(Object.fromEntries(UTM_KEYS.map((key) => [key, z.string().optional()])) as never),
  last_question_view: z.string().nullable(),
});

const isRunning = (state: JourneyState) => state.phase === "answering";
const canonical = (ids: readonly string[]) => [...new Set(ids)].sort().join("|");

function defaultUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class JourneyTracker {
  private readonly host: DataLayerHost | null;
  private readonly strategy: DiscoveryStrategy;
  private readonly vocabulary: SelectionVocabulary;
  private readonly flowVersion: string;
  private readonly storageKey: string;
  private readonly storage: StorageLike | null;
  private readonly uuid: () => string;
  private readonly debug?: (payload: DataLayerEvent) => void;

  private state: JourneyState = initialJourneyState;
  private journeyId: string | null = null;
  private utm: UtmContext = {};
  private lastQuestionView: string | null = null;
  private queue: Array<{ action: JourneyAction; silent: boolean }> = [];
  private fired = new Set<string>();
  private epoch = 0;

  constructor(options: JourneyTrackerOptions) {
    this.host = options.host;
    this.strategy = options.strategy;
    this.vocabulary = vocabularyFor(options.strategy);
    this.flowVersion = options.flowVersion;
    this.storageKey = options.storageKey;
    this.storage = options.storage ?? null;
    this.uuid = options.uuid ?? defaultUuid;
    this.debug = options.debug;
  }

  hydrate(restored: JourneyState | null, search = ""): void {
    this.state = restored ?? initialJourneyState;
    const stored = this.load();
    this.utm = hasUtm(stored.utm) ? stored.utm : parseUtm(search);
    this.lastQuestionView = stored.last_question_view;
    this.journeyId = isRunning(this.state) ? (stored.comparison_id ?? this.uuid()) : null;
    this.persist();
  }

  enqueue(action: JourneyAction, options: { silent?: boolean } = {}): void {
    this.queue.push({ action, silent: options.silent === true });
  }

  flush(): void {
    for (const { action, silent } of this.queue.splice(0)) {
      const prev = this.state;
      const next = journeyReducer(this.strategy, prev, action);
      this.state = next;
      try {
        this.transition(prev, action, next, silent);
      } catch {
        // Analytics must never affect the product.
      }
    }
  }

  getState(): JourneyState {
    return this.state;
  }

  getJourneyId(): string | null {
    return this.journeyId;
  }

  // --- Landing and discovery -------------------------------------------------------------------------------------

  landingViewed(token: string): void {
    if (!this.once(`landing:${token}`)) return;
    this.safely(() => this.emit("studymatch_landing_view", { flow_version: this.flowVersion, ...this.utmParams() }));
  }

  started(): void {
    this.safely(() => this.emit("studymatch_start", { flow_version: this.flowVersion, ...this.utmParams() }));
  }

  discoveryViewed(token: string): void {
    if (!this.once(`discovery:${token}`)) return;
    this.safely(() =>
      this.emit(this.vocabulary.view, {
        flow_version: this.flowVersion,
        [this.vocabulary.availableParam]: this.strategy.entryIds.length,
        ...this.utmParams(),
      }),
    );
  }

  // --- Questions ---------------------------------------------------------------------------------------------------

  questionViewed(): void {
    this.safely(() => {
      const step = journeyStep(this.strategy, this.state);
      if (step?.status !== "ask") return;
      const view = buildV3QuestionView(step);
      const id = this.ensureJourneyId();
      const key = `${id}:${this.state.answers.length}:${view.id}`;
      if (key === this.lastQuestionView) return;
      this.lastQuestionView = key;
      this.persist();
      this.emit("question_view", { ...this.context(), ...this.questionParams(view, this.state.answers.length + 1) });
    });
  }

  /** Continue was pressed on the displayed question (before the answer is committed). */
  questionContinued(): void {
    this.safely(() => {
      const step = journeyStep(this.strategy, this.state);
      if (step?.status !== "ask") return;
      const view = buildV3QuestionView(step);
      this.emit("question_continue", {
        ...this.context(),
        ...this.questionParams(view, this.state.answers.length + 1),
      });
    });
  }

  // --- Result ------------------------------------------------------------------------------------------------------

  resultViewed(): void {
    this.safely(() => {
      const result = this.result();
      if (!result || !this.once(`result:${this.journeyId}:${this.epoch}`)) return;
      this.emit("studymatch_result_view", { ...this.context(), ...this.resultParams(result) });
    });
  }

  resultProgramClick(programId: string, role: "primary" | "alternative" | "peer", position: string): void {
    this.resultEvent("result_program_click", { program_id: programId, link_role: role, cta_position: position });
  }

  resultContactClick(position: string): void {
    this.resultEvent("result_contact_click", { cta_position: position });
  }

  resultAllProgramsClick(): void {
    this.resultEvent("result_all_programs_click");
  }

  resultDetailExpanded(section: string): void {
    this.resultEvent("result_detail_expand", { detail_section: section });
  }

  secondaryProgramViewed(): void {
    if (!this.once(`secondary:${this.journeyId}:${this.epoch}`)) return;
    const alternative = this.result()?.alternativeProgramIds[0];
    this.resultEvent("secondary_program_view", alternative ? { program_id: alternative } : {});
  }

  realityCheckViewed(programId: string): void {
    if (!this.once(`reality:${this.journeyId}:${this.epoch}:${programId}`)) return;
    this.resultEvent("reality_check_view", { program_id: programId });
  }

  // --- Lead (metadata only: never a field value) --------------------------------------------------------------------

  leadFormViewed(): void {
    if (!this.once(`lead-view:${this.journeyId}:${this.epoch}`)) return;
    this.resultEvent("lead_form_view");
  }

  leadFormSubmitted(): void {
    this.resultEvent("lead_form_submit");
  }

  leadFormSucceeded(): void {
    this.resultEvent("lead_form_success");
  }

  leadFormFailed(errorType: JourneyLeadErrorType): void {
    this.resultEvent("lead_form_error", { error_type: errorType });
  }

  // -----------------------------------------------------------------------------------------------------------------

  private transition(prev: JourneyState, action: JourneyAction, next: JourneyState, silent: boolean): void {
    const previousJourneyId = this.journeyId;
    if (action.type === "start" && next !== prev && next.phase === "answering") this.journeyId = this.uuid();
    else if (!isRunning(next)) this.journeyId = null;
    else if (!this.journeyId) this.journeyId = this.uuid();
    if (next !== prev) this.lastQuestionView = null;
    this.persist();
    if (silent) return;

    switch (action.type) {
      case "toggle_entry":
        this.selectionEvents(prev, next);
        break;
      case "start":
        if (next !== prev && next.phase === "answering") {
          this.emit(this.vocabulary.completed, {
            ...this.context({ state: next }),
            selection_count: next.selectedIds.length,
          });
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
        if (prev.selectedIds.length > 0 || prev.answers.length > 0) {
          this.emit("restart_comparison", {
            ...this.context({ state: prev, journeyId: previousJourneyId }),
            questions_answered: prev.answers.length,
          });
        }
        break;
    }
  }

  private selectionEvents(prev: JourneyState, next: JourneyState): void {
    const before = new Set(prev.selectedIds);
    const after = new Set(next.selectedIds);
    for (const id of next.selectedIds) {
      if (before.has(id)) continue;
      this.emit(this.vocabulary.selected, {
        flow_version: this.flowVersion,
        [this.vocabulary.idParam]: id,
        [this.vocabulary.countParam]: next.selectedIds.length,
        selection_position: next.selectedIds.indexOf(id) + 1,
        ...this.utmParams(),
      });
    }
    for (const id of prev.selectedIds) {
      if (after.has(id)) continue;
      this.emit(this.vocabulary.deselected, {
        flow_version: this.flowVersion,
        [this.vocabulary.idParam]: id,
        [this.vocabulary.countParam]: next.selectedIds.length,
        ...this.utmParams(),
      });
    }
  }

  private answerEvents(prev: JourneyState, next: JourneyState): void {
    const before = journeyStep(this.strategy, prev);
    if (before?.status !== "ask") return;
    const view = buildV3QuestionView(before);
    const answerId = next.answers.at(-1)!.answerId;
    const option = view.options.find((candidate) => candidate.id === answerId);
    this.emit("question_answer", {
      ...this.context({ state: next }),
      ...this.questionParams(view, prev.answers.length + 1),
      answer_id: answerId,
      is_neutral: option?.isNeutral === true,
    });

    const after = journeyStep(this.strategy, next);
    if (before.mode === "generic" && after?.status === "ask" && after.mode === "precision") {
      this.emit("precision_module_handoff", {
        ...this.context({ state: next }),
        module_id: after.moduleId,
        seeded_answer_count: after.state.precision?.carriedAnswers.length ?? 0,
      });
    }
    if (after?.status === "complete") {
      this.epoch += 1;
      const result = buildV2ResultView(after, next.selectedIds, next.answers).analytics;
      const completed: AnalyticsParams = {
        ...this.context({ state: next }),
        ...this.resultParams(result),
        questions_answered: next.answers.length,
      };
      this.emit("comparison_completed", completed);
      if (result.recommendedProgramId) this.emit("recommended_program", completed);
    }
  }

  private handoffIfEntered(prev: JourneyState, next: JourneyState): void {
    const step = journeyStep(this.strategy, next);
    if (prev.phase !== "answering" && step?.status === "ask" && step.mode === "precision") {
      this.emit("precision_module_handoff", {
        ...this.context({ state: next }),
        module_id: step.moduleId,
        seeded_answer_count: step.state.precision?.carriedAnswers.length ?? 0,
      });
    }
  }

  private questionParams(view: ReturnType<typeof buildV3QuestionView>, questionIndex: number): AnalyticsParams {
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

  private resultParams(info: ResultAnalytics): AnalyticsParams {
    return {
      result_kind: info.resultKind,
      ...(info.recommendedProgramId ? { recommended_program: info.recommendedProgramId } : {}),
      ...(info.alternativeProgramIds.length > 0 ? { alternative_programs: canonical(info.alternativeProgramIds) } : {}),
      [this.vocabulary.countParam]: info.selectedProjectCount,
      scored_answer_count: info.scoredAnswerCount,
      total_answer_count: info.totalAnswerCount,
    };
  }

  private result(): ResultAnalytics | null {
    const step = journeyStep(this.strategy, this.state);
    return step?.status === "complete"
      ? buildV2ResultView(step, this.state.selectedIds, this.state.answers).analytics
      : null;
  }

  private resultEvent(event: AnalyticsEventName, extra: AnalyticsParams = {}): void {
    this.safely(() => {
      const result = this.result();
      if (!result) return;
      this.emit(event, { ...this.context(), ...this.resultParams(result), ...extra });
    });
  }

  private utmParams(): AnalyticsParams {
    const params: AnalyticsParams = {};
    for (const key of UTM_KEYS) if (this.utm[key]) params[key] = this.utm[key];
    return params;
  }

  private context(options: { state?: JourneyState; journeyId?: string | null } = {}): AnalyticsParams {
    const state = options.state ?? this.state;
    const id = options.journeyId === undefined ? this.journeyId : options.journeyId;
    return {
      flow_version: this.flowVersion,
      ...(id ? { comparison_id: id } : {}),
      [this.vocabulary.countParam]: state.selectedIds.length,
      ...(state.selectedIds.length > 0 ? { [this.vocabulary.idsParam]: canonical(state.selectedIds) } : {}),
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
    const empty = { version: STORAGE_VERSION, comparison_id: null, utm: {}, last_question_view: null } as const;
    try {
      const raw = this.storage?.getItem(this.storageKey);
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
        this.storageKey,
        JSON.stringify({
          version: STORAGE_VERSION,
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
