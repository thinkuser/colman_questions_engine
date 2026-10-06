import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Layering: pure modules (engine, flow, data, analytics) must never depend on
// React, Next.js, or the UI layer. This keeps business logic testable in plain
// Node and prevents scoring/routing decisions from leaking into components.
const pureModuleRestrictions = {
  patterns: [
    { group: ["react", "react-dom", "react/*", "react-dom/*"], message: "Pure modules must not import React." },
    { group: ["next", "next/*"], message: "Pure modules must not import Next.js." },
    { group: ["@/ui", "@/ui/*", "@/app", "@/app/*"], message: "Pure modules must not import the UI layer." },
  ],
};

// Admission eligibility must never influence fit (DEC-008): only `src/data/admissions.ts` may load
// admissions content, and pure modules may not import that loader.
const admissionsRestriction = {
  group: ["@/data/admissions", "./admissions", "**/content/admissions/**"],
  message: "Admissions data is isolated from fit/scoring (DEC-008). Only admission-check features may import it.",
};

// Note: in flat config a later block replaces (not merges) rule options for matching files,
// so each block lists its complete pattern set.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      ".next-e2e-*/**",
      "playwright-report/**",
      "test-results/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["src/engine/**", "src/flow/**", "src/data/**", "src/analytics/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...pureModuleRestrictions.patterns, admissionsRestriction] }],
    },
  },
  {
    // The admissions loader is the single module allowed to read admissions content.
    files: ["src/data/admissions.ts"],
    rules: {
      "no-restricted-imports": ["error", pureModuleRestrictions],
    },
  },
  {
    // The engine is the deterministic core: it receives program vectors as arguments and may not
    // depend on the data, flow, or analytics layers.
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...pureModuleRestrictions.patterns,
            admissionsRestriction,
            {
              group: ["@/flow", "@/flow/*", "@/analytics", "@/analytics/*", "@/data", "@/data/*"],
              message: "The engine must stay independent of data, flow, and analytics.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
