# Plan - Vocabulary context + full data audit

Status: **Built** (branch `feat/vocab-context-audit`, 2026-11-04, PR pending).

Spec: `spec.md` §2.13, FR-VOC-017..020, AC-041/043.

## Goal

Make the drill teach usage instead of only translation, fix common-gender
article matching, and raise the quality of all 10,255 remaining vocabulary cards.

## Locked decisions

- Show **English example + target-language example with the target masked**
  before answering; reveal the full examples after answer/reveal.
- Never show the unmasked target before grading.
- Accept `el/la` and `los/las` for common-gender Spanish nouns, with or without
  an article.
- Increase the compact drill height from 360 to 460; expanded from 640 to 700.
- Add a persisted **Context before answer** setting (default on).
- Run a full, resumable LLM audit over every card; apply only high-confidence
  corrections and keep uncertain results for review.
- Merge the 7 duplicate word triples.
- Keep the existing enrichment schema (`example`, `hl_*`, `note`).

## Phase 1 - Matching, context, height

- `src/vocab-match.js`: common-gender article parsing and matching; tests.
- `src/vocab-context.js`: mask highlighted target segments; tests.
- `src/drill.html`: context strip, masked target examples, full examples after
  answering, ellipsis-aware highlighting, larger window.
- `src/main.js`: `showContext` default and Vocab settings toggle.
- `src-tauri/src/lib.rs`: popup config carries `show_context`; larger drill
  dimensions.
- `spec.md`: no-leak rule updated to allow masked context.

## Phase 2 - Targeted data repairs

`scripts/repair-vocab.mjs`:

- normalize all 165 `el/la` cards
- fix known wrong-language/example/highlight issues
- change `handball` to the sport sense (`el balonmano` / `Handball`)
- merge 7 duplicate triples, unioning categories and dropping duplicate rows

Expected result: 10,255 cards, 10,255 details, 0 duplicate triples, 0 bad
highlights.

## Phase 3 - Full LLM audit

`scripts/audit-vocab.mjs`:

- `--check`: structural audit report
- `--llm`: resumable batch audit into `.vocab-audit/`
- `--apply`: apply only `fix` results with confidence >= 0.85 after validation

`scripts/fix-audit-translations.mjs` guards against audit suggestions that put
example sentences into translation columns. `scripts/dedupe-vocab.mjs` merges
translation duplicates created by normalisation.

Audit checks translation sense, POS, articles/plurals, example naturalness,
highlights, regional/ambiguous usage notes, and duplicate/sense issues.

The audit never applies automatically. Review `.vocab-audit/results.json` and
`report.json` before running `--apply`.

## Verification

- `node scripts/test-match.cjs`
- `node scripts/test-context.cjs`
- `node --check` on changed JS / extracted drill script
- `node scripts/audit-vocab.mjs --check`
- `cargo test --lib`
- Manual drill: masked context before answer, full examples after, `el/la`
  article variants, larger popup, German separable highlights.

## Corrections log

- 2026-11-04: plan created and Phase 1/2 implemented. Pilot LLM audit (20 cards)
  succeeded; full audit is resumable. Data checks: 10,255 cards, 0 duplicate
  triples, 0 bad highlight substrings.
- 2026-11-04: full audit completed with 4 shards at batch 50: 10,255 cards
  audited (7,848 ok / 2,233 fix / 174 uncertain; 884 fixes at confidence
  >=0.85). Applied 878 high-confidence fixes, then deduped 165 triples created
  by translation normalisation. Final deck: **10,090 cards**, 0 duplicate
  triples, 0 missing/orphan enrichment, 0 bad highlights, 709 notes. Example
  duplicate groups remain 247 (mostly synonyms sharing a sentence).
- 2026-11-04: hardened `audit-vocab.mjs --apply`: preserve the CSV header, never
  copy an example sentence into a translation column, and shard/merge results
  without dropping the base results.
- 2026-11-04: drill answer flow changed: removed the context heading, added a
  small POS tag to the English prompt, kept the context after answering, filled
  the blanks with the inflected form, and appended the dictionary answer. The
  Learn strip no longer repeats examples; it keeps forms/notes/Enlarge/Next.

