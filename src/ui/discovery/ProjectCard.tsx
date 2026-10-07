import type { CareerProjectCopy } from "@/data";
import { copy } from "@/ui/copy.he";
import { ProjectIcon } from "./ProjectIcon";
import { toneStyle } from "./projectBrand";

/**
 * One selectable career project. A real button with `aria-pressed`, so keyboard and screen-reader users get the same
 * toggle as everyone else. The selected state is shown by a check mark and the word "נבחר" as well as colour, never by
 * colour alone. When the maximum is reached the other cards stay focusable (`aria-disabled`) and explain why on press.
 * The company is imagination context only: text, a neutral icon, and no logo.
 */
export function ProjectCard({
  projectId,
  project,
  selected,
  blocked,
  onToggle,
}: {
  projectId: string;
  project: CareerProjectCopy;
  selected: boolean;
  /** The maximum is reached and this card is not selected. */
  blocked: boolean;
  onToggle: (projectId: string) => void;
}) {
  return (
    <button
      type="button"
      data-project-id={projectId}
      aria-pressed={selected}
      aria-disabled={blocked || undefined}
      onClick={() => {
        if (!blocked) onToggle(projectId);
      }}
      style={toneStyle(projectId)}
      className={`flex min-h-24 w-full flex-col gap-3 rounded-2xl border-2 p-4 text-start transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colman-blue ${
        selected
          ? "colman-wash border-colman-blue shadow-md ring-2 ring-colman-purple/30"
          : blocked
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : "border-colman-border bg-white hover:border-colman-blue hover:shadow-sm"
      }`}
    >
      <span className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-colman-surface text-(--tone-icon)">
          <ProjectIcon icon={project.icon} className="size-8" />
        </span>
        <span className="min-w-0 flex-1">
          {project.brandName && (
            <span className="block text-base font-bold tracking-wide text-(--tone) [direction:ltr] [unicode-bidi:plaintext] text-start">
              {project.brandName}
            </span>
          )}
          <span className="block text-lg leading-snug font-bold break-words text-colman-blue-dark">
            {project.title}
          </span>
        </span>
        {selected && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-colman-blue px-2.5 py-1 text-sm font-semibold text-white">
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m3 8.5 3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {copy.v2.discover.selectedLabel}
          </span>
        )}
      </span>
      <span className="block text-base leading-snug text-slate-700 break-words">{project.scenario}</span>
    </button>
  );
}
