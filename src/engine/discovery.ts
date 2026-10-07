import type { ProgramId } from "./types";

/**
 * V2 career-project discovery (THI-13, DEC-027). Pure and deterministic; project and cluster data are inputs.
 *
 * The candidate picks 1-2 "career projects" ("If you could join one of these projects tomorrow..."). A project is
 * ROUTING ONLY: it narrows the set of programs the later questions talk about. It contributes no fit score, and
 * nothing in this module produces, seeds, or scaffolds a score. Scoring and stop rules are THI-14.
 */

export const MIN_SELECTED_PROJECTS = 1;
export const MAX_SELECTED_PROJECTS = 2;

/** A career project as the discovery logic needs it (candidate copy lives in the data layer). */
export interface CareerProject {
  id: string;
  /** Display order, 1-based. */
  order: number;
  enabled: boolean;
  /** The question cluster whose questions follow this project. */
  clusterId: string;
  /** Programs this project brings into consideration. Not a ranking and not a score. */
  candidateProgramIds: readonly ProgramId[];
}

export type ProjectSelectionError =
  | { code: "none_selected" }
  | { code: "too_many"; max: number; received: number }
  | { code: "duplicate"; projectId: string }
  | { code: "unknown_project"; projectId: string }
  | { code: "project_disabled"; projectId: string };

export type ProjectSelectionResult =
  { ok: true; projectIds: string[] } | { ok: false; errors: ProjectSelectionError[] };

/**
 * Validate a started discovery's project selection: 1 to 2 distinct, known, enabled projects.
 * On success the ids are returned in project display order (`order`), so the same set always yields the same result
 * whatever the click order.
 */
export function validateProjectSelection(
  selectedProjectIds: readonly string[],
  projects: readonly CareerProject[],
): ProjectSelectionResult {
  const errors: ProjectSelectionError[] = [];
  if (selectedProjectIds.length < MIN_SELECTED_PROJECTS) errors.push({ code: "none_selected" });
  if (selectedProjectIds.length > MAX_SELECTED_PROJECTS) {
    errors.push({ code: "too_many", max: MAX_SELECTED_PROJECTS, received: selectedProjectIds.length });
  }
  const seen = new Set<string>();
  for (const projectId of selectedProjectIds) {
    if (seen.has(projectId)) errors.push({ code: "duplicate", projectId });
    seen.add(projectId);
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) errors.push({ code: "unknown_project", projectId });
    else if (!project.enabled) errors.push({ code: "project_disabled", projectId });
  }
  if (errors.length > 0) return { ok: false, errors };
  const ordered = [...projects].filter((project) => seen.has(project.id)).sort((a, b) => a.order - b.order);
  return { ok: true, projectIds: ordered.map((project) => project.id) };
}

/**
 * The programs a discovery will talk about, and why each is there. Deliberately has no numeric field:
 * being in the pool is not evidence of fit (DEC-027).
 *
 * Ordering is deterministic (project display order, then each project's own program order) so the same selection
 * always yields the same pool. Array POSITION MUST NOT be used as a ranking or tie-break signal (THI-14): ranking comes
 * only from scored answers and evidence, and a true tie stays a tie unless an explicit, documented rule resolves it.
 */
export interface CandidatePool {
  /** Selected projects, in project display order (not click order). */
  projectIds: readonly string[];
  /** Clusters whose questions apply, de-duplicated, in project order. */
  clusterIds: readonly string[];
  /** Union of the selected projects' programs, de-duplicated, in project order then each project's order. Not a ranking. */
  programIds: readonly ProgramId[];
  /** For each pooled program, the selected project(s) that brought it in. Provenance only. */
  programSources: Readonly<Record<ProgramId, readonly string[]>>;
}

