/**
 * V2 acceptance personas (THI-16): plain data shared by the engine-level test (tests/flow/v2Personas.test.ts) and the
 * browser suite (e2e/discovery.spec.ts), so the UI is exercised with exactly the journeys the engine is verified on.
 * No imports on purpose: Playwright and Vitest both load this file.
 *
 * `script` answers named questions; any other question takes the first offered option of `prefer`, else the first
 * option shown. Expectations describe the result a candidate should see, never scores.
 */

export interface V2Persona {
  id: string;
  label: string;
  projects: string[];
  script: Record<string, string>;
  prefer: string[];
  expect: {
    /** `data-result-kind` of the result root. */
    kind: "recommended" | "near_tie" | "insufficient_positive_evidence" | "precision";
    /** Programs shown as directions (generic) or the V1 top program (precision), in display order. */
    programs: string[];
    /** Reality-check questions the journey is expected to ask. */
    realityChecks: string[];
    /** Whether the journey is expected to hand off to the V1 Tech module. */
    precision: boolean;
  };
}

const WOLT = "wolt_new_city";
const SPOTIFY = "spotify_discover_weekly";
const TIKTOK = "tiktok_endless_scroll";
const DUOLINGO = "duolingo_persistence";
const NIKE = "nike_israel_launch";
const AI = "ai_feature_privacy";
const APPLE = "apple_store_space";

export const V2_PERSONAS: V2Persona[] = [
  {
    id: "focused_tech",
    label: "Focused Tech (Spotify alone, V1 persona A)",
    projects: [SPOTIFY],
    script: { Q1: "A", Q2: "A", Q3: "5", "CSDS-1": "cs", "CSDS-2": "cs" },
    prefer: ["cs", "ds", "mis"],
    expect: { kind: "precision", programs: ["computer_science"], realityChecks: [], precision: true },
  },
  {
    id: "tech_cross_cluster",
    label: "Tech cross-cluster (Wolt + Spotify, settles on Data Science)",
    projects: [WOLT, SPOTIFY],
    script: { T1: "B", B1: "A", "focus:business_administration|data_science:0": "B", Q2: "B", Q3: "4" },
    prefer: ["ds", "cs", "mis"],
    expect: { kind: "precision", programs: ["data_science"], realityChecks: [], precision: true },
  },
  {
    id: "tech_cross_cluster_longest",
    label: "Longest Tech cross-cluster path (three neutral generated focus rounds, then a V1 tie-breaker)",
    projects: [WOLT, SPOTIFY],
    script: {
      T1: "A",
      B1: "A",
      "focus:business_administration|computer_science:0": "neither",
      "focus:business_administration|computer_science:1": "neither",
      "focus:business_administration|computer_science:2": "B",
      Q2: "A",
      Q3: "1",
      "CSDS-1": "cs",
      "CSDS-2": "ds",
      "CSDS-3": "ds",
      "TB-CSDS": "cs",
    },
    prefer: ["cs"],
    expect: { kind: "precision", programs: ["computer_science"], realityChecks: [], precision: true },
  },
  {
    id: "business_vs_economics",
    label: "Business vs Economics ambiguity (Wolt) → near tie",
    projects: [WOLT],
    script: { B1: "A", B2: "B", B3: "A", B4: "B", B5: "neither" },
    prefer: [],
    expect: {
      kind: "near_tie",
      programs: ["business_administration", "economics_and_management"],
      realityChecks: [],
      precision: false,
    },
  },
  {
    id: "accounting",
    label: "Accounting-focused (Wolt) → Accounting + its reality check",
    projects: [WOLT],
    script: { B1: "C", B2: "C", B3: "C", BR1: "C" },
    prefer: [],
    expect: { kind: "recommended", programs: ["accounting"], realityChecks: ["BR1"], precision: false },
  },
  {
    id: "psychology_vs_behavioral",
    label: "Psychology vs Behavioral Science ambiguity (TikTok) → near tie",
    projects: [TIKTOK],
    script: { P1: "A", P3: "B", P4: "A", P5: "B", P6: "neither", PR1: "B" },
    prefer: [],
    expect: {
      kind: "near_tie",
      programs: ["psychology", "behavioral_science"],
      realityChecks: ["PR1"],
      precision: false,
    },
  },
  {
    id: "education",
    label: "Education-focused (Duolingo) → Education + its reality check",
    projects: [DUOLINGO],
    script: { P2: "B", P3: "D", P4: "C", PR2: "A" },
    prefer: [],
    expect: { kind: "recommended", programs: ["education"], realityChecks: ["PR2"], precision: false },
  },
  {
    id: "communication_vs_cm",
    label: "Communication vs Communication + Management ambiguity (Nike) → near tie",
    projects: [NIKE],
    script: { C1: "A", C2: "B", C3: "A", C4: "B", C5: "neither", CR1: "B" },
    prefer: [],
    expect: {
      kind: "near_tie",
      programs: ["communication", "communication_and_management"],
      realityChecks: ["CR1"],
      precision: false,
    },
  },
  {
    id: "law",
    label: "Law-focused (AI project) → Law + its reality check",
    projects: [AI],
    script: { L1: "A", L2: "A", L3: "A", L4: "A" },
    prefer: [],
    expect: { kind: "recommended", programs: ["law"], realityChecks: ["L4"], precision: false },
  },
  {
    id: "interior_design",
    label: "Interior Design-focused (Apple Store) → Interior Design + its reality check",
    projects: [APPLE],
    script: { D1: "A", D2: "A", D3: "A", D4: "C" },
    prefer: [],
    expect: { kind: "recommended", programs: ["interior_design"], realityChecks: ["D4"], precision: false },
  },
  {
    id: "tiktok_nike",
    label: "TikTok + Nike cross-cluster → generated focus → Communication + Management",
    projects: [TIKTOK, NIKE],
    script: { P1: "B", C1: "B", "focus:behavioral_science|communication_and_management:0": "B", CR1: "A" },
    prefer: [],
    expect: {
      kind: "recommended",
      programs: ["communication_and_management", "behavioral_science"],
      realityChecks: ["CR1"],
      precision: false,
    },
  },
  {
    id: "insufficient",
    label: "One answer, then none of the options fits (Wolt) → insufficient positive evidence",
    projects: [WOLT],
    script: { B1: "A" },
    prefer: ["neither"],
    expect: {
      kind: "insufficient_positive_evidence",
      programs: ["business_administration"],
      realityChecks: [],
      precision: false,
    },
  },
];

/** The option a persona picks for a question that offers `offered`. */
export function personaChoice(persona: V2Persona, questionId: string, offered: readonly string[]): string {
  const scripted = persona.script[questionId];
  if (scripted !== undefined && offered.includes(scripted)) return scripted;
  return persona.prefer.find((option) => offered.includes(option)) ?? offered[0]!;
}
