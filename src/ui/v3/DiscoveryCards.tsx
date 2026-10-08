import { getCareerProjectCopy, getWorld, V3_COPY } from "@/data";
import { toneStyle } from "@/ui/discovery/projectBrand";

/**
 * Discovery cards for the V3 experience, one per discovery strategy. The card shell (button, selection state,
 * typography) is shared, so the same experience can run world-led (V3) or brand-led (V2's projects) without
 * changing the screen around it.
 */

function SelectedBadge() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-colman-blue px-2.5 py-1 text-sm font-semibold text-white">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {V3_COPY.discovery.selectedBadge}
    </span>
  );
}

const cardShell = (selected: boolean) =>
  `flex min-h-24 w-full flex-col gap-1.5 rounded-2xl border-2 p-4 text-start transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue ${
    selected
      ? "colman-wash border-colman-blue shadow-md ring-2 ring-colman-purple/30"
      : "border-colman-border bg-white hover:border-colman-blue hover:shadow-sm"
  }`;

/**
 * A working world: title, workplace/context line and one imagination line. No company, no logo, no brand colour and
 * no icon: every card uses the same typography so nine of them stay easy to scan.
 */
export function WorldCard({
  worldId,
  selected,
  onPress,
}: {
  worldId: string;
  selected: boolean;
  onPress: (worldId: string) => void;
}) {
  const world = getWorld(worldId);
  if (!world) return null;
  return (
    <button
      type="button"
      data-entry-id={worldId}
      data-world-id={worldId}
      aria-pressed={selected}
      onClick={() => onPress(worldId)}
      className={cardShell(selected)}
    >
      <span className="flex min-h-7 items-start justify-between gap-3">
        <span className="block text-lg leading-snug font-bold break-words text-colman-blue-dark" data-world-title>
          {world.titleHe}
        </span>
        {selected && <SelectedBadge />}
      </span>
      <span className="block text-sm leading-snug font-semibold text-colman-purple-ink" data-world-context>
        {world.contextHe}
      </span>
      <span className="block text-base leading-snug break-words text-slate-700">{world.lineHe}</span>
    </button>
  );
}

/** A V2 brand project, for running this experience brand-led (not used by V3's world-led configuration). */
export function BrandProjectCard({
  projectId,
  selected,
  onPress,
}: {
  projectId: string;
  selected: boolean;
  onPress: (projectId: string) => void;
}) {
  const project = getCareerProjectCopy(projectId);
  if (!project) return null;
  const company = V3_COPY.companyLabels[projectId] ?? project.brandName;
  return (
    <button
      type="button"
      data-entry-id={projectId}
      data-project-id={projectId}
      aria-pressed={selected}
      onClick={() => onPress(projectId)}
      style={toneStyle(projectId)}
      className={cardShell(selected)}
    >
      <span className="flex min-h-7 items-center justify-between gap-3">
        <span
          data-company-label
          className="text-base font-bold tracking-wide text-(--tone) [direction:ltr] [unicode-bidi:plaintext]"
        >
          {company}
        </span>
        {selected && <SelectedBadge />}
      </span>
      <span className="block text-lg leading-snug font-bold break-words text-colman-blue-dark">{project.title}</span>
      <span className="block text-base leading-snug break-words text-slate-700">{project.scenario}</span>
    </button>
  );
}