/** Build the candidate pool for a selection that `validateProjectSelection` accepted. Throws on an invalid one. */
export function buildCandidatePool(
  selectedProjectIds: readonly string[],
  projects: readonly CareerProject[],
): CandidatePool {
  const validation = validateProjectSelection(selectedProjectIds, projects);
  if (!validation.ok) {
    throw new Error(`Invalid project selection: ${validation.errors.map((error) => error.code).join(", ")}`);
  }
  const selected = validation.projectIds.map((id) => projects.find((project) => project.id === id)!);
  const programIds: ProgramId[] = [];
  const clusterIds: string[] = [];
  const programSources: Record<ProgramId, string[]> = {};
  for (const project of selected) {
    if (!clusterIds.includes(project.clusterId)) clusterIds.push(project.clusterId);
    for (const programId of project.candidateProgramIds) {
      if (!programIds.includes(programId)) programIds.push(programId);
      (programSources[programId] ??= []).push(project.id);
    }
  }
  return { projectIds: validation.projectIds, clusterIds, programIds, programSources };
}

// ---------------------------------------------------------------------------------------------------------------
// V2 question clusters: the shape THI-14 (routing/scoring) and THI-15 (content) build on. Types only here.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Question roles. The THI-14 engine decides what each kind is worth; the data never carries weights.
 * `reality_check` questions are evidence/warnings only and never rank (DEC-009).
 */
export const V2_QUESTION_KINDS = ["scenario", "focus", "tiebreaker", "reality_check"] as const;
export type V2QuestionKind = (typeof V2_QUESTION_KINDS)[number];

export const REALITY_LEVELS = ["positive", "neutral", "negative"] as const;
export type RealityLevel = (typeof REALITY_LEVELS)[number];

export interface V2AnswerOption {
  id: string;
  /**
   * Program(s) this answer points to. One or more for ranking kinds (a shared signal such as
   * "Communication / Communication + Management" lists both); empty for a neutral option and for reality checks.
   */
  programIds: readonly ProgramId[];
  /** Set only on reality-check options. */
  realityLevel: RealityLevel | null;
}

export interface V2Question {
  /** Stable id, e.g. "B1". */
  id: string;
  /** 1-based position within the cluster. Positions are contiguous; there is no fixed question count. */
  position: number;
  kind: V2QuestionKind;
  /**
   * Scenario applicability: the selected project(s) this scenario opens. Null for a general cluster question, which is
   * asked only when it separates the current leaders (THI-14).
   */
  projectIds: readonly string[] | null;
  /**
   * Set when the question IS a precision module's own question: the answer is carried into the module on handoff so
   * the candidate never answers the same question twice (THI-14).
   */
  reuses: { moduleId: PrecisionModuleId; questionId: string } | null;
  /**
   * Reality checks only: the resolved program(s) this check is about. Applicability is explicit, never inferred from
   * cluster membership or order, so a check also reaches a program that surfaced from another cluster (THI-14).
   * Null for every other kind.
   */
  realityForProgramIds: readonly ProgramId[] | null;
  options: readonly V2AnswerOption[];
}

/** Specialised modules that can take over a cluster (THI-14). V1's CS/DS/MIS engine is the only one so far. */
export const PRECISION_MODULE_IDS = ["v1_tech"] as const;
export type PrecisionModuleId = (typeof PRECISION_MODULE_IDS)[number];

export interface V2Cluster {
  id: string;
  /** Core programs of the cluster. */
  programIds: readonly ProgramId[];
  /** Neighbouring programs that answers in this cluster may also point to (e.g. Business inside the Law cluster). */
  adjacentProgramIds: readonly ProgramId[];
  /** A specialised precision module that handles this cluster instead of the generic V2 flow, if any. */
  precisionModule: PrecisionModuleId | null;
  /** Upper bound on positions; the spec reserves Q5-Q7, so clusters allow up to 7 today. */
  maxQuestions: number;
  /** Ordered by position. Initial content is Q1-Q4; later questions are appended as data. */
  questions: readonly V2Question[];
}

// The precision-module adapter interface and the V2 router live in ./v2 (THI-14).
