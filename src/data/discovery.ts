import { z } from "zod";
import {
  PRECISION_MODULE_IDS,
  REALITY_LEVELS,
  V2_QUESTION_KINDS,
  type CareerProject,
  type PrecisionModuleId,
  type ProgramId,
  type V2Cluster,
  type V2Question,
} from "@/engine";
import { V2_PROGRAM_IDS } from "./catalog";
import projectsRaw from "./content/discovery/career_projects.json";
import clustersRaw from "./content/discovery/clusters.json";
import { PROGRAM_IDS } from "./programs";
import { getQuestionCopyHe, QUESTION_BANK } from "./questions";

/**
 * V2 discovery data (THI-13): career projects (DEC-027) and question clusters (DEC-028), validated at load.
 * Candidate-facing copy stays here; the engine receives the copy-free shapes (`CareerProject`, `V2Cluster`).
 * Nothing in these files carries a score or a weight: projects only route, and question weights are THI-14.
 */

const nonEmpty = z.string().trim().min(1);
const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const snakeId = z.string().regex(/^[a-z][a-z0-9_]*$/);

// --- Clusters and questions ------------------------------------------------------------------------------------

export const V2OptionSchema = z.strictObject({
  id,
  /** Candidate copy. Required unless the question reuses a precision-module question (its copy is reused too). */
  label_he: nonEmpty.optional(),
  /** Program(s) the answer points to; empty for a neutral option or a reality-check option. */
  program_ids: z.array(snakeId),
  /** Required on reality-check options, absent elsewhere. */
  reality_level: z.enum(REALITY_LEVELS).optional(),
});

export const V2QuestionSchema = z.strictObject({
  id,
  position: z.number().int().min(1),
  kind: z.enum(V2_QUESTION_KINDS),
  /** Candidate copy. Required unless the question reuses a precision-module question (its copy is reused too). */
  prompt_he: nonEmpty.optional(),
  /**
   * Scenario applicability (THI-14): the project(s) whose opening scenario this is. Asked first when one of them is
   * selected. Absent = a general cluster question, asked only when it helps separate the current leaders.
   */
  project_ids: z.array(snakeId).min(1).optional(),
  /**
   * The question IS a precision module's own question (same options, same copy), so its answer can be carried into
   * the module on handoff and the candidate never sees it twice (THI-14). E.g. the Spotify opener reuses V1 Q1.
   */
  reuses: z.strictObject({ module: z.enum(PRECISION_MODULE_IDS), question_id: id }).optional(),
  options: z.array(V2OptionSchema).min(2),
});

export const V2ClusterSchema = z.strictObject({
  id: snakeId,
  program_ids: z.array(snakeId).min(1),
  adjacent_program_ids: z.array(snakeId),
  precision_module: z.enum(PRECISION_MODULE_IDS).nullable(),
  max_questions: z.number().int().min(1),
  questions: z.array(V2QuestionSchema),
});

export const V2ClustersFileSchema = z.strictObject({
  version: z.string(),
  status_note: z.string(),
  clusters: z.array(V2ClusterSchema).min(1),
});

export interface V2QuestionCopy {
  prompt: string;
  /** In option order. */
  options: ReadonlyArray<{ id: string; label: string }>;
}

export interface ClusterData {
  clusters: readonly V2Cluster[];
  /** Candidate-facing copy by question id. */
  questionCopy: ReadonlyMap<string, V2QuestionCopy>;
}

const fail = (scope: string, message: string): never => {
  throw new Error(`Invalid ${scope}: ${message}`);
};

/** Looks up a precision module's own question: its option ids (in order) and its candidate copy. */
export type PrecisionQuestionLookup = (
  moduleId: PrecisionModuleId,
  questionId: string,
) => { optionIds: readonly string[]; copy: V2QuestionCopy } | undefined;

