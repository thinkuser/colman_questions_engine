import type { CSSProperties } from "react";

/**
 * Visual-only presentation metadata for the career-project cards (THI-16 review pass).
 *
 * Each project's company NAME is shown in a colour associated with that company. This is decoration: it is keyed by
 * project id, never inferred from the company string, and it cannot affect routing, scoring, program mapping or
 * analytics. No logos, marks or images are used or recreated, and nothing here implies endorsement or partnership
 * (the brand disclaimer stays on the page). The actual colours are CSS variables in `globals.css` (`--tone-*`), where
 * the text variants are darkened to pass 4.5:1 contrast and the icon variants only colour decorative graphics.
 */

export type BrandTone = "spotify" | "wolt" | "duolingo" | "tiktok" | "nike" | "apple" | "ai";

export const PROJECT_BRAND_TONE: Readonly<Record<string, BrandTone>> = {
  spotify_discover_weekly: "spotify",
  wolt_new_city: "wolt",
  tiktok_endless_scroll: "tiktok",
  duolingo_persistence: "duolingo",
  nike_israel_launch: "nike",
  ai_feature_privacy: "ai",
  apple_store_space: "apple",
};

/** Unknown projects fall back to the COLMAN blue, so a new project never renders unstyled. */
export function toneStyle(projectId: string): CSSProperties {
  const tone = PROJECT_BRAND_TONE[projectId];
  const style: Record<string, string> = tone
    ? { "--tone": `var(--tone-${tone})`, "--tone-icon": `var(--tone-${tone}-icon)` }
    : { "--tone": "var(--colman-blue)", "--tone-icon": "var(--colman-blue)" };
  return style as CSSProperties;
}
