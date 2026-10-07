# Implementation Plans — index

Plans for work that is **designed here, built on the work laptop** (which has the
MSVC toolchain to compile and test). Read the relevant file before implementing.

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

## Active plans

| Item | Plan / tracking | Spec |
|---|---|---|
| Background mode (tray + autostart + always-on-bottom) | [`background-mode.md`](background-mode.md) | `spec.md` §2.12, AC-018..020 |
| Vocab flashcard tile + drill popup | [`vocab-flashcard-popup.md`](vocab-flashcard-popup.md) | `spec.md` §2.13, AC-021..026 |
| Meme tile (rotation + captioning + expanded view) | [`meme-tile.md`](meme-tile.md) | `spec.md` §2.14, AC-027..032 |
| Healthcheck tab removal | [`healthcheck-tab-removal.md`](healthcheck-tab-removal.md) | `spec.md` §2.9/§7 (dropped) |
| Spotify queue-jump fast path | Issue #18 (code in issue) | `spec.md` FR-SPT-007 |
| Projects tile resurrect fix | Issue #19 (code in issue) | — (bugfix) |
| Scanner single-pass + symlinks | Issue #20 (code in issue) | `spec.md` FR-PRJ-001 |
| Config export/import | Issue #21 (design in issue) | not yet specced — spec it if picked up |

## Suggested build order (work laptop)

1. Healthcheck tab removal (trivial, warms up the build).
2. Issues #19 → #20 (small, contained, verifiable).
3. Background mode (needs the plan's verification steps + AC-018..020).
4. Vocab flashcard + popup (needs the 3-screen setup for AC-023 placement testing).
5. Meme tile (needs Pinterest URL + file-drop testing; record browser-tab drop verdict).
6. Issues #18 → #21 (need live Spotify / two-machine testing).
