import { describe, expect, it } from "vitest";
import {
  buildCareerProjects,
  buildClusters,
  CAREER_PROJECTS,
  DISCOVERY_OPENING,
  getCareerProjectCopy,
  getV2Cluster,
  PROGRAM_IDS,
  V2_CLUSTERS,
  V2_PROGRAM_IDS,
  getQuestionCopyHe,
  getV2QuestionCopy,
  QUESTION_BANK,
} from "@/data";
import { readFileSync } from "node:fs";
import projectsRaw from "@/data/content/discovery/career_projects.json";
import clustersRaw from "@/data/content/discovery/clusters.json";

type ProjectsFile = typeof projectsRaw;
/** Fixture shape: the shipped clusters have empty question lists, which TypeScript would infer as never[]. */
interface FixtureOption {
  id: string;
  label_he?: string;
  program_ids: string[];
  reality_level?: string;
}
interface FixtureQuestion {
  id: string;
  position: number;
  kind: string;
  prompt_he?: string;
  project_ids?: string[];
  reuses?: { module: string; question_id: string };
  options: FixtureOption[];
}
type ClustersFile = Omit<typeof clustersRaw, "clusters"> & {
  clusters: Array<
    Omit<(typeof clustersRaw.clusters)[number], "questions" | "precision_module"> & {
      precision_module: string | null;
      questions: FixtureQuestion[];
    }
  >;
};
const projectsFile = (): ProjectsFile => structuredClone(projectsRaw);
const clustersFile = (): ClustersFile => structuredClone(clustersRaw) as unknown as ClustersFile;

const HEBREW = /[֐-׿]/;

describe("accepted opening copy", () => {
  const spec = readFileSync("docs/V2_ALL_PROGRAMS_SPEC.md", "utf8");

  it("uses the accepted plural opening prompt and helper", () => {
    expect(DISCOVERY_OPENING.prompt).toBe("אם הייתם יכולים להצטרף מחר לאחד מהפרויקטים האלה — מה הכי מושך אתכם?");
    expect(DISCOVERY_OPENING.helper).toBe(
      "אפשר לבחור עד שניים. אל תחשבו איזה תואר “נכון” לכם — רק מה נשמע לכם מעניין לעבוד עליו.",
    );
  });

  it("uses the accepted brand disclaimer", () => {
    expect(DISCOVERY_OPENING.brandDisclaimer).toBe(
      "שמות החברות מופיעים לצורך המחשה בלבד. אין בכך כדי להעיד על שיתוף פעולה, חסות או קשר מסחרי עם החברות המוזכרות.",
    );
  });

  it("matches the spec text exactly, so docs and data cannot drift", () => {
    for (const text of [DISCOVERY_OPENING.prompt, DISCOVERY_OPENING.helper, DISCOVERY_OPENING.brandDisclaimer]) {
      expect(spec).toContain(text);
    }
    // The superseded singular wording is gone from both.
    expect(spec).not.toContain("אם היית יכול להצטרף");
    expect(JSON.stringify(projectsRaw)).not.toContain("אם היית יכול");
  });
});

