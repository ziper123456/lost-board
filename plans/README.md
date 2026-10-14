# Implementation Plans — index (all items built 2026-10-08, kept for reference)

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

## Active plans — all built 2026-10-08, kept for reference

| Item | Plan / tracking | Spec |
|---|---|---|
| Background mode (tray + autostart + always-on-bottom) | [`background-mode.md`](background-mode.md) ✅ PR #30 | `spec.md` §2.12, AC-018..020 |
| Vocab flashcard tile + drill popup + TTS | [`vocab-flashcard-popup.md`](vocab-flashcard-popup.md) ✅ PRs #31, #33 | `spec.md` §2.13, AC-021..026, AC-034 |
| Meme tile (rotation + captioning + expanded view) | [`meme-tile.md`](meme-tile.md) ✅ PR #32 | `spec.md` §2.14, AC-027..033 |
| Calendar tile (lunar + moon phase + holidays) | [`calendar-tile.md`](calendar-tile.md) ✅ | `spec.md` §2.15, AC-035..037 |
| Healthcheck tab removal | [`healthcheck-tab-removal.md`](healthcheck-tab-removal.md) ✅ PR #29 | `spec.md` §2.9/§7 (dropped) |
| Spotify queue-jump fast path | Issue #18 ✅ PR #24 | `spec.md` FR-SPT-007 |
| Projects tile resurrect fix | Issue #19 ✅ PR #22 | — (bugfix) |
| Scanner single-pass + symlinks | Issue #20 ✅ PR #23 | `spec.md` FR-PRJ-001 |
| Config export/import | Issue #21 ✅ PR #25 | `spec.md` §5 |

## Suggested build order — completed 2026-10-08 in this order; remaining work is PLAN.md Phase 3

1. ~~Healthcheck tab removal~~ ✅ PR #29.
2. ~~Issues #19 → #20~~ ✅ PRs #22, #23.
3. ~~Background mode~~ ✅ PR #30.
4. ~~Vocab flashcard + popup (+TTS)~~ ✅ PRs #31, #33.
5. ~~Meme tile~~ ✅ PR #32.
6. ~~Issues #18 → #21~~ ✅ PRs #24, #25.
