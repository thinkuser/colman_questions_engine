import { V4_COPY } from "./v4Copy";
import { V4_LEAD_COPY, V4_UI_COPY, v4Text, type ExperienceCopy, type LeadCopy } from "./v4InclusiveCopy";
import { V5_PROJECT_OPENING } from "./v5Projects";

/**
 * V5 candidate-facing copy (DEC-037). V5 INHERITS the V4 gender-inclusive presentation layer (DEC-036) rather than
 * building a second copy system:
 *  - the method screen is V4's approved copy (`V4_COPY.method`, rendered by the same screen);
 *  - screen copy, lead copy and the shared-content text seam are V4's (`V4_UI_COPY`, `V4_LEAD_COPY`, `v4Text`), so
 *    every shared world / question / result string reads exactly as in V4;
 *  - the only V5-specific text is the balanced project content (`v5_projects.json`), authored gender-inclusive from the
 *    start, so it needs no overrides (`v4Text` returns it as is). The project screen headline/helper come from there.
 * V1/V2/V3 copy and V4 copy are not changed by this module.
 */

export const V5_COPY = {
  appTitle: V4_COPY.appTitle,
  appDescription: V4_COPY.appDescription,
  projects: { headline: V5_PROJECT_OPENING.prompt, support: V5_PROJECT_OPENING.helper },
} as const;

/** V4's inclusive screen copy, with V5's project-screen headline/helper. */
export const V5_UI_COPY: ExperienceCopy = {
  ...V4_UI_COPY,
  discovery: { ...V4_UI_COPY.discovery, headline: V5_COPY.projects.headline, support: V5_COPY.projects.support },
};

export const V5_LEAD_COPY: LeadCopy = V4_LEAD_COPY;

/** V5's text seam: V4's inclusive wording of shared content; V5's own content is authored inclusive and passes as is. */
export const v5Text: (text: string) => string = v4Text;
