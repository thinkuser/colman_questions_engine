# Program Data V1

How program content is structured, sourced, and verified. Implements the target shape in `PROGRAM_MODEL.md` (THI-6).

## Three layers, kept separate

| Layer | Files | Nature | Who may read it |
|---|---|---|---|
| **Official facts** | `src/data/content/facts/<program_id>.json` | Verbatim from official COLMAN sources, every item cites a source | UI, result experience |
| **Fit profile** | `src/data/content/fit/<program_id>.json` | Internal editorial heuristics: dimension vectors, positioning, reality checks (`basis: "editorial_heuristic"`) | Engine (via `getProgramVectors`), result experience |
| **Admissions** | `src/data/content/admissions/<program_id>.json` | Verbatim official admission rules | Admission-check features only |

Why separate:
- Official facts must stay traceable (DEC-012) and must never be confused with our heuristic scores.
- Admission eligibility must never change fit (DEC-008). Admissions are **not** exported from `@/data`; import `@/data/admissions` explicitly. ESLint blocks `src/engine`, `src/flow`, `src/analytics`, and the rest of `src/data` from importing admissions.
- The engine does not import `@/data` at all; it receives program vectors as arguments.

Loaders validate every file with Zod at load time (`src/data/schema.ts`), so invalid content fails tests and the build.

## Mapping to the PROGRAM_MODEL target shape

| Target field | Where it lives |
|---|---|
| `program_id`, `program_name_he`, `program_name_en`, `official_urls`, `short_description`, `what_you_learn`, `key_courses`, `career_paths`, `entry_level_roles`, `future_roles`, `ideal_for`, `why_colman`, `sources` (`source_ids`), `last_reviewed` | facts |
| `dimensions`, `positioning_shorthand` (`positioning_shorthand_en`), `less_suitable_for`, `reality_checks` | fit |
| `admission_requirements` (`rules`) | admissions |

Additional facts fields: `official_title`, `degree`, `faculty`, `program_name_aliases_he`, `program_notes` (decision-relevant structural facts such as a double major or a shared first year).

## Evidence rule

Every official fact is an object `{ text_he, quote_he?, source_ids[] }`:
- If `quote_he` is absent, `text_he` must appear **verbatim** in each cited source.
- If `text_he` is a short display label (e.g. a role extracted from a sentence), `quote_he` holds the verbatim sentence.

Verbatim means "matches after whitespace normalization"; typos in the source are preserved.

Sources are registered in `src/data/content/sources.json` and must be on `colman.ac.il` or `academy.org.il`. A plain-text snapshot of each source's main content is committed in `src/data/content/source-snapshots/<source_id>.txt`. Tests check every fact and admission rule against those snapshots, so any fact that cannot be traced fails CI.

Fields with no official source stay **empty** rather than invented (currently `entry_level_roles`, `future_roles`, `less_suitable_for`, and MIS `ideal_for`).

## Editorial layer rules
- Dimension vectors must equal the table in `PROGRAM_MODEL.md`; a test parses the doc table and compares.
- Reality checks are included only where repo docs specify them (`doc_refs`) and must cite supporting official sources (`evidence_source_ids`). Candidate-facing Hebrew copy for reality checks belongs to the result experience.

## Curation workflow (refresh or add a program)
1. Register the source page(s) in `sources.json`.
2. `pnpm snapshot:sources` to refresh snapshots (offline tooling; the app never fetches pages at runtime).
3. Review the snapshot diff in git — changed text means facts may be stale.
4. Edit or add `facts/`, `fit/`, and `admissions/` JSON. Register a new program in `PROGRAM_IDS` and each loader.
5. Update `retrieved_at` / `last_reviewed`, then run `pnpm check`. The verbatim tests show exactly which facts no longer match.

## Open data questions (pending product/COLMAN confirmation)
Recorded during THI-6 curation; not resolved by guessing.

1. **MIS is officially a double major.** The program page title is `תואר בניהול מערכות מידע ומנהל עסקים BA - דו חוגי`, while navigation and `academy.org.il` say `ניהול מערכות מידע`. The display name uses `ניהול מערכות מידע`. Should the candidate-facing name mention the Business Administration double major, and does the vector (`business_context: 5`) already reflect it?
2. **Data Science spelling is inconsistent across official sources.** The page title is `מדעי הנתונים`; the body and `academy.org.il` also use `מדע הנתונים` (as does the `PROGRAM_MODEL.md` example). Display uses the page title; the other spelling is recorded as an alias.
3. **CS and DS share a first year** and students may choose between them afterwards (stated on both pages). This is material to the CS-vs-DS main decision; how the result experience should use it is not yet specified.
4. **MIS has no documented reality check**, although its sample curriculum includes Mathematics 1–2, Statistics, and Discrete Math. Add one only if product agrees.
5. **MIS conditional-acceptance text looks internally inconsistent** (a "bagrut and psychometric" track with no psychometric threshold, overlapping the 85–94.4 bagrut range). It is stored verbatim; verify with COLMAN before any admission-check feature uses it.
6. **Official pages do not distinguish entry-level from future roles**, so those fields are empty.