/** The V1 tech precision module's questions: the V1 bank and its Hebrew copy. */
export const v1TechQuestionLookup: PrecisionQuestionLookup = (moduleId, questionId) => {
  if (moduleId !== "v1_tech") return undefined;
  const question = QUESTION_BANK.questions.find((candidate) => candidate.id === questionId);
  if (!question) return undefined;
  const copy = getQuestionCopyHe(questionId);
  return { optionIds: question.options.map((option) => option.id), copy };
};

/**
 * Validate clusters against the program catalog. Exported for tests.
 * There is no fixed question count: positions must run 1..n without gaps, with n <= the cluster's `max_questions`,
 * so Q5-Q7 are added later as data without any schema or code change.
 * V2 question ids must not collide with precision-module question ids: both kinds of answers share one answer list.
 */
export function buildClusters(
  input: unknown,
  programIds: readonly ProgramId[] = V2_PROGRAM_IDS,
  pilotProgramIds: readonly ProgramId[] = PROGRAM_IDS,
  precisionQuestions: PrecisionQuestionLookup = v1TechQuestionLookup,
  reservedQuestionIds: readonly string[] = QUESTION_BANK.questions.map((question) => question.id),
): ClusterData {
  const file = V2ClustersFileSchema.parse(input);
  const bad = (message: string) => fail("clusters", message);
  const clusterIds = file.clusters.map((cluster) => cluster.id);
  if (new Set(clusterIds).size !== clusterIds.length) bad("duplicate cluster ids");

  const questionIds = new Set<string>();
  const questionCopy = new Map<string, V2QuestionCopy>();
  const clusters: V2Cluster[] = file.clusters.map((cluster) => {
    const where = `cluster "${cluster.id}"`;
    for (const programId of [...cluster.program_ids, ...cluster.adjacent_program_ids]) {
      if (!programIds.includes(programId)) bad(`${where} references unknown program "${programId}"`);
    }
    if (new Set(cluster.program_ids).size !== cluster.program_ids.length) bad(`${where} lists a program twice`);
    if (cluster.adjacent_program_ids.some((programId) => cluster.program_ids.includes(programId))) {
      bad(`${where}: an adjacent program is already a core program`);
    }
    if (cluster.precision_module === "v1_tech") {
      const same =
        cluster.program_ids.length === pilotProgramIds.length &&
        pilotProgramIds.every((programId) => cluster.program_ids.includes(programId));
      if (!same) bad(`${where}: the v1_tech precision module covers exactly the V1 pilot programs`);
    }

    const allowed = new Set([...cluster.program_ids, ...cluster.adjacent_program_ids]);
    const ordered = [...cluster.questions].sort((a, b) => a.position - b.position);
    ordered.forEach((question, index) => {
      if (question.position !== index + 1) bad(`${where}: question positions must run 1..n without gaps or repeats`);
    });
    if (ordered.length > cluster.max_questions) {
      bad(`${where} has ${ordered.length} questions; max_questions is ${cluster.max_questions}`);
    }

    const questions: V2Question[] = ordered.map((question) => {
      const at = `${where} question "${question.id}"`;
      if (questionIds.has(question.id)) bad(`duplicate question id "${question.id}"`);
      if (reservedQuestionIds.includes(question.id)) bad(`${at} collides with a precision-module question id`);
      questionIds.add(question.id);
      const optionIds = question.options.map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) bad(`${at} has duplicate option ids`);
      if (question.project_ids && question.kind !== "scenario") bad(`${at}: only scenario questions name projects`);

      let copy: V2QuestionCopy;
      if (question.reuses) {
        const { module, question_id: reusedId } = question.reuses;
        if (cluster.precision_module !== module)
          bad(`${at} reuses a "${module}" question outside that module's cluster`);
        if (question.kind === "reality_check") bad(`${at}: a reality check cannot reuse a precision question`);
        if (question.prompt_he || question.options.some((option) => option.label_he)) {
          bad(`${at} reuses "${reusedId}", so it must not carry its own copy`);
        }
        const reused = precisionQuestions(module, reusedId) ?? bad(`${at} reuses unknown question "${reusedId}"`);
        if (reused.optionIds.join("|") !== optionIds.join("|")) {
          bad(`${at} must list exactly the options of "${reusedId}" (${reused.optionIds.join(", ")}), in order`);
        }
        copy = reused.copy;
      } else {
        if (!question.prompt_he) bad(`${at} needs prompt_he`);
        for (const option of question.options) if (!option.label_he) bad(`${at} option "${option.id}" needs label_he`);
        copy = {
          prompt: question.prompt_he!,
          options: question.options.map((option) => ({ id: option.id, label: option.label_he! })),
        };
      }

      for (const option of question.options) {
        const opt = `${at} option "${option.id}"`;
        if (question.kind === "reality_check") {
          if (option.program_ids.length > 0) bad(`${opt}: reality-check answers never point to a program`);
          if (!option.reality_level) bad(`${opt}: reality-check answers need a reality_level`);
        } else {
          if (option.reality_level) bad(`${opt}: reality_level is only for reality-check questions`);
          if (new Set(option.program_ids).size !== option.program_ids.length) bad(`${opt} lists a program twice`);
          for (const programId of option.program_ids) {
            if (!allowed.has(programId)) bad(`${opt} points to "${programId}", outside the cluster and its neighbours`);
          }
        }
      }
      if (question.kind !== "reality_check") {
        const targeted = new Set(question.options.flatMap((option) => option.program_ids));
        if (targeted.size < 2) bad(`${at} must distinguish at least two programs`);
      }

      questionCopy.set(question.id, copy);
      return {
        id: question.id,
        position: question.position,
        kind: question.kind,
        projectIds: question.project_ids ?? null,
        reuses: question.reuses ? { moduleId: question.reuses.module, questionId: question.reuses.question_id } : null,
        options: question.options.map((option) => ({
          id: option.id,
          programIds: option.program_ids,
          realityLevel: option.reality_level ?? null,
        })),
      };
    });

    return {
      id: cluster.id,
      programIds: cluster.program_ids,
      adjacentProgramIds: cluster.adjacent_program_ids,
      precisionModule: cluster.precision_module,
      maxQuestions: cluster.max_questions,
      questions,
    };
  });

  return { clusters, questionCopy };
}

