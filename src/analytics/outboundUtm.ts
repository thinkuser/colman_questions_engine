/**
 * OUTBOUND attribution (DEC-038): every V5 http(s) link that sends the candidate out of StudyMatch to COLMAN carries
 * the agreed, fixed tracking values. These are NOT the inbound acquisition UTMs (`context.ts` records how the
 * candidate reached StudyMatch); these say "StudyMatch sent this visit".
 *
 * `questionaire` is intentionally spelled this way: it is the agreed tracking value. Do not "correct" it.
 */
export const STUDYMATCH_OUTBOUND_UTM = {
  utm_source: "study_match",
  utm_medium: "questionaire",
  utm_campaign: "ai_tools",
} as const;

const OVERRIDDEN = new Set(Object.keys(STUDYMATCH_OUTBOUND_UTM));

/**
 * The URL with the three fixed outbound UTMs. Pure string handling (deterministic on server and client, so it never
 * causes a hydration mismatch); the original destination, its other query parameters (as written) and its fragment
 * are preserved, and any existing utm_source / utm_medium / utm_campaign is replaced by the agreed value.
 * Anything that is not an absolute http(s) URL (internal routes, anchors, tel:, mailto:, javascript:, malformed or
 * empty values) is returned unchanged.
 */
export function withStudyMatchOutboundUtm(url: string): string;
export function withStudyMatchOutboundUtm(url: string | null | undefined): string | null | undefined;
export function withStudyMatchOutboundUtm(url: string | null | undefined): string | null | undefined {
  if (typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!/^https?:\/\/[^/?#\s]+/i.test(trimmed)) return url;
  try {
    new URL(trimmed);
  } catch {
    return url;
  }
  const hashAt = trimmed.indexOf("#");
  const beforeHash = hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed;
  const hash = hashAt >= 0 ? trimmed.slice(hashAt) : "";
  const queryAt = beforeHash.indexOf("?");
  const base = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "";
  const kept = query
    .split("&")
    .filter((pair) => pair !== "")
    .filter((pair) => {
      const key = pair.split("=")[0] ?? "";
      let decoded = key;
      try {
        decoded = decodeURIComponent(key.replace(/\+/g, " "));
      } catch {
        // keep the raw key
      }
      return !OVERRIDDEN.has(decoded.toLowerCase());
    });
  const added = Object.entries(STUDYMATCH_OUTBOUND_UTM).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return `${base}?${[...kept, ...added].join("&")}${hash}`;
}
