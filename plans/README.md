# Implementation Plans — index

Plans for work that is **designed here, built on the work laptop** (which has the
MSVC toolchain to compile and test). Read the relevant file before implementing.

## Conventions (both machines)

1. **Compiler is truth.** Sketches are uncompiled reference — verify every API at
   build time, fix drift, and list corrections in the commit message.
2. **Close the loop.** Commit messages reference the plan file
   (e.g. `implements plans/background-mode.md`). If implementation diverged from
   the plan, say what and why.
3. **One plan per work item.** Small fixes live as GitHub issues (with code);
   larger features get a file here. Never duplicate code in both places —
   point at the single source.

## Active plans

| Item | Plan / tracking | Spec |
|---|---|---|
| Background mode (tray + autostart + always-on-bottom) | [`background-mode.md`](background-mode.md) | `spec.md` §2.12, AC-018..020 |
| Healthcheck tab removal | [`healthcheck-tab-removal.md`](healthcheck-tab-removal.md) | `spec.md` §2.9/§7 (dropped) |
| Spotify queue-jump fast path | Issue #18 (code in issue) | `spec.md` FR-SPT-007 |
| Projects tile resurrect fix | Issue #19 (code in issue) | — (bugfix) |
| Scanner single-pass + symlinks | Issue #20 (code in issue) | `spec.md` FR-PRJ-001 |
| Config export/import | Issue #21 (design in issue) | not yet specced — spec it if picked up |

## Suggested build order (work laptop)

1. Healthcheck tab removal (trivial, warms up the build).
2. Issues #19 → #20 (small, contained, verifiable).
3. Background mode (largest; needs the plan's verification steps + AC-018..020).
4. Issues #18 → #21 (need live Spotify / two-machine testing).
