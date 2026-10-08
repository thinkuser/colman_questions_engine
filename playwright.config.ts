import { defineConfig } from "@playwright/test";

/**
 * Pilot acceptance E2E (THI-12): a small suite against the real, production-built Next.js app.
 * Two builds are served: one with the advisor CTA configured (NEXT_PUBLIC_ADVISOR_URL is inlined at build time)
 * and one without. Functional specs run at a mobile viewport; layout specs run at 320, 390 and desktop widths.
 */
const ADVISOR_URL = "https://example.org/advisor";
const WITH_ADVISOR = { port: 3210, distDir: ".next-e2e-advisor" };
const WITHOUT_ADVISOR = { port: 3211, distDir: ".next-e2e-plain" };

const server = (target: typeof WITH_ADVISOR, advisorUrl: string) => ({
  command: "pnpm exec next build && pnpm exec next start -p " + target.port,
  url: `http://localhost:${target.port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 240_000,
  env: { NEXT_DIST_DIR: target.distDir, NEXT_PUBLIC_ADVISOR_URL: advisorUrl },
});

const mobile = { viewport: { width: 390, height: 844 }, locale: "he-IL" };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${WITH_ADVISOR.port}`, ...mobile, trace: "off" },
  webServer: [server(WITH_ADVISOR, ADVISOR_URL), server(WITHOUT_ADVISOR, "")],
  projects: [
    {
      name: "functional",
      testMatch: /(personas|navigation|analytics|links-a11y|discovery|discovery-lead|v3|v2-baseline|v4|v5)\.spec\.ts/,
    },
    { name: "layout-320", testMatch: /layout\.spec\.ts/, use: { viewport: { width: 320, height: 640 } } },
    { name: "layout-390", testMatch: /layout\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
    { name: "layout-desktop", testMatch: /layout\.spec\.ts/, use: { viewport: { width: 1280, height: 900 } } },
    {
      name: "no-advisor",
      testMatch: /noadvisor\.spec\.ts/,
      use: { baseURL: `http://localhost:${WITHOUT_ADVISOR.port}` },
    },
  ],
});
