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

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"],
  },
  {
    files: ["src/engine/**", "src/flow/**", "src/data/**", "src/analytics/**"],
    rules: {
      "no-restricted-imports": ["error", pureModuleRestrictions],
    },
  },
  {
    // The engine is the deterministic core: it may not depend on the flow or analytics layers either.
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...pureModuleRestrictions.patterns,
            {
              group: ["@/flow", "@/flow/*", "@/analytics", "@/analytics/*"],
              message: "The engine must stay independent of flow and analytics.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
