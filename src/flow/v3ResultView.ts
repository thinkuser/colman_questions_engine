import {
  findPairContent,
  getCatalogProgram,
  getSource,
  getV2QuestionCopy,
  getWorldQuestionCopy,
  PROGRAM_MEANING,
  V2_PROGRAM_IDS,
  V3_COPY,
  V3_WORLD_CLUSTERS,
} from "@/data";
import type { ProgramId, RealityLevel, RecordedAnswer, V2Step } from "@/engine";
import type { DiscoveryStrategyId } from "./journey";
import { displayName } from "./resultView";
import { buildV2ResultView, type ResultAnalytics, type V2ResultView } from "./v2ResultView";

/**
 * V3 result view model. A presentation layer over the SAME deterministic result as V2: it is built from
 * `buildV2ResultView` (which itself comes only from the engine's completed step), so the outcome (recommended / near
 * tie / insufficient / Tech precision), the programs shown and their order are exactly V2's. V3 only re-words:
 *  - evidence is translated to MEANING ("מעניין אתכם להבין איך אנשים מגיבים למסרים") from curated per-program copy
 *    instead of echoing the literal options the candidate picked (those stay available inside a collapsed detail);
 *  - the program section reuses the verified work-imagination statements, never invented academic facts;
 *  - a near tie gets a curated "what is the difference" block for the pairs that most often tie.
 * No scores, percentages or runtime generation. No scoring, routing or content mapping is touched.
 *
 * Every candidate-facing string passes through `options.text`, the experience's presentation seam (V3: identity;
 * V4: its gender-inclusive wording, DEC-036). `base` (lead context, analytics) is never re-worded.
 */

export type V3ResultKind = "recommended" | "near_tie" | "insufficient_positive_evidence";

export interface V3Program {
  programId: ProgramId;
  nameHe: string;
  qualifierHe: string | null;
  displayNameHe: string;
  summaryHe: string;
  /** Two or three short meaning statements ("why this fits you"). */
  whyHe: string[];
  /** Up to three verified work-imagination statements ("what you will find"). */
  findHe: string[];
  programUrl: string | null;
}

export interface V3Note {
  programId: ProgramId | null;
  level: RealityLevel | "info";
  headingHe: string;
  textHe: string;
  /** A materially important note is never collapsed. */
  important: boolean;
}

export interface V3PairView {
  curated: boolean;
  programs: [V3Program, V3Program];
  bullets: [string[], string[]];
  guidance: Array<{ ifHe: string; programId: ProgramId; programNameHe: string }>;
}

export interface V3ResultView {
  kind: V3ResultKind;
  source: "generic" | "precision";
  /** recommended: [primary, secondary?]. near_tie: both, in catalog order. insufficient: zero or one weak direction. */
  programs: V3Program[];
  pair: V3PairView | null;
  notes: V3Note[];
  /** The candidate's own choices behind the result: shown only inside a collapsed detail. */
  chosenHe: string[];
  allProgramsUrl: string | null;
  /** The company disclaimer (brand-led only); null for world-led discovery. */
  disclaimerHe: string | null;
  /** True when a shown program has no curated facts, so the COLMAN section points to the official site for details. */
  limitedFacts: boolean;
  /** The V2-compatible result: the single source for lead context and analytics metadata. */
  base: V2ResultView;
  analytics: ResultAnalytics;
}

const MIN_WHY = 2;
const MAX_WHY = 3;
const MAX_FIND = 3;
const catalogOrder = (ids: readonly ProgramId[]) =>
  [...ids].sort((a, b) => V2_PROGRAM_IDS.indexOf(a) - V2_PROGRAM_IDS.indexOf(b));

function officialUrl(programId: ProgramId): string | null {
  const program = getCatalogProgram(programId);
  const sourceId = program?.academySourceIds[0] ?? program?.colmanSourceIds[0];
  return sourceId ? (getSource(sourceId)?.url ?? null) : null;
}

/** How many meaning statements to show: as many as there were independent signals, but always two or three. */
function whyCount(signals: number): number {
  return Math.min(MAX_WHY, Math.max(MIN_WHY, signals));
}

type Text = (he: string) => string;
const asIs: Text = (he) => he;

export function v3Program(programId: ProgramId, signals: number, text: Text = asIs): V3Program {
  const program = getCatalogProgram(programId);
  if (!program) throw new Error(`Unknown program "${programId}" in V3 result`);
  const meaning = PROGRAM_MEANING[programId];
  if (!meaning) throw new Error(`No V3 meaning copy for "${programId}"`);
  return {
    programId,
    nameHe: program.nameHe,
    qualifierHe: program.qualifierHe,
    displayNameHe: displayName({
      id: programId,
      nameHe: program.nameHe,
      nameEn: program.nameEn,
      qualifierHe: program.qualifierHe,
    }),
    summaryHe: text(meaning.summaryHe),
    whyHe: meaning.whyHe.slice(0, whyCount(signals)).map(text),
    findHe: program.workStatementsHe.slice(0, MAX_FIND).map(text),
    programUrl: officialUrl(programId),
  };
}

function pairView(first: V3Program, second: V3Program, text: Text): V3PairView {
  const curated = findPairContent(first.programId, second.programId);
  if (!curated) {
    // Graceful fallback: each program's own verified work statements, no invented distinctions.
    return {
      curated: false,
      programs: [first, second],
      bullets: [first.findHe.slice(0, 2), second.findHe.slice(0, 2)],
      guidance: [],
    };
  }
  const byId = new Map([first, second].map((program) => [program.programId, program]));
  const [aId, bId] = curated.programs;
  const a = byId.get(aId)!;
  const b = byId.get(bId)!;
  return {
    curated: true,
    programs: [a, b],
    bullets: [curated.bullets[0].map(text), curated.bullets[1].map(text)],
    guidance: curated.guidance.map((entry) => ({
      ifHe: text(entry.ifHe),
      programId: entry.programId,
      programNameHe: byId.get(entry.programId)?.displayNameHe ?? entry.programId,
    })),
  };
}

