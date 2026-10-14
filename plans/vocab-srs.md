# Implementation Plan — Vocab spaced repetition (SRS)

> ✅ **Status: built (branch feat/vocab-srs).** Phase 1 (SM-2 core). Phase 2 (bidirectional) pending.

## 1. Goal

Make the vocab drill/tile schedule reviews instead of showing random cards — the
Flashcard/drill improvement. Spec: `spec.md` §2.13, FR-VOC-010..012. Methodology from
the installed `spaced-repetition` skill (clawic): retrieval over re-reading, expanding
intervals, honest grading, SM-2 with an interval cap.

## 2. Key design decisions

- **SM-2, not FSRS.** FSRS needs ~1k reviews of history to fit; SM-2 is the right fit for a
  fresh deck and is ~15 lines.
- **State lives Rust-side** in the state file (`vocab.srs`, keyed by card id) — one source of
  truth shared by the drill window and the tile (avoids cross-window JS sync).
- **Honest grading:** correct first try → `good`; correct after one wrong → `hard`;
  reveal (2 fails **or** the eye button) → `again` (fail). New cards start due.
- **Don't pre-empt the schedule:** when nothing is due, the drill shows a random card for
  passive exposure but does **not** grade it.
- **Interval cap (730 days)** guards SM-2's "interval explosion" (clawic's flagged weakness).

## 3. Changes

- `src-tauri/src/lib.rs`: `SrsEntry`, `sm2_next` (+3 unit tests), commands `vocab_due_card`,
  `vocab_record_review`, `vocab_due_count`, `vocab_reset_srs`, `vocab_set_srs`,
  `vocab_srs_enabled`.
- `src/drill.html`: uses `vocab_due_card`; grades the outcome (`good`/`hard`/`again`) and
  records only when the card was due.
- `src/main.js`: native wrappers; tile "Due today: N" badge; Settings → Vocab "Spaced
  repetition" (toggle + Reset progress).

## 4. Corrections log

- 2026-10-14: Phase 1 built. Phase 2 (bidirectional en↔es↔de cards, per clawic) pending.
- 2026-10-14: project's first unit tests added (`cargo test --lib`, 3 passing) for the SM-2 scheduler.