// --- Career projects ---------------------------------------------------------------------------------------------

export const CareerProjectSchema = z.strictObject({
  id: snakeId,
  order: z.number().int().min(1),
  enabled: z.boolean(),
  /** Hypothetical scenario context only: shown as text, never as a logo, never implying partnership. */
  brand_name: nonEmpty.nullable(),
  /** Neutral icon identifier (the UI maps it to a generic icon). Never a brand asset. */
  icon: snakeId,
  title_he: nonEmpty,
  scenario_he: nonEmpty,
  cluster_id: snakeId,
  candidate_program_ids: z.array(snakeId).min(1),
  doc_refs: z.array(nonEmpty).min(1),
});

export const CareerProjectsFileSchema = z.strictObject({
  version: z.string(),
  status_note: z.string(),
  opening: z.strictObject({ prompt_he: nonEmpty, helper_he: nonEmpty, brand_disclaimer_he: nonEmpty }),
  projects: z.array(CareerProjectSchema).min(1),
});

export interface CareerProjectCopy {
  brandName: string | null;
  icon: string;
  title: string;
  scenario: string;
}

export interface DiscoveryOpeningCopy {
  prompt: string;
  helper: string;
  brandDisclaimer: string;
}

export interface CareerProjectData {
  /** In display order. */
  projects: readonly CareerProject[];
  copy: ReadonlyMap<string, CareerProjectCopy>;
  opening: DiscoveryOpeningCopy;
}

/**
 * Validate career projects against the catalog and the clusters. Exported for tests.
 * A project's candidate pool must sit inside its cluster's core programs, and every catalog program must be
 * reachable from at least one enabled project.
 */
