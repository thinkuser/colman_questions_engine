/**
 * Neutral, generic line icons for the career-project cards. They are illustrations of the situation (a playlist, a
 * city, a scrolling phone...), never brand marks: no logos and nothing that suggests an official collaboration.
 * Decorative only (`aria-hidden`): the card's text carries the meaning.
 */
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  city_map: (
    <>
      <path d="M3 21V10l5-3v14M8 21V5l6 3v13M14 21V11l7-2v12" />
      <path d="M2 21h20" />
    </>
  ),
  phone_scroll: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M12 8v6m0 0-2-2m2 2 2-2" />
    </>
  ),
  learning_path: (
    <>
      <circle cx="5" cy="19" r="2" />
      <circle cx="12" cy="11" r="2" />
      <circle cx="19" cy="4.5" r="2" />
      <path d="M6.5 17.5 10.5 12.5M13.5 9.5 17.5 6" />
    </>
  ),
  sneaker: (
    <>
      <path d="M3 16.5v-3l4-1 3 2h4l3-3 4 2.5v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M7 12.5V9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  storefront: (
    <>
      <path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 2.7 3S9.3 10.7 9.3 9c0 1.7 1.3 3 2.7 3s2.7-1.3 2.7-3c0 1.7 1.3 3 2.7 3S20 10.7 20 9" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
};

export function ProjectIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[icon] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
