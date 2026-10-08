import { z } from "zod";
import { PRECISION_MODULE_IDS, type CareerProject, type ProgramId, type V2Cluster } from "@/engine";
import { V2_PROGRAM_IDS } from "./catalog";
import projectsRaw from "./content/discovery/v5_projects.json";
import { V2_CLUSTERS, type V2QuestionCopy } from "./discovery";
import { adaptDoors, DoorFollowUpSchema, DoorScenarioSchema, nonEmpty, snakeId } from "./discoveryDoors";
import { QUESTION_BANK } from "./questions";
import { V3_WORLD_CLUSTERS } from "./v3Worlds";

/**
 * V5 BALANCED PROJECT-LED discovery data (DEC-037), validated at load. Ten concrete projects that together give every
 * one of the 14 programs a DIRECT answer in a project opener. A V5 project is a discovery "door" exactly like a V3
 * world (shared adapter, `discoveryDoors.ts`):
 *  - the card selection is ROUTING ONLY: it builds the candidate pool (core + adjacent) and opens the project's own
 *    first scenario; selecting scores nothing, and selection order gives no points;
 *  - the opener is scored evidence (+3, the existing scenario rule); everything after it is the unchanged engine with
 *    EXISTING authored questions borrowed by id (V2 clusters; People/HR borrows the People & Organizations world's
 *    WO2-WO5 follow-ups), generated focus, reality checks and the V1 Tech precision module.
 * The Spotify opener carries into V1 as Q1 (same option ids, same separator), like the Tech world's WT1.
 * V2's career projects (`career_projects.json`, BRAND_STRATEGY) are separate and unchanged.
 */

const V5ProjectSchema = z.strictObject({
  id: snakeId,
  order: z.number().int().min(1),
  enabled: z.boolean(),
  title_he: nonEmpty,
  card_he: nonEmpty,
  core_program_ids: z.array(snakeId).min(1),
  adjacent_program_ids: z.array(snakeId),
  precision_module: z.enum(PRECISION_MODULE_IDS).nullable(),
  borrow_cluster_ids: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)),
  scenario: DoorScenarioSchema,
  follow_ups: z.array(DoorFollowUpSchema),
});

export const V5ProjectsFileSchema = z.strictObject({
  version: z.literal("v5"),
  status_note: z.string(),
  opening: z.strictObject({ prompt_he: nonEmpty, helper_he: nonEmpty }),
  projects: z.array(V5ProjectSchema).min(1),
});

/** Candidate-facing copy of a V5 project card: a title and one line about the task. No logo, no brand colour. */
export interface V5ProjectEntry {
  id: string;
  order: number;
  enabled: boolean;
  titleHe: string;
  cardHe: string;
  coreProgramIds: readonly ProgramId[];
  adjacentProgramIds: readonly ProgramId[];
  scenarioId: string;
}

export interface V5ProjectData {
  projects: readonly V5ProjectEntry[];
  clusters: readonly V2Cluster[];
  questionCopy: ReadonlyMap<string, V2QuestionCopy>;
  opening: { prompt: string; helper: string };
}

export const v5ProjectClusterId = (projectId: string) => `v5_project_${projectId}`;

const fail = (message: string): never => {
  throw new Error(`Invalid V5 projects: ${message}`);
};

/** Validate the V5 project file and adapt it to engine clusters (one per project). Exported for tests. */
export function buildV5Projects(
  input: unknown,
  borrowable: readonly V2Cluster[] = [...V2_CLUSTERS, ...V3_WORLD_CLUSTERS],
  programIds: readonly ProgramId[] = V2_PROGRAM_IDS,
  reservedQuestionIds: readonly string[] = [
    ...QUESTION_BANK.questions.map((question) => question.id),
    ...V2_CLUSTERS.flatMap((cluster) => cluster.questions.map((question) => question.id)),
    ...V3_WORLD_CLUSTERS.flatMap((cluster) => cluster.questions.map((question) => question.id)),
  ],
): V5ProjectData {
  const file = V5ProjectsFileSchema.parse(input);
  const sorted = [...file.projects].sort((a, b) => a.order - b.order);
  const { clusters, questionCopy } = adaptDoors(sorted, {
    borrowable,
    programIds,
    reservedQuestionIds,
    clusterId: v5ProjectClusterId,
    fail,
    noun: "project",
  });
  return {
    projects: sorted.map((project) => ({
      id: project.id,
      order: project.order,
      enabled: project.enabled,
      titleHe: project.title_he,
      cardHe: project.card_he,
      coreProgramIds: project.core_program_ids,
      adjacentProgramIds: project.adjacent_program_ids,
      scenarioId: project.scenario.id,
    })),
    clusters,
    questionCopy,
    opening: { prompt: file.opening.prompt_he, helper: file.opening.helper_he },
  };
}

const PROJECT_DATA = buildV5Projects(projectsRaw);

/** The V5 projects, in display order (a fixed order: never random, never a ranking). */
export const V5_PROJECTS: readonly V5ProjectEntry[] = PROJECT_DATA.projects;
/** One engine cluster per V5 project (opening scenario + borrowed existing questions). */
export const V5_PROJECT_CLUSTERS: readonly V2Cluster[] = PROJECT_DATA.clusters;
/** The V5 project screen's headline and helper. */
export const V5_PROJECT_OPENING = PROJECT_DATA.opening;

export function getV5Project(projectId: string): V5ProjectEntry | undefined {
  return V5_PROJECTS.find((project) => project.id === projectId);
}

/** Copy of a V5 project's opening scenario (the only questions V5 authors; follow-ups are borrowed). */
export function getV5ProjectQuestionCopy(questionId: string): V2QuestionCopy | undefined {
  return PROJECT_DATA.questionCopy.get(questionId);
}

/**
 * The V5 projects as the engine's routing entries, for one selection. The selected projects come first IN SELECTION
 * ORDER (the candidate's own order decides which opener is asked first; it gives no points), then the rest in display
 * order. Being in the pool is never a score.
 */
export function v5ProjectsAsRoutingEntries(selectedProjectIds: readonly string[]): CareerProject[] {
  const position = (projectId: string) => {
    const index = selectedProjectIds.indexOf(projectId);
    return index >= 0 ? index + 1 : selectedProjectIds.length + (getV5Project(projectId)?.order ?? 0);
  };
  return V5_PROJECTS.map((project) => ({
    id: project.id,
    order: position(project.id),
    enabled: project.enabled,
    clusterId: v5ProjectClusterId(project.id),
    candidateProgramIds: [...project.coreProgramIds, ...project.adjacentProgramIds],
  }));
}
