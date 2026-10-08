/**
 * V3 world-led acceptance personas. One data set drives the engine-level test (tests/flow/v3Worlds.test.ts) and the
 * browser suite (e2e/v3*.spec.ts). A persona picks worlds (in this order), answers scripted questions as scripted and
 * every other question with its first preferred option that is offered (else the first option).
 */

export interface V3Persona {
  id: string;
  label: string;
  /** Selected worlds, in selection order. */
  worlds: string[];
  script: Record<string, string>;
  prefer: string[];
  expect: {
    kind: "recommended" | "near_tie" | "insufficient_positive_evidence" | "precision";
    /** Generic: programs shown (V3 order). Precision: the V1 top program. */
    programs: string[];
    precision: boolean;
  };
}

export function v3PersonaChoice(persona: V3Persona, questionId: string, offered: readonly string[]): string {
  const scripted = persona.script[questionId];
  if (scripted !== undefined && offered.includes(scripted)) return scripted;
  return persona.prefer.find((option) => offered.includes(option)) ?? offered[0]!;
}

export const V3_PERSONAS: V3Persona[] = [
  {
    id: "tech_build",
    label: "Technology & Data: building the system",
    worlds: ["technology_data"],
    script: { WT1: "A" },
    prefer: ["A", "cs", "1"],
    expect: { kind: "precision", programs: ["computer_science"], precision: true },
  },
  {
    id: "business_decide",
    label: "Business & Markets: deciding the move",
    worlds: ["business_markets"],
    script: { WB1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["business_administration"], precision: false },
  },
  {
    id: "business_markets_tie",
    label: "Business & Markets: torn between deciding and analysing the market",
    worlds: ["business_markets"],
    script: { WB1: "A", B2: "B", B3: "A", B4: "B", B5: "neither" },
    prefer: ["A"],
    expect: { kind: "near_tie", programs: ["business_administration", "economics_and_management"], precision: false },
  },
  {
    id: "communication_story",
    label: "Communication & Influence: telling the story",
    worlds: ["communication_influence"],
    script: { WC1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["communication"], precision: false },
  },
  {
    id: "communication_tie",
    label: "Communication & Influence: story vs measurable strategy",
    worlds: ["communication_influence"],
    script: { WC1: "A", C2: "B", C3: "A", C4: "B", C5: "neither" },
    prefer: ["A"],
    expect: { kind: "near_tie", programs: ["communication", "communication_and_management"], precision: false },
  },
  {
    id: "people_psychology",
    label: "People & Psychology: the individual",
    worlds: ["people_psychology"],
    script: { WP1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["psychology"], precision: false },
  },
  {
    id: "people_behavioral",
    label: "People & Psychology: the group and the social environment",
    worlds: ["people_psychology"],
    script: { WP1: "B" },
    prefer: ["B"],
    expect: { kind: "recommended", programs: ["behavioral_science"], precision: false },
  },
  {
    id: "hr_systems",
    label: "People in Organizations: systems and processes",
    worlds: ["people_organizations"],
    script: { WO1: "D" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["management_information_systems"], precision: false },
  },
  {
    id: "education",
    label: "Education & Future Generations: designing learning",
    worlds: ["education_future"],
    script: { WE1: "A", P3: "D", P4: "C", P5: "C", P6: "C" },
    prefer: ["C"],
    expect: { kind: "recommended", programs: ["education"], precision: false },
  },
  {
    id: "law",
    label: "Law & Justice: the legal argument",
    worlds: ["law_justice"],
    script: { WL1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["law"], precision: false },
  },
  {
    id: "accounting",
    label: "Finance & Accounting: finding the gap",
    worlds: ["finance_accounting"],
    script: { WF1: "A" },
    prefer: ["C"],
    expect: { kind: "recommended", programs: ["accounting"], precision: false },
  },
  {
    id: "design",
    label: "Design & Spaces: planning the space",
    worlds: ["design_spaces"],
    script: { WD1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["interior_design"], precision: false },
  },
  {
    id: "communication_then_people",
    label: "Two worlds: Communication & Influence, then People & Psychology",
    worlds: ["communication_influence", "people_psychology"],
    script: { WC1: "A", WP1: "A" },
    prefer: ["A"],
    expect: { kind: "recommended", programs: ["communication", "psychology"], precision: false },
  },
  {
    id: "insufficient",
    label: "Business & Markets: nothing really fits",
    worlds: ["business_markets"],
    script: { WB1: "A" },
    prefer: ["neither"],
    expect: { kind: "insufficient_positive_evidence", programs: ["business_administration"], precision: false },
  },
];
