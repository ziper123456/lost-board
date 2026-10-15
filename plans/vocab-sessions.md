# Plan — Vocab drill sessions (cap + struggling pile + practice mode)

Status: ✅ built (branch `feat/vocab-sessions`). Follows `vocab-srs.md` (SM-2) and the
mastery visibility change. Spec: `spec.md` §2.13, FR-VOC-015..016.

## Goal

Make the drill *spread* practice and give hard words more reps **without** letting
extra repetition inflate mastery.

## Core principle (the mastery rule)

A review counts toward the SRS schedule and toward mastery **only when the card
was due** — i.e. it was genuinely spaced. Early/extra repetitions are
**practice-only** and must never call `vocab_record_review`. This is what stops
massed (same-sitting) reps from gaming mastery, whatever pile they came from.
It reuses/extends the existing `gradeable = due` gate.

## What was built

1. **Session cap (Feature A)** — `vocab_due_batch(categories, limit, prefer_struggling)`
   returns up to `limit` **distinct due** cards (0 = all), shuffled, falling back to
   one exposure card (graded=false) when nothing is due. The popup loads a batch
   and steps through it, closing at the end (`Card i/N`).
2. **Struggling pile, tier 1 (B2a)** — `prefer_struggling` orders high-lapse due
   cards first. These reviews **count** (they are due/spaced).
3. **Practice mode, tier 2 (B2b)** — `vocab_practice_batch(categories, limit)`
   returns matching **not-due struggling** cards. Opened via the manual **Practice**
   buttons (Settings + tile). The popup shows a "Practice — not graded" badge and
   never records a review.

## Details

- Threshold: `STRUGGLE_LAPSES = 3` (shared with the "struggling" stat, so the pile
  and the number agree).
- `VocabPopupConfig` gained `session_size` (0 = all), `struggling_first`, `practice`.
  `open_drill_window`/`open_vocab_popup` take a `practice` flag; `session_size` /
  `struggling_first` are read from the state file (`vocab.cardsPerSession`,
  `vocab.strugglingFirst`).
- Scheduler coupling: **independent** — `everyMin` (cadence) and `cardsPerSession`
  (throughput) do not affect each other.
- Frontend: Settings → Vocab gets a "Cards per session" select (1/3/5/10/All due),
  a "Prioritize hard words" checkbox, and a "Practice hard words" button; the tile
  gets a compact **Practice** button.

## Corrections log

- 2026-10-15: built as planned; no API drift. `vocab_due_batch` uses `limit` /
  `preferStruggling`; `vocab_practice_batch` uses `limit`; both camelCased from the
  JS side. Pure helpers `pick_due_batch` / `pick_practice_batch` keep selection
  testable (Rust unit tests: cap, only-due, exposure fallback, struggling-first,
  practice pool). `cargo test --lib` → 10 passing.
