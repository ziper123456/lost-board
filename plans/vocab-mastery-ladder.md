# Plan - Vocab mastery ladder + forgiving lapses

Status: **Built** (branch `feat/vocab-mastery-ladder`, 2026-11-04, PR pending).

Spec: `spec.md` §2.13, FR-VOC-010/014, AC-039.

## Goal

Make mastery feel reachable without weakening what "Mature" means:

- Keep **Mature = interval ≥ 21 days**.
- Show the intermediate **Strong** milestone (14–20 days).
- Separate **Relearning** (`reps = 0`, just failed) from **Learning**.
- Show the full ladder in Settings and the drill progress line.
- On a fail, keep **half the previous interval** as a relearning step instead of
  resetting the card to zero; cap that interval below Mature and reduce the ease
  penalty from −0.2 to −0.15.

Rationale from the live deck on 2026-11-04: 435 cards with SRS state, 303 were
"learning" (all `reps = 0` after a fail), 131 young, 1 mature, 993 lapses. That
was mostly relearning being mislabelled, not proof that 21 days is too strict.

## Locked decisions

| Decision | Value |
|---|---|
| New | no SRS entry |
| Relearning | `reps = 0` (failed; due again in ~10 min) |
| Learning | `0 < interval < 6` days |
| Young | `6 <= interval < 14` days |
| Strong | `14 <= interval < 21` days |
| Mature | `interval >= 21` days (unchanged) |
| Fail interval | `clamp(previous / 2, 1, 20)` days |
| Fail ease | `-0.15`, floor 1.3 |
| Fail due | `now + 10 minutes` |
| Recovery | first pass preserves the half-interval; second pass never drops below 6 days |
| Practice / exposure / lyrics | still ungraded |

## Changes

- `src-tauri/src/lib.rs`
  - `Mastery` gains `Relearning` and `Strong`; add `LEARNING_DAYS` and `STRONG_DAYS`.
  - `sm2_next`: half-interval lapse, softer ease penalty, preserve the lapse
    interval through reps 1 and 2.
  - `SrsStats` / `CategoryStat`: add `relearning` and `strong`.
  - `DueCard`: add `stage`, `interval_days`, `reps`, `lapses` for per-card progress.
  - `vocab_record_review` returns the post-review `ReviewState`; practice batch
    returns `DueCard` too, so practice can show a read-only level.
  - Tests: bucket boundaries, fail/recovery, cannot stay Mature after a fail,
    due-card progress, and the post-review state.
- `src/main.js`
  - Mastery bar segments: mature / strong / young / learning / relearning / new.
  - Progress text and milestone tooltip; category table gains Strong + Relearn.
- `src/styles.css`: colours for `strong` and `relearning`.
- `src/drill.html`
  - A per-word level bar under the prompt, with 6/14/21-day ticks.
  - Pre-answer stage + `interval / 21d`; read-only in practice/exposure; hidden
    for lyrics.
  - After a review, update the bar from the backend result and show
    `Good · Young → Strong · 6d → 15d · next in 15d` (or the fail equivalent).
  - Aggregate Strong/Relearning counts remain in the footer progress line.
- `spec.md`: FR-VOC-010/014 and AC-039 describe the ladder and half-lapse.

## Verification

- `cargo test --lib` (37 tests at implementation time).
- `node --check src/main.js` / extracted drill script syntax check.
- Manual: Settings → Vocab distribution; fail a mature card and confirm it
  becomes Relearning (not Mature), then recovers at half the old interval.
  In the drill, check the bar before answering and the old→new interval note
  after answering.

## Corrections log

- 2026-11-04: plan created and implemented on `feat/vocab-mastery-ladder`.
  Implementation matches the sketch; no API drift. `cargo test --lib` passes.
- 2026-11-04: added per-card `stage`/`interval_days` to `DueCard` so the drill
  can show `this young 6/21d` instead of only aggregate stats; new unit test.
- 2026-11-04: kept `vocab_due_card`'s SRS-off behavior intact (exposure only);
  the due filter runs only when SRS is enabled. `cargo test --lib` => 36 passing.
- 2026-11-04: current-word status bar follow-up. `vocab_record_review` now
  returns `ReviewState`; the drill shows pre-answer level and post-answer
  old→new interval. Practice uses `DueCard` read-only; lyrics hide the bar.
  `cargo test --lib` => 37 passing.
