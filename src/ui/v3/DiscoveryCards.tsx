import { getCareerProjectCopy, getV5Project, getWorld } from "@/data";
import { useExperience } from "@/ui/experience/ExperienceContext";

/**
 * Discovery cards for the V3 experience, one per discovery strategy. The card shell (button, selection state,
 * typography) is shared, so the same experience can run world-led (V3) or brand-led (V2's projects) without
 * changing the screen around it.
 */

function SelectedBadge() {
  const { ui } = useExperience();
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-colman-blue px-2.5 py-1 text-sm font-semibold text-white">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {ui.discovery.selectedBadge}
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
  const { t } = useExperience();
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
          {t(world.titleHe)}
        </span>
        {selected && <SelectedBadge />}
      </span>
      <span className="block text-sm leading-snug font-semibold text-colman-purple-ink" data-world-context>
        {t(world.contextHe)}
      </span>
      <span className="block text-base leading-snug break-words text-slate-700">{t(world.lineHe)}</span>
    </button>
  );
}

/**
 * A V2 brand project in the redesigned UX (V4 project mode; V3 never renders it). Text-first: company name as plain text
 * in one consistent COLMAN typography (no logos, icons or brand colours), then the project title and description.
 */
export function BrandProjectCard({
  projectId,
  selected,
  onPress,
}: {
  projectId: string;
  selected: boolean;
  onPress: (projectId: string) => void;
}) {
  const { ui, t } = useExperience();
  const project = getCareerProjectCopy(projectId);
  if (!project) return null;
  const company = ui.companyLabels[projectId] ?? project.brandName;
  return (
    <button
      type="button"
      data-entry-id={projectId}
      data-project-id={projectId}
      aria-pressed={selected}
      onClick={() => onPress(projectId)}
      className={cardShell(selected)}
    >
      <span className="flex min-h-7 items-center justify-between gap-3">
        <span
          data-company-label
          className="text-sm leading-snug font-semibold text-colman-purple-ink [direction:ltr] [unicode-bidi:plaintext]"
        >
          {company}
        </span>
        {selected && <SelectedBadge />}
      </span>
      <span className="block text-lg leading-snug font-bold break-words text-colman-blue-dark">{t(project.title)}</span>
      <span className="block text-base leading-snug break-words text-slate-700">{t(project.scenario)}</span>
    </button>
  );
}

/**
 * A V5 balanced project (PROJECT_STRATEGY, DEC-037). Text-first: the project title in one consistent COLMAN typography
 * (a company name is plain text: no logo, icon or brand colour), then one line about the task. All ten cards share the
 * same shell, so none looks ranked.
 */
export function ProjectCard({
  projectId,
  selected,
  onPress,
}: {
  projectId: string;
  selected: boolean;
  onPress: (projectId: string) => void;
}) {
  const { t } = useExperience();
  const project = getV5Project(projectId);
  if (!project) return null;
  return (
    <button
      type="button"
      data-entry-id={projectId}
      data-project-id={projectId}
      aria-pressed={selected}
      onClick={() => onPress(projectId)}
      className={cardShell(selected)}
    >
      <span className="flex min-h-7 items-start justify-between gap-3">
        <span
          data-project-title
          className="block text-lg leading-snug font-bold break-words text-colman-blue-dark [unicode-bidi:plaintext]"
        >
          {t(project.titleHe)}
        </span>
        {selected && <SelectedBadge />}
      </span>
      <span className="block text-base leading-snug break-words text-slate-700">{t(project.cardHe)}</span>
    </button>
  );
}
