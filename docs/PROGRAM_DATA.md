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

Additional facts fields: `official_title`, `degree`, `faculty`, `program_name_aliases_he`, `program_qualifier_he` (DEC-015), and `program_notes` (decision-relevant structural facts such as a double major or a shared first year). Additional admissions fields: `usage_status` and `usage_status_reason_en` (DEC-017).

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

## Display names and qualifiers (DEC-015)
- `program_name_he` is the candidate-facing canonical short name. It must appear verbatim on the program page.
- `program_name_aliases_he` preserves other official wordings, e.g. the Data Science page title `מדעי הנתונים`.
- `program_qualifier_he` is product-decided display copy. When non-null, it must be shown with the name wherever candidates see it. MIS: `דו-חוגי עם מנהל עסקים`, backed by the sourced `double_major_with_business_administration` note. UI components render names through `ProgramName`, which always shows the qualifier.

## Explanatory program notes (DEC-016)
`program_notes` are facts-layer content for explanation and reassurance. The engine never reads them. In particular, the CS/DS `shared_first_year` note may support the CS-vs-DS result, but it must never affect fit scores, ranking, or classification.

## Admissions usage status (DEC-017)
Every admissions record has a `usage_status`:

| `usage_status` | Meaning | `usage_status_reason_en` |
|---|---|---|
| `usable_as_published` | May drive automated eligibility, subject to `last_reviewed` freshness | must be `null` |
| `manual_confirmation_required` | Confirm with COLMAN before any automated eligibility decision | required |

Admission-check consumers must gate on `isAutomatedEligibilityAllowed()` from `@/data/admissions`. Neither the status nor the helper is reachable from fit or scoring code.

Current state: CS and DS are `usable_as_published`. MIS is `manual_confirmation_required`, because its published conditional-admission wording is internally ambiguous: a "bagrut and psychometric" track with no psychometric threshold, overlapping the 85–94.4 bagrut range.

## Resolved during THI-6 review
- MIS double major → candidate-facing qualifier (DEC-015).
- Data Science spelling → `מדע הנתונים` canonical, `מדעי הנתונים` alias (DEC-015).
- CS/DS shared first year → explanatory only (DEC-016).
- MIS reality check added: `mis_technical_and_quantitative_load`. It is a warning, never a scoring penalty (DEC-009).
- MIS admissions ambiguity → `manual_confirmation_required` (DEC-017).

## Still open
- **Official pages do not distinguish entry-level from future roles.** Those fields stay empty; no distinction is invented.
- `less_suitable_for` has no defined source and stays empty.