describe("career projects", () => {
  it("ships the seven accepted projects, in order, all enabled", () => {
    expect(CAREER_PROJECTS.map((project) => project.id)).toEqual([
      "spotify_discover_weekly",
      "wolt_new_city",
      "tiktok_endless_scroll",
      "duolingo_persistence",
      "nike_israel_launch",
      "ai_feature_privacy",
      "apple_store_space",
    ]);
    expect(CAREER_PROJECTS.map((project) => project.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CAREER_PROJECTS.every((project) => project.enabled)).toBe(true);
  });

  it("maps each project to the accepted candidate pool", () => {
    const pools = Object.fromEntries(CAREER_PROJECTS.map((project) => [project.id, project.candidateProgramIds]));
    expect(pools).toEqual({
      spotify_discover_weekly: ["computer_science", "data_science", "management_information_systems"],
      wolt_new_city: ["business_administration", "economics_and_management", "accounting"],
      tiktok_endless_scroll: ["psychology", "behavioral_science", "economics_and_psychology"],
      duolingo_persistence: ["education", "psychology", "behavioral_science"],
      nike_israel_launch: ["communication", "communication_and_management", "business_administration"],
      ai_feature_privacy: ["law"],
      apple_store_space: ["interior_design"],
    });
  });

  it("references only valid catalog program ids, and reaches every V2 program", () => {
    const reached = new Set(CAREER_PROJECTS.flatMap((project) => project.candidateProgramIds));
    for (const id of reached) expect(V2_PROGRAM_IDS).toContain(id);
    expect([...reached].sort()).toEqual([...V2_PROGRAM_IDS].sort());
  });

  it("has Hebrew candidate copy and a neutral icon, and treats brands as text-only context", () => {
    for (const project of CAREER_PROJECTS) {
      const copy = getCareerProjectCopy(project.id)!;
      expect(copy.title).toMatch(HEBREW);
      expect(copy.scenario).toMatch(HEBREW);
      expect(copy.icon).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(copy.icon).not.toMatch(/spotify|wolt|tiktok|duolingo|nike|apple|logo/i);
    }
    expect(getCareerProjectCopy("ai_feature_privacy")!.brandName).toBeNull();
    expect(DISCOVERY_OPENING.prompt).toMatch(HEBREW);
    expect(DISCOVERY_OPENING.helper).toContain("עד שניים");
    expect(DISCOVERY_OPENING.brandDisclaimer).toMatch(HEBREW);
  });

  it("carries no score, weight, points or logo fields (projects only route)", () => {
    const json = JSON.stringify(projectsRaw.projects);
    expect(json).not.toMatch(/score|weight|points|logo|fit/i);
    for (const project of CAREER_PROJECTS) {
      for (const value of Object.values(project))
        expect(typeof value === "number" && value !== project.order).toBe(false);
    }
  });

  it("keeps every project's pool inside its cluster's core programs", () => {
    for (const project of CAREER_PROJECTS) {
      const cluster = getV2Cluster(project.clusterId)!;
      for (const programId of project.candidateProgramIds) expect(cluster.programIds).toContain(programId);
    }
  });

  describe("validation", () => {
    const build = (file: unknown) => buildCareerProjects(file, V2_CLUSTERS, V2_PROGRAM_IDS);

    it("rejects unknown programs and clusters", () => {
      const program = projectsFile();
      program.projects[0]!.candidate_program_ids = ["computer_science", "astronomy"];
      expect(() => build(program)).toThrow(/unknown program "astronomy"/);

      const cluster = projectsFile();
      cluster.projects[0]!.cluster_id = "nope";
      expect(() => build(cluster)).toThrow(/unknown cluster "nope"/);
    });

    it("rejects a pool program outside the project's cluster", () => {
      const file = projectsFile();
      file.projects[0]!.candidate_program_ids = ["computer_science", "law"];
      expect(() => build(file)).toThrow(/not a core program of cluster "tech"/);
    });

    it("rejects duplicate ids, broken ordering, empty pools and score fields", () => {
      const dup = projectsFile();
      dup.projects[1]!.id = dup.projects[0]!.id;
      expect(() => build(dup)).toThrow(/duplicate project ids/);

      const order = projectsFile();
      order.projects[1]!.order = 9;
      expect(() => build(order)).toThrow(/order must run 1..n/);

      const empty = projectsFile();
      empty.projects[0]!.candidate_program_ids = [];
      expect(() => build(empty)).toThrow();

      const scored = projectsFile();
      (scored.projects[0] as Record<string, unknown>)["fit_points"] = 1;
      expect(() => build(scored)).toThrow();

      const logo = projectsFile();
      (logo.projects[0] as Record<string, unknown>)["logo_url"] = "https://example.com/logo.png";
      expect(() => build(logo)).toThrow();
    });

    it("rejects a catalog program that no enabled project reaches", () => {
      const file = projectsFile();
      file.projects.find((project) => project.id === "ai_feature_privacy")!.enabled = false;
      expect(() => build(file)).toThrow(/"law" is not reachable/);
    });
  });
});

describe("question clusters", () => {
  it("defines the six V2 clusters over valid programs", () => {
    expect(V2_CLUSTERS.map((cluster) => cluster.id)).toEqual([
      "tech",
      "business",
      "people",
      "communication",
      "law",
      "interior_design",
    ]);
    for (const cluster of V2_CLUSTERS) {
      for (const id of [...cluster.programIds, ...cluster.adjacentProgramIds]) expect(V2_PROGRAM_IDS).toContain(id);
      expect(cluster.maxQuestions).toBe(7);
    }
  });

  it("routes the tech cluster to the preserved V1 precision module over exactly the V1 pilot programs", () => {
    const tech = getV2Cluster("tech")!;
    expect(tech.precisionModule).toBe("v1_tech");
    expect([...tech.programIds].sort()).toEqual([...PROGRAM_IDS].sort());
    for (const cluster of V2_CLUSTERS.filter((c) => c.id !== "tech")) expect(cluster.precisionModule).toBeNull();
  });

  it("ships no non-tech question content yet (THI-15)", () => {
    for (const cluster of V2_CLUSTERS.filter((c) => c.id !== "tech")) expect(cluster.questions).toEqual([]);
  });

  it("holds only the Spotify opener in the tech cluster, reusing V1 Q1 with V1's own options and copy (THI-14)", () => {
    const tech = getV2Cluster("tech")!;
    expect(tech.questions).toHaveLength(1);
    const t1 = tech.questions[0]!;
    expect(t1).toMatchObject({ id: "T1", position: 1, kind: "scenario", projectIds: ["spotify_discover_weekly"] });
    expect(t1.reuses).toEqual({ moduleId: "v1_tech", questionId: "Q1" });
    expect(t1.options.map((o) => o.id)).toEqual(
      QUESTION_BANK.questions.find((q) => q.id === "Q1")!.options.map((o) => o.id),
    );
    expect(Object.fromEntries(t1.options.map((o) => [o.id, o.programIds]))).toEqual({
      A: ["computer_science"],
      B: ["data_science"],
      C: ["management_information_systems"],
    });
    // No duplicated candidate copy: the V2 question shows exactly V1 Q1's Hebrew copy.
    expect(getV2QuestionCopy("T1")).toEqual(getQuestionCopyHe("Q1"));
    expect(JSON.stringify(clustersRaw)).not.toMatch(/prompt_he|label_he/);
  });
});

/** A fixture shaped like the approved V2 Law cluster (docs/V2_QUESTION_BANK.md, L1-L4). */
function lawClusterFixture(): ClustersFile {
  const file = clustersFile();
  const law = file.clusters.find((cluster) => cluster.id === "law")!;
  law.questions = [
    {
      id: "L1",
      position: 1,
      kind: "scenario",
      prompt_he: "חברת AI רוצה להשיק פיצ'ר שמשתמש בתוכן ובמידע אישי של המשתמשים. מה הכי היית רוצה לפתור?",
      options: [
        { id: "A", label_he: "להבין מה מותר ומה אסור", program_ids: ["law"] },
        { id: "B", label_he: "להחליט אם בכלל נכון עסקית להשיק", program_ids: ["business_administration"] },
        // A shared adjacent signal: "Communication / Communication + Management".
        {
          id: "C",
          label_he: "להסביר למשתמשים מה קורה עם המידע",
          program_ids: ["communication", "communication_and_management"],
        },
      ],
    },
    {
      id: "L2",
      position: 2,
      kind: "scenario",
      prompt_he: "יוצר טוען שמערכת AI השתמשה ביצירות שלו בלי רשות. מה הכי מסקרן אותך?",
      options: [
        { id: "A", label_he: "לבנות טיעון מי צודק", program_ids: ["law"] },
        { id: "B", label_he: "למצוא פתרון מסחרי", program_ids: ["business_administration"] },
        { id: "C", label_he: "לעצב את המוצר אחרת", program_ids: ["management_information_systems"] },
      ],
    },
    {
      id: "L3",
      position: 3,
      kind: "focus",
      prompt_he: "איזה יום נשמע לך יותר מעניין?",
      options: [
        { id: "A", label_he: "לקרוא תיק מורכב", program_ids: ["law"] },
        { id: "B", label_he: "לשבת עם הנהלה", program_ids: ["business_administration"] },
        { id: "C", label_he: "לעבוד על קמפיין", program_ids: ["communication"] },
      ],
    },
    {
      id: "L4",
      position: 4,
      kind: "reality_check",
      prompt_he: "בעבודה משפטית יש הרבה קריאה, כתיבה ופרטים קטנים. איך זה נשמע לך?",
      options: [
        { id: "A", label_he: "דווקא החלק הזה מושך אותי", program_ids: [], reality_level: "positive" },
        { id: "B", label_he: "בסדר מבחינתי אם הנושא מעניין", program_ids: [], reality_level: "neutral" },
        { id: "C", label_he: "זה נשמע לי די מתיש", program_ids: [], reality_level: "negative" },
      ],
    },
  ];
  return file;
}

/** A generic cluster carrying Q1-Q7: the "later precision" questions are just more data. */
function sevenQuestionFixture(count = 7): ClustersFile {
  const file = clustersFile();
  const business = file.clusters.find((cluster) => cluster.id === "business")!;
  business.questions = Array.from({ length: count }, (_, index) => ({
    id: `B${index + 1}`,
    position: index + 1,
    kind: index === count - 1 && count > 4 ? "tiebreaker" : index === 3 ? "focus" : "scenario",
    prompt_he: `שאלה ${index + 1}`,
    options: [
      { id: "A", label_he: "א", program_ids: ["business_administration"] },
      { id: "B", label_he: "ב", program_ids: ["economics_and_management"] },
      { id: "C", label_he: "ג", program_ids: ["accounting"] },
    ],
  }));
  return file;
}

describe("question schema extensibility", () => {
  it("represents the approved spec shapes: multi-program options, adjacent signals and reality checks", () => {
    const { clusters, questionCopy } = buildClusters(lawClusterFixture());
    const law = clusters.find((cluster) => cluster.id === "law")!;
    expect(law.questions.map((q) => q.id)).toEqual(["L1", "L2", "L3", "L4"]);
    expect(law.questions[0]!.options[2]!.programIds).toEqual(["communication", "communication_and_management"]);
    const reality = law.questions[3]!;
    expect(reality.kind).toBe("reality_check");
    expect(reality.options.every((option) => option.programIds.length === 0 && option.realityLevel !== null)).toBe(
      true,
    );
    expect(questionCopy.get("L1")!.prompt).toMatch(HEBREW);
  });

  it("accepts Q1-Q4 today and Q5-Q7 later without any schema change", () => {
    for (const count of [4, 5, 6, 7]) {
      const business = buildClusters(sevenQuestionFixture(count)).clusters.find((c) => c.id === "business")!;
      expect(business.questions.map((q) => q.position)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    }
  });

  it("orders questions by position, whatever the file order", () => {
    const file = sevenQuestionFixture(5);
    const business = file.clusters.find((cluster) => cluster.id === "business")!;
    business.questions.reverse();
    const built = buildClusters(file).clusters.find((c) => c.id === "business")!;
    expect(built.questions.map((q) => q.id)).toEqual(["B1", "B2", "B3", "B4", "B5"]);
  });

  it("rejects gaps, repeats and more questions than the cluster allows", () => {
    const gap = sevenQuestionFixture(4);
    gap.clusters.find((c) => c.id === "business")!.questions[3]!.position = 6;
    expect(() => buildClusters(gap)).toThrow(/positions must run 1..n/);

    const tooMany = sevenQuestionFixture(7);
    tooMany.clusters.find((c) => c.id === "business")!.max_questions = 6;
    expect(() => buildClusters(tooMany)).toThrow(/max_questions is 6/);
  });

  it("rejects answers pointing outside the cluster and its neighbours", () => {
    const file = lawClusterFixture();
    file.clusters.find((c) => c.id === "law")!.questions[0]!.options[0]!.program_ids = ["interior_design"];
    expect(() => buildClusters(file)).toThrow(/outside the cluster and its neighbours/);
  });

  it("rejects a reality check that points to a program (reality checks never rank)", () => {
    const file = lawClusterFixture();
    const reality = file.clusters.find((c) => c.id === "law")!.questions[3]!;
    reality.options[0]!.program_ids = ["law"];
    expect(() => buildClusters(file)).toThrow(/reality-check answers never point to a program/);
  });

  it("rejects a ranking question that cannot distinguish two programs, and weights in the data", () => {
    const single = sevenQuestionFixture(4);
    for (const option of single.clusters.find((c) => c.id === "business")!.questions[0]!.options) {
      option.program_ids = ["accounting"];
    }
    expect(() => buildClusters(single)).toThrow(/at least two programs/);

    const weighted = sevenQuestionFixture(4);
    (weighted.clusters.find((c) => c.id === "business")!.questions[0] as unknown as Record<string, unknown>)["weight"] =
      3;
    expect(() => buildClusters(weighted)).toThrow();
  });

  it("rejects a v1_tech precision module over anything but the V1 pilot programs", () => {
    const file = clustersFile();
    file.clusters.find((c) => c.id === "business")!.precision_module = "v1_tech";
    expect(() => buildClusters(file)).toThrow(/v1_tech precision module covers exactly the V1 pilot programs/);
  });

  it("rejects duplicate question ids across clusters", () => {
    const file = lawClusterFixture();
    const business = file.clusters.find((c) => c.id === "business")!;
    business.questions = [
      {
        id: "L1",
        position: 1,
        kind: "scenario",
        prompt_he: "שאלה",
        options: [
          { id: "A", label_he: "א", program_ids: ["business_administration"] },
          { id: "B", label_he: "ב", program_ids: ["accounting"] },
        ],
      },
    ];
    expect(() => buildClusters(file)).toThrow(/duplicate question id "L1"/);
  });
});

describe("THI-14 schema additions: project applicability and reused precision questions", () => {
  const techOf = (file: ClustersFile) => file.clusters.find((c) => c.id === "tech")!;
  const businessOf = (file: ClustersFile) => file.clusters.find((c) => c.id === "business")!;
  const generalQuestion = (id: string, extra: Partial<FixtureQuestion> = {}): FixtureQuestion => ({
    id,
    position: 1,
    kind: "scenario",
    prompt_he: "שאלה",
    options: [
      { id: "A", label_he: "א", program_ids: ["business_administration"] },
      { id: "B", label_he: "ב", program_ids: ["accounting"] },
    ],
    ...extra,
  });

  it("rejects a reused question that also carries its own copy (no duplicated candidate copy)", () => {
    const file = clustersFile();
    techOf(file).questions[0]!.prompt_he = "עותק כפול";
    expect(() => buildClusters(file)).toThrow(/must not carry its own copy/);
  });

  it("rejects reusing an unknown precision question or with different options", () => {
    const unknown = clustersFile();
    techOf(unknown).questions[0]!.reuses = { module: "v1_tech", question_id: "Q99" };
    expect(() => buildClusters(unknown)).toThrow(/reuses unknown question "Q99"/);

    const options = clustersFile();
    techOf(options).questions[0]!.options.pop();
    expect(() => buildClusters(options)).toThrow(/must list exactly the options of "Q1"/);
  });

  it("rejects reusing a module question outside that module's cluster", () => {
    const file = clustersFile();
    businessOf(file).questions = [
      generalQuestion("B1", {
        prompt_he: undefined,
        options: [
          { id: "A", program_ids: ["business_administration"] },
          { id: "B", program_ids: ["accounting"] },
          { id: "C", program_ids: ["economics_and_management"] },
        ],
        reuses: { module: "v1_tech", question_id: "Q1" },
      }),
    ];
    expect(() => buildClusters(file)).toThrow(/outside that module's cluster/);
  });

  it("requires copy on authored questions", () => {
    const file = clustersFile();
    businessOf(file).questions = [generalQuestion("B1", { prompt_he: undefined })];
    expect(() => buildClusters(file)).toThrow(/needs prompt_he/);
  });

  it("rejects V2 question ids that collide with precision-module question ids (they share one answer list)", () => {
    const file = clustersFile();
    businessOf(file).questions = [generalQuestion("Q2")];
    expect(() => buildClusters(file)).toThrow(/collides with a precision-module question id/);
  });

  it("allows project applicability only on scenario questions, for projects of the same cluster", () => {
    const notScenario = clustersFile();
    businessOf(notScenario).questions = [generalQuestion("B1", { kind: "focus", project_ids: ["wolt_new_city"] })];
    expect(() => buildClusters(notScenario)).toThrow(/only scenario questions name projects/);

    const otherCluster = clustersFile();
    businessOf(otherCluster).questions = [generalQuestion("B1", { project_ids: ["nike_israel_launch"] })];
    const built = buildClusters(otherCluster).clusters;
    expect(() => buildCareerProjects(projectsRaw, built, V2_PROGRAM_IDS)).toThrow(
      /names project "nike_israel_launch" of another cluster/,
    );

    const unknown = clustersFile();
    businessOf(unknown).questions = [generalQuestion("B1", { project_ids: ["zara_launch"] })];
    expect(() => buildCareerProjects(projectsRaw, buildClusters(unknown).clusters, V2_PROGRAM_IDS)).toThrow(
      /unknown project "zara_launch"/,
    );
  });
});