/**
 * What the candidate chose that pointed to `programId`, as candidate-facing text: a world question's own copy, else the
 * V2 copy, else (generated focus) the program's work statement. Strongest answers first. Shown only in the collapsed
 * detail; the visible "why" is the curated meaning copy, never an echo of the choices.
 */
function chosenFor(step: Extract<V2Step, { status: "complete" }>, programId: ProgramId, text: Text): string[] {
  const texts = step.state.evidence
    .filter((answer) => answer.programIds.includes(programId))
    .sort((a, b) => b.weight - a.weight)
    .map((answer) => {
      if (answer.source.type === "generic_focus") {
        const index = Number(answer.questionId.split(":").at(-1));
        return Number.isInteger(index) ? (getCatalogProgram(programId)?.workStatementsHe[index] ?? null) : null;
      }
      const copy = getWorldQuestionCopy(answer.questionId) ?? getV2QuestionCopy(answer.questionId);
      return copy?.options.find((option) => option.id === answer.answerId)?.label ?? null;
    })
    .filter((label): label is string => label !== null)
    .map(text);
  return [...new Set(texts)].slice(0, MAX_WHY);
}

export interface V3ResultOptions {
  /** World-led discovery shows no company disclaimer (there are no companies); brand-led keeps V2's. */
  strategyId?: DiscoveryStrategyId;
  /** Presentation seam for the candidate-facing strings (default: as is). */
  text?: Text;
}

export function buildV3ResultView(
  step: Extract<V2Step, { status: "complete" }>,
  selectedIds: readonly string[],
  answers: readonly RecordedAnswer[],
  options: V3ResultOptions = {},
): V3ResultView {
  const base = buildV2ResultView(step, selectedIds, answers);
  const allProgramsUrl = getSource("colman_ba_programs_index")?.url ?? null;
  const text = options.text ?? asIs;
  const disclaimerHe = (options.strategyId ?? "worlds") === "worlds" ? null : text(base.disclaimerHe);
  const common = { allProgramsUrl, disclaimerHe, base, analytics: base.analytics };

  if (base.type === "generic") {
    const programs = base.directions.map((direction) =>
      v3Program(direction.programId, step.state.support[direction.programId] ?? 0, text),
    );
    const notes: V3Note[] = base.realityChecks.map((reality) => ({
      programId: reality.programId,
      level: reality.level,
      headingHe: text(reality.headingHe),
      textHe: reality.noteHe ? `${text(reality.answerHe)} ${text(reality.noteHe)}` : text(reality.answerHe),
      important: reality.level === "negative",
    }));
    return {
      ...common,
      kind: base.kind,
      source: "generic",
      programs,
      pair: base.kind === "near_tie" && programs[0] && programs[1] ? pairView(programs[0], programs[1], text) : null,
      notes,
      chosenHe: base.directions[0] ? chosenFor(step, base.directions[0].programId, text) : [],
      limitedFacts: base.limitedFacts,
    };
  }

  // Tech precision (V1 module reached through the journey): same engine result, V3 presentation.
  const v1 = base.view;
  const notes: V3Note[] = v1.realityChecks.map((reality) => ({
    programId: reality.program.id,
    level: "negative" as const,
    headingHe: text(V3_COPY.result.importantNoteTitle),
    textHe: text(reality.bodyHe),
    important: true,
  }));
  // A V1 card for a module question that a world scenario answered (Tech: WT1 carried in as Q1) shows the candidate's
  // own world answer, not the V1 copy of a question they never saw.
  const carriedFrom = (questionId: string, answerId: string): string | null => {
    const source = V3_WORLD_CLUSTERS.flatMap((cluster) => cluster.questions).find(
      (question) => question.reuses?.questionId === questionId && step.state.askedQuestionIds.includes(question.id),
    );
    if (!source) return null;
    return getWorldQuestionCopy(source.id)?.options.find((option) => option.id === answerId)?.label ?? null;
  };
  const chosenHe = v1.evidence
    .filter((card) => card.kind !== "mixed")
    .map((card) => text(carriedFrom(card.questionId, card.answerId) ?? card.text))
    .slice(0, 4);

  if (v1.kind === "no_strong_fit") {
    return {
      ...common,
      kind: "insufficient_positive_evidence",
      source: "precision",
      programs: [],
      pair: null,
      notes,
      chosenHe,
      limitedFacts: false,
    };
  }
  if (v1.kind === "near_tie") {
    const [first, second] = catalogOrder([v1.top.id, v1.second.id]).map((id) => v3Program(id, MAX_WHY, text));
    if (!first || !second) throw new Error("A near tie needs two programs");
    return {
      ...common,
      kind: "near_tie",
      source: "precision",
      programs: [first, second],
      pair: pairView(first, second, text),
      notes,
      chosenHe,
      limitedFacts: false,
    };
  }
  const primary = v3Program(v1.top.id, Math.max(v1.evidence.length, MIN_WHY), text);
  const secondary = v3Program(v1.second.id, MIN_WHY, text);
  return {
    ...common,
    kind: "recommended",
    source: "precision",
    programs: [primary, secondary],
    pair: null,
    notes,
    chosenHe,
    limitedFacts: false,
  };
}
