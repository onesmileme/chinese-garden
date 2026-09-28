# Guwendao Tang Poem Import Design

## Goal

Import all 320 Tang poem source records from:

`/Users/bytedance/workspace/individual/overseas/ChinesePoem/content-source/guwendao/tangshi.json`

into the Chinese-garden content-authoring backend as reviewable draft content.

## Scope

- Convert every Guwendao poem record into one backend `POEM` candidate.
- Import candidates through the existing audited raw-content import workflow.
- Preserve source identity, URL, category, and a deterministic source hash.
- Keep all imported poems in `DRAFT` status until editorial review.
- Make repeated imports safe and observable.

The import does not:

- activate or publish any poem;
- add poems to `frontend/content/corpus/poem-bank.json`;
- generate pinyin, translations, explanations, audio, or images;
- modify the 23 existing formal poem records;
- introduce a new database table.

## Source Contract

The source document must contain:

- `recordCount` equal to `320`;
- `errors` as an empty array;
- `poems` as an array of exactly 320 records;
- unique, non-empty 12-character hexadecimal `sourceId` values;
- non-empty `title`, `author`, `dynasty`, `category`, and `sourceUrl`;
- a non-empty `lines` array whose normalized join matches `text`;
- HTTPS Guwendao detail-page URLs.

Generation fails without replacing the previous output when any invariant is
violated.

## Candidate Mapping

Each source record maps to one raw import candidate:

| Candidate field | Value |
| --- | --- |
| `importKey` | `GUWENDAO_TANG:<sourceId>` |
| `source` | `GUWENDAO_TANG` |
| `sourceRef` | Original `sourceUrl` |
| `sourceHash` | SHA-256 of the canonical source record |
| `ruleVersion` | `guwendao-tang-poem-v1` |
| `id` | `sc-gwd-<sourceId>` |
| `type` | `POEM` |
| `suggestedLevel` | `5` |
| `suggestedDifficulty` | `5` |
| `promotionRequired` | `true` |
| `tags` | `唐诗`, `古文岛`, and the original category |
| `payload.title` | Original `title` |
| `payload.author` | Original `author` |
| `payload.lines` | Original `lines` |
| `payload.charRefs` | Empty array |
| `payload.source` | Original `sourceId`, `dynasty`, `category`, and `sourceUrl` |
| `score` | `100` |

Level 5 and promotion-required are conservative defaults for ungraded source
material. Empty `charRefs` are accepted for draft storage; this workflow does
not attempt activation.

The generated artifact is:

`frontend/content/candidates/poems-guwendao-tang-320.ndjson`

It is a review/import artifact, not formal runtime corpus data.

## Import Flow

1. A deterministic generator reads and validates `tangshi.json`.
2. It writes all 320 candidates atomically as NDJSON.
3. The existing admin import UI parses the file and creates an import batch.
4. Candidates are appended in the existing chunked API flow.
5. `RawContentImportService` creates `content_item` and `content_revision`
   records as `DRAFT`.
6. `content_import_batch` and `content_import_candidate` retain provenance and
   import decisions.

The existing importer must persist candidate tags instead of replacing them
with an empty list.

## Idempotency And Existing Data

`sc-gwd-<sourceId>` is stable across regeneration. If an item with that ID
already exists, the import skips it according to the existing raw-import
rules. Existing poem records with other IDs are not overwritten, even when
their title and text match a Guwendao source record.

A second import of the same artifact must create no additional content items.

## Failure Handling

- Invalid source data stops candidate generation before output replacement.
- Invalid NDJSON is rejected by the existing admin parser.
- Candidate-level backend failures are recorded as `REJECTED`.
- Existing IDs are recorded as skipped.
- Batch completion reports imported, skipped, and rejected counts.
- No automatic activation or release is performed after import.

## Verification

Automated tests cover:

- source validation and deterministic mapping;
- exactly 320 unique candidate and content IDs;
- canonical source hashes;
- atomic output behavior;
- preservation of candidate tags by `RawContentImportService`;
- successful import of a representative poem;
- repeated-import skip behavior.

Runtime verification queries the database for:

- 320 `POEM` items whose ID starts with `sc-gwd-`;
- all 320 items in `DRAFT`;
- 320 matching revision rows;
- zero rejected candidates in the completed import batch;
- preserved source/category tags and source audit metadata.
