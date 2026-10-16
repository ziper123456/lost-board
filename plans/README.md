# Implementation Plans — index (all items built through 2026-10-15, kept for reference)

Plans live here per feature; the conventions below still apply to new work.
Read the relevant file before implementing.

## Conventions (both machines)

1. **Compiler is truth.** Sketches are uncompiled reference — verify every API at
   build time and fix drift.
2. **Close the loop (blocking, not prose).** Every implementation commit must do all three:
   (a) reference the plan file (e.g. `implements plans/background-mode.md`);
   (b) append dated entries to that plan's **Corrections log** (§8) for every API name
   that differed from the sketches;
   (c) state divergences (what changed from the plan and why).
   A commit without (b) is the early-warning sign from the 2026-10-07 pre-mortem —
   it means drift is going unrecorded.
3. **One plan per work item.** Small fixes live as GitHub issues (with code);
   larger features get a file here. Never duplicate code in both places —
   point at the single source.

## Active plans — all built through 2026-10-15, kept for reference

| Item | Plan / tracking | Spec |
|---|---|---|
| Background mode (tray + autostart + always-on-bottom) | [`background-mode.md`](background-mode.md) ✅ PR #30 | `spec.md` §2.12, AC-018..020 |
| Vocab flashcard tile + drill popup + TTS | [`vocab-flashcard-popup.md`](vocab-flashcard-popup.md) ✅ PRs #31, #33 | `spec.md` §2.13, AC-021..026, AC-034 |
| Meme tile (rotation + captioning + expanded view) | [`meme-tile.md`](meme-tile.md) ✅ PR #32 | `spec.md` §2.14, AC-027..033 |
| Calendar tile (lunar + moon phase + holidays) | [`calendar-tile.md`](calendar-tile.md) ✅ PR #41 | `spec.md` §2.15, AC-035..037 |
| Vocab spaced repetition (SM-2) | [`vocab-srs.md`](vocab-srs.md) ✅ PR #43 | `spec.md` §2.13, FR-VOC-010..014 |
| Vocab drill sessions (cap + struggling pile + practice) | [`vocab-sessions.md`](vocab-sessions.md) ✅ PR #45 | `spec.md` §2.13, FR-VOC-015..016 |
| UI overhaul — design-token system | [`design-tokens.md`](design-tokens.md) ✅ PR #42 | `spec.md` §2.16, FR-DSN-001..004 |
| Healthcheck tab removal | [`healthcheck-tab-removal.md`](healthcheck-tab-removal.md) ✅ PR #29 | `spec.md` §2.9/§7 (dropped) |
| Spotify queue-jump fast path | Issue #18 ✅ PR #24 | `spec.md` FR-SPT-007 |
| Projects tile resurrect fix | Issue #19 ✅ PR #22 | — (bugfix) |
| Scanner single-pass + symlinks | Issue #20 ✅ PR #23 | `spec.md` FR-PRJ-001 |
| Config export/import | Issue #21 ✅ PR #25 | `spec.md` §5 |

**Smaller PRs without a plan file** (shipped directly): themes (#35), vocab drill options
(#36), Spotify volume/progress/seek (#37), tile context menu (#38), animated weather card (#39),
per-tile Hide header (#40), vocab mastery view (#44). See `PLAN.md` Phase 2d and `REVIEW.md` §12.

## Build order (phases through 2026-10-15; remaining work is PLAN.md Phase 3)

1. ~~Healthcheck tab removal~~ ✅ PR #29.
2. ~~Issues #19 → #20~~ ✅ PRs #22, #23.
3. ~~Background mode~~ ✅ PR #30.
4. ~~Vocab flashcard + popup (+TTS)~~ ✅ PRs #31, #33.
5. ~~Meme tile~~ ✅ PR #32.
6. ~~Issues #18 → #21~~ ✅ PRs #24, #25.
7. ~~Themes, context menu, hide header, weather card, Spotify seek~~ ✅ PRs #35, #37..#40.
8. ~~Calendar tile + design tokens~~ ✅ PRs #41, #42.
9. ~~Vocab SRS + mastery + drill sessions/practice~~ ✅ PRs #43..#45.
