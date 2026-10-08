# StudyMatch V4 Experience (dual-entry experiment)

V4 is a third, isolated experiment next to the two production baselines. **The final production direction is NOT chosen yet.**

| Version | Route | Discovery | Experience | Status |
|---|---|---|---|---|
| V1 | `/` | program comparison | V1 | unchanged |
| V2 | `/v2` | **brand-led only** (Spotify, Wolt...) | V2 UX | production baseline, tag `studymatch-v2-ui-baseline` |
| V3 | `/v3` | **world-led only** (9 working worlds) | redesigned UX | production baseline, tag `studymatch-v3-worlds-baseline` (`aedfc75`) |
| V4 | `/v4` | **candidate chooses**: worlds OR projects | redesigned UX | this experiment (draft PR) |

All three run on the **same engine** (no scoring, routing, ceiling, near-tie, reality-check or Tech change). The `DiscoveryStrategy` seam (`src/flow/journey.ts`) is intentionally preserved so the final product can be brand only, worlds only, candidate choice, or an externally assigned A/B strategy, without rewriting the engine.

## Routes and journey
`/v4` landing → `/v4/start` entry method → `/v4/worlds` or `/v4/projects` → `/v4/ready` transition → `/v4/questions` → `/v4/result`

1. **Landing (`/v4`)**: the V3 landing layout (logo, headline, the three expectation lines) in V4's inclusive wording: "איזה תחום לימודים יכול להתאים לך?". The CTA "נמצא יחד את הכיוון שלך" goes to `/v4/start` (not straight to worlds). A returning candidate with progress continues where they stopped.
2. **Entry method (`/v4/start`)**: framed as "where are you in your decision?", not "how do you prefer to think?": "מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?" / "אפשר לבחור את האפשרות שהכי מתאימה — ונמשיך משם." Exactly two equal options (same size, style and typography; tested). In the RTL layout the **first (right) card is Worlds** and the **second (left) card is Projects**:
   - **Right, Worlds**: "יש לי כיוון שאני רוצה ללמוד" / "יש תחום שמושך אותי, ואני רוצה לדייק איזה מסלול הכי מתאים לי." / "נתחיל מעולמות כמו טכנולוגיה, אנשים, חינוך, משפטים, עסקים ועיצוב." → `/v4/worlds`, `entry_mode: worlds`.
   - **Left, Projects**: "אין לי מושג מה אני רוצה ללמוד" / "אני רוצה להתחיל לחקור ולגלות מה באמת מסקרן אותי." / "נתחיל מפרויקטים ומשימות מוכרות ונבין יחד לאלו כיוונים יש יותר חיבור." → `/v4/projects`, `entry_mode: projects`.
   **This is not a question:** 0 fit points, 0 support, not evidence. It only selects the discovery strategy. Neither option is ranked.
3. **Worlds (`/v4/worlds`)**: V3's world discovery (the nine worlds, scenarios, mappings and HR follow-ups from `v3_worlds.json`, via the existing `WORLD_STRATEGY`; no fork), worded inclusively (see "Language"). Openers in the candidate's selection order.
4. **Projects (`/v4/projects`)**: V2's seven projects from `career_projects.json` via the existing `BRAND_STRATEGY` (no copy of the content), rendered in the redesigned UX: text-first cards, company name as plain text in one COLMAN typography (no logos, icons or brand colours), the synthetic project labelled `AI`, the brand disclaimer kept. "לאיזה פרויקט היית הכי רוצה להצטרף?" / "אפשר לבחור עד שניים שהכי מסקרנים אותך. אין תשובה נכונה." Max two, visible third-selection message, sticky Continue. Routing keeps V2's semantics (openers in display order).
5. **Transition, questions, result**: the shared V3 screens. Questions use explicit select + "המשך" for both methods (no tap-to-advance in V4; V2 itself is unchanged). The result is the V3 hierarchy for both methods (it does not emphasise which method was used); project mode keeps the company disclaimer.

**Back:** result → last question; question → previous answer; first question → the chosen discovery screen; discovery → method screen ("לבחירת דרך אחרת"); method screen → landing ("חזרה"). Re-choosing the same method keeps the selection; choosing the other method starts a fresh journey. Restart clears all of V4 (including the method) and returns to the landing.

**Direct experiment URLs:** `/v4/worlds` and `/v4/projects` work directly with no query parameter. With no method stored, the page adopts its own mode, so traffic can be split externally (brand-led V4 UI vs world-led V4 UI) without the candidate self-selecting. If nothing has been chosen yet the page switches mode; a journey already in progress is never silently switched (the URL is redirected to where that journey belongs).

## Language (DEC-036)
**V4 candidate-facing Hebrew should be gender-inclusive. Prefer natural gender-neutral phrasing; use paired masculine/feminine forms only when neutrality would sound unnatural.** V1, V2 and V3 keep their approved copy.

