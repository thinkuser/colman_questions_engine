import { CAREER_PROJECTS, getV2Cluster } from "@/data";
import {
  nextV2Step,
  type ProgramId,
  type RecordedAnswer,
  type V2AnswerOption,
  type V2Cluster,
  type V2Question,
  type V2Step,
} from "@/engine";
import { V1_TECH_PRECISION_MODULE } from "@/flow";

/**
 * Synthetic V2 fixtures for THI-14 routing tests. Production content for the non-tech clusters is THI-15, so these
 * clusters only mimic the approved shapes (docs/V2_QUESTION_BANK.md). The tech cluster and the V1 precision module are
 * the real production ones.
 */

export const CS = "computer_science";
export const DS = "data_science";
export const MIS = "management_information_systems";
export const BA = "business_administration";
export const ECON = "economics_and_management";
export const ACC = "accounting";
export const PSY = "psychology";
export const BEH = "behavioral_science";
export const EDU = "education";
export const ECONPSY = "economics_and_psychology";
export const COMM = "communication";
export const COMMGMT = "communication_and_management";
export const LAW = "law";
export const INT = "interior_design";

const option = (id: string, programIds: ProgramId[] = []): V2AnswerOption => ({ id, programIds, realityLevel: null });
const neither = option("neither");
const reality = (id: string, level: "positive" | "neutral" | "negative"): V2AnswerOption => ({
  id,
  programIds: [],
  realityLevel: level,
});

function question(
  id: string,
  position: number,
  kind: V2Question["kind"],
  options: V2AnswerOption[],
  projectIds: string[] | null = null,
): V2Question {
  return { id, position, kind, projectIds, reuses: null, options };
}

function cluster(id: string, programIds: ProgramId[], adjacent: ProgramId[], questions: V2Question[]): V2Cluster {
  return { id, programIds, adjacentProgramIds: adjacent, precisionModule: null, maxQuestions: 7, questions };
}

const businessOptions = () => [option("A", [BA]), option("B", [ECON]), option("C", [ACC])];

export const FIXTURE_CLUSTERS: readonly V2Cluster[] = [
  getV2Cluster("tech")!,
  cluster(
    "business",
    [BA, ECON, ACC],
    [],
    [
      question("B1", 1, "scenario", businessOptions(), ["wolt_new_city"]),
      question("B2", 2, "scenario", [...businessOptions(), neither]),
      question("B3", 3, "scenario", [...businessOptions(), neither]),
      question("B4", 4, "focus", [...businessOptions(), neither]),
    ],
  ),
  cluster(
    "people",
    [PSY, BEH, EDU, ECONPSY],
    [],
    [
      question(
        "P1",
        1,
        "scenario",
        [option("A", [PSY]), option("B", [BEH]), option("C", [ECONPSY])],
        ["tiktok_endless_scroll"],
      ),
      question(
        "P2",
        2,
        "scenario",
        [option("A", [PSY]), option("B", [EDU]), option("C", [BEH])],
        ["duolingo_persistence"],
      ),
    ],
  ),
  cluster(
    "communication",
    [COMM, COMMGMT, BA],
    [],
    [
      question(
        "C1",
        1,
        "scenario",
        [option("A", [COMM]), option("B", [COMMGMT]), option("C", [BA])],
        ["nike_israel_launch"],
      ),
    ],
  ),
  cluster(
    "law",
    [LAW],
    [BA, COMM, COMMGMT, MIS],
    [
      question(
        "L1",
        1,
        "scenario",
        [option("A", [LAW]), option("B", [BA]), option("C", [COMM, COMMGMT])],
        ["ai_feature_privacy"],
      ),
      question("L2", 2, "scenario", [option("A", [LAW]), option("B", [BA]), option("C", [MIS])]),
      question("L3", 3, "focus", [option("A", [LAW]), option("B", [BA]), option("C", [COMM])]),
      question("L4", 4, "reality_check", [reality("A", "positive"), reality("B", "neutral"), reality("C", "negative")]),
    ],
  ),
  cluster(
    "interior_design",
    [INT],
    [COMM, BA, BEH, DS],
    [
      question(
        "D1",
        1,
        "scenario",
        [option("A", [INT]), option("B", [COMM]), option("C", [BA])],
        ["apple_store_space"],
      ),
      question("D2", 2, "scenario", [option("A", [INT]), option("B", [COMM]), option("C", [BEH, DS])]),
      question("D3", 3, "focus", [option("A", [INT]), option("B", [COMM]), option("C", [BA])]),
      question("D4", 4, "reality_check", [reality("A", "positive"), reality("B", "neutral"), reality("C", "negative")]),
    ],
  ),
];

/** Two fixture "day at work" statements per program (real statements are THI-15 content). */
export const FIXTURE_STATEMENTS: Readonly<Record<ProgramId, readonly string[]>> = Object.fromEntries(
  [CS, DS, MIS, BA, ECON, ACC, PSY, BEH, EDU, ECONPSY, COMM, COMMGMT, LAW, INT].map((id) => [
    id,
    [`${id} statement 1`, `${id} statement 2`],
  ]),
);

export function route(
  selectedProjectIds: string[],
  answers: RecordedAnswer[],
  options: { clusters?: readonly V2Cluster[]; statements?: Readonly<Record<ProgramId, readonly string[]>> } = {},
): V2Step {
  return nextV2Step({
    projects: CAREER_PROJECTS,
    clusters: options.clusters ?? FIXTURE_CLUSTERS,
    workStatements: options.statements ?? FIXTURE_STATEMENTS,
    precisionModules: [V1_TECH_PRECISION_MODULE],
    selectedProjectIds,
    answers,
  });
}

export const answer = (questionId: string, answerId: string): RecordedAnswer => ({ questionId, answerId });

/** Id of the question a step asks (generic or precision), or null. */
export function askedId(step: V2Step): string | null {
  if (step.status !== "ask") return null;
  return step.mode === "precision" ? step.question.id : step.question.question.id;
}

/** Answer each asked question with `choose` until the flow is no longer asking; returns every step. */
export function play(
  selectedProjectIds: string[],
  choose: (step: Extract<V2Step, { status: "ask" }>) => string,
  options: Parameters<typeof route>[2] = {},
): { steps: V2Step[]; answers: RecordedAnswer[]; final: V2Step } {
  const answers: RecordedAnswer[] = [];
  const steps: V2Step[] = [];
  for (let guard = 0; guard < 30; guard++) {
    const step = route(selectedProjectIds, answers, options);
    steps.push(step);
    if (step.status !== "ask") return { steps, answers, final: step };
    answers.push(answer(askedId(step)!, choose(step)));
  }
  throw new Error("V2 flow did not terminate");
}

/** A chooser that follows a fixed script of answer ids, keyed by question id. */
export function script(answersByQuestion: Record<string, string>) {
  return (step: Extract<V2Step, { status: "ask" }>) => {
    const id = askedId(step)!;
    const choice = answersByQuestion[id];
    if (choice === undefined) throw new Error(`no scripted answer for ${id}`);
    return choice;
  };
}