export function buildCareerProjects(
  input: unknown,
  clusters: readonly V2Cluster[],
  programIds: readonly ProgramId[] = V2_PROGRAM_IDS,
): CareerProjectData {
  const file = CareerProjectsFileSchema.parse(input);
  const bad = (message: string) => fail("career projects", message);
  const ids = file.projects.map((project) => project.id);
  if (new Set(ids).size !== ids.length) bad("duplicate project ids");
  const orders = file.projects.map((project) => project.order).sort((a, b) => a - b);
  orders.forEach((order, index) => {
    if (order !== index + 1) bad("project order must run 1..n without gaps or repeats");
  });

  const copy = new Map<string, CareerProjectCopy>();
  const projects: CareerProject[] = [...file.projects]
    .sort((a, b) => a.order - b.order)
    .map((project) => {
      const where = `project "${project.id}"`;
      const cluster = clusters.find((candidate) => candidate.id === project.cluster_id);
      if (!cluster) bad(`${where} references unknown cluster "${project.cluster_id}"`);
      if (new Set(project.candidate_program_ids).size !== project.candidate_program_ids.length) {
        bad(`${where} lists a program twice`);
      }
      for (const programId of project.candidate_program_ids) {
        if (!programIds.includes(programId)) bad(`${where} references unknown program "${programId}"`);
        if (!cluster!.programIds.includes(programId)) {
          bad(`${where}: "${programId}" is not a core program of cluster "${cluster!.id}"`);
        }
      }
      copy.set(project.id, {
        brandName: project.brand_name,
        icon: project.icon,
        title: project.title_he,
        scenario: project.scenario_he,
      });
      return {
        id: project.id,
        order: project.order,
        enabled: project.enabled,
        clusterId: project.cluster_id,
        candidateProgramIds: project.candidate_program_ids,
      };
    });

  // Scenario applicability must name projects that open into the question's own cluster.
  for (const cluster of clusters) {
    for (const question of cluster.questions) {
      for (const projectId of question.projectIds ?? []) {
        const project = projects.find((candidate) => candidate.id === projectId);
        if (!project) bad(`question "${question.id}" names unknown project "${projectId}"`);
        if (project!.clusterId !== cluster.id) {
          bad(`question "${question.id}" in cluster "${cluster.id}" names project "${projectId}" of another cluster`);
        }
      }
    }
  }

  const reachable = new Set(
    projects.filter((project) => project.enabled).flatMap((project) => project.candidateProgramIds),
  );
  for (const programId of programIds) {
    if (!reachable.has(programId)) bad(`program "${programId}" is not reachable from any enabled project`);
  }

  return {
    projects,
    copy,
    opening: {
      prompt: file.opening.prompt_he,
      helper: file.opening.helper_he,
      brandDisclaimer: file.opening.brand_disclaimer_he,
    },
  };
}

const CLUSTER_DATA = buildClusters(clustersRaw);
const PROJECT_DATA = buildCareerProjects(projectsRaw, CLUSTER_DATA.clusters);

/** V2 question clusters, validated. Question lists are empty until THI-14/THI-15 add content. */
export const V2_CLUSTERS: readonly V2Cluster[] = CLUSTER_DATA.clusters;
/** V2 career projects, in display order. */
export const CAREER_PROJECTS: readonly CareerProject[] = PROJECT_DATA.projects;
export const DISCOVERY_OPENING: DiscoveryOpeningCopy = PROJECT_DATA.opening;

export function getCareerProjectCopy(projectId: string): CareerProjectCopy | undefined {
  return PROJECT_DATA.copy.get(projectId);
}

export function getV2Cluster(clusterId: string): V2Cluster | undefined {
  return V2_CLUSTERS.find((cluster) => cluster.id === clusterId);
}

export function getV2QuestionCopy(questionId: string): V2QuestionCopy | undefined {
  return CLUSTER_DATA.questionCopy.get(questionId);
}