- Toolbox: impersonal phrasing ("אפשר לבחור", "ממשיכים", "להכיר את המסלול"); forms spelled the same for every gender (לך, אותך, שלך, אליך, דעתך, "בחרת", "עצרת", "היית רוצה"); first person on the candidate's own buttons ("אשמח שיחזרו אליי עם פרטים"). The legal consent text is unchanged (it already uses "מאשר/ת ומסכים/ה").
- Examples: "בחרו עד שניים" → "אפשר לבחור עד שניים"; "איפה הייתם הכי רוצים להיכנס?" → "איפה היית הכי רוצה להיכנס?"; "מה הכי מסקרן אתכם?" → "מה הכי מסקרן אותך?"; "בואו נמשיך" → "ממשיכים"; "הכירו את המסלול במכללה" → "להכיר את המסלול במכללה"; "אתם נמשכים לצד היצירתי" → "מושך אותך הצד היצירתי"; "איך אתם מרגישים לגבי לימודים עם הרבה מתמטיקה?" → "מה דעתך על לימודים עם הרבה מתמטיקה?".
- **How (no fork):** `src/data/v4InclusiveCopy.ts` holds `V4_UI_COPY` (the `V3_COPY` shape), `V4_LEAD_COPY` (the `V2_LEAD_COPY` shape) and `v4Text`, an exact-string override map for shared content (world/cluster/V1 Tech questions and options, program meaning, pair guidance, V1 Tech evidence lines). The experience context passes `ui`, `t` and `leadCopy` to the shared screens; the view builders take the same `t`, and `v3Progress` takes the experience progress copy. V3's provider passes `V3_COPY`, identity and `V2_LEAD_COPY`, so V2/V3 are unchanged. Ids, mappings, weights, routing, order and scoring are untouched (wording only).
- **Tests:** `tests/flow/v4InclusiveCopy.test.ts` (no stale override keys; masculine-only scan over V4's own copy, all shared content through `v4Text`, and every single/pair selection × 5 answer policies in both modes; V2/V3 copy and the consent text pinned) and the "V4 gender-inclusive copy" browser suite in `e2e/v4.spec.ts` (scans every screen, including details, validation and success, on a worlds + Tech journey, a projects + Spotify Q1 journey and a near-tie result). The shared scan rules live in `tests/flow/inclusiveScan.ts`.
- **Kept on purpose:** third-person generic characters inside scenarios ("אדם עובר שינוי... מה הוא מרגיש", "יוצר טוען... שלו", "לכל משתמש... שבאמת יאהב") are not candidate address.

## Tech
- Projects: the existing V2 Spotify → V1 hand-off (V1 asks its own Q1).
- Worlds: the approved WT1 → V1 Q1 carry (V1 starts at Q2; Q1 never shown).
Both reach the same V1 logic; tested that the same V1 answers give the same V1 result through either path.

## Architecture
- `src/ui/experience/ExperienceContext.ts`: the contract between the redesigned screens and the experience hosting them (routes, "where does this journey belong", analytics, lead flow version / entry mode, brand-mode copy). V3's provider supplies it with V3's unchanged rules; V4's provider (`src/ui/state/V4Provider.tsx`, rules in `src/ui/state/v4Rules.ts`) supplies it with the entry mode. The screens in `src/ui/v3/**` are shared; the only V4-only screen is `src/ui/v4/EntryMethodStep.tsx`.
- Strategy per entry mode: `strategyForEntryMode` (`src/flow/v4Persistence.ts`): worlds → `WORLD_STRATEGY`, projects → `BRAND_STRATEGY`. No new engine, no forked content.
- V2 is untouched (byte-identical to its baseline apart from the previously approved `LeadForm` props). V3's behaviour is unchanged (its screens now read routes/analytics from the context; the full V3 E2E suite passes unchanged).

## Persistence
Key `colman-studymatch:v4:journey`: `{ version: 1, flow: "v4", entryMode: "worlds" | "projects" | null, phase, selectedIds, answers }`. Replayed through the reducer of the entry mode's strategy; invalid or mismatched state (e.g. a world id in project mode) is cleared. V4 never reads or writes V2/V3 storage and V2/V3 never read V4's (tested both ways).

## Analytics
Every V4 event carries `flow_version: "v4"`; every journey event also carries `entry_mode`. New: `discovery_method_view`, `discovery_method_selected` (`entry_mode`). World mode emits `career_world_*`, project mode `career_project_*`. One tracker per entry mode (`colman-studymatch:analytics-v4:<mode>` session keys). See `docs/ANALYTICS.md` ("V4 dual-entry events") for the comparison metrics by `entry_mode`.

## Lead
Same `POST /api/v2/lead`. V4 sends `flow_version: "v4"`, `entry_mode`, and both id lists with exactly one populated: worlds → `selected_world_ids: [...]`, `selected_project_ids: []`; projects → `selected_project_ids: [...]`, `selected_world_ids: []`. The server rejects a missing entry mode, a mismatched or mixed selection, invalid ids, and `entry_mode` on V2/V3 leads. V2 and V3 payloads are unchanged.

**Sheet (n8n "Colman Webhook for question engine", tab `Leads`):** new column `entry_mode` (T) between `selected_world_ids` and `source`; `source` now follows the version (`colman_studymatch_v2` / `_v3` / `_v4`; it used to be hardcoded `_v2`). V2 → `projects`, V3 → `worlds`, V4 → its own mode. Existing rows were kept; their new `entry_mode` cell was backfilled from `flow_version`. Dedupe, webhook path and 200 timing unchanged.

## Traversal QA
`tests/flow/v4Traversal.test.ts` (`CALIBRATION_REPORT=1` for the table) walks every answer path with the same memoised methodology as V2/V3. Coverage only; nothing tuned.

| Mode | Selections | Complete paths | needs_focus_content | Max scored | Max answers |
|---|---|---|---|---|---|
| V4 Projects (`BRAND_STRATEGY`) | 28 (7 singles + 21 pairs; order-independent) | 91,160 | **0** | 5 | 11 |
| V4 Worlds (`WORLD_STRATEGY`) | 81 (9 + 36 pairs × both orders) | 242,946 | **0** | 5 | 11 |

No new content gaps compared with V2/V3. The 11-answer maximum is the known Tech cross-cluster path in both modes.

## Open
- Native-speaker Hebrew review of the V4 inclusive wording (method screen, question rewrites, result lines).
- The comparison needs enough real traffic per entry mode; the split (self-selection vs externally assigned `/v4/worlds` / `/v4/projects`) is a product decision.
