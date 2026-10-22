# Plan — Vocab part-of-speech filter

Status: ✅ built. Builds on `vocab-details.md` (which supplies per-card `pos`).
Spec: `spec.md` §2.13, FR-VOC-021 / AC-044.

## Goal

Let the drill be scoped by **part of speech** (noun / verb / adjective / adverb / phrase /
other) in addition to topic categories — e.g. drill only verbs (useful for conjugation), or
only nouns (useful for gender/articles).

## Decisions

- **Two facets, AND-combined**: a card passes if it matches an enabled category (or none are
  enabled) **and** an enabled POS (or none). Empty = no constraint.
- POS is the **authoritative grammar** label from enrichment (`cards-extra.json.pos`). The CSV's
  `Verbs`/`Adjectives` *categories* remain as topic filters (they overlap but aren't identical;
  e.g. "to play the piano" is tagged *Activities* but is a verb).
- Scopes the **drill popup and the mastery stats**; the tile + its due badge stay whole-deck
  (consistent with the category filter being "popup only").

## Implementation

**Rust**
- `pos_passes(pos, card_pos)` — pure helper (unit-tested).
- `vocab_filtered(app, all, categories, pos)` — category AND pos; the enrichment map loads
  lazily only when a POS filter is active (so empty-filter calls stay cheap).
- Commands gain a `pos` argument: `vocab_due_card`, `vocab_due_batch`, `vocab_practice_batch`,
  `vocab_due_count`, `vocab_srs_stats`, `vocab_category_stats`.
- `vocab_pos_counts` — per-POS card counts for the settings checkboxes.
- `VocabPopupConfig` carries `pos`; `open_vocab_popup` / `open_drill_window` / `vocab_tick`
  thread it through (`drillPos` in the state file).

**Frontend**
- `state.vocab.drillPos` (array) next to `drillCats`.
- Settings → Vocab: a "Part of speech" checkbox group with counts, "popup only — empty = all".
- Native wrappers pass `pos`; the drill reads `cfg.pos` and filters its batch / progress calls.

## Corrections log

- Built as planned; no API drift. `vocab_filtered` short-circuits before touching the 4 MB
  enrichment map when `pos` is empty. Tests: `cargo test --lib` includes `pos_filter_logic`
  (12 passing); `npm run test:match` / `test:conjugate` unchanged.
- PR review follow-ups: missing enrichment is treated as `"other"` in `vocab_filtered` (so
  filtering and the POS counts agree); `vocab_pos_counts` is cached (immutable data); the
  empty-result message now mentions the category / part-of-speech filter.
