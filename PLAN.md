# lost-board — PLAN

Cross-machine tracking for the project. **This file + `spec.md` live in the repo** so work can
continue from any machine. Keep this updated as you go.

## Status (updated 2026-10-15)
- **Phase 0 (Foundation):** done — scaffold, native commands, app-data persistence, fixed-column grid with drag/resize/snap, timer lifecycle.
- **Phase 1 (Core launchers):** done — Folders & Files, Projects (root scanning), Bookmarks, Azure deep-links.
- **Phase 2 (Live information):** done — Weather + world clock, News, Translate, Spotify (+shuffle/repeat/queue jump/seek), Frame.
- **Phase 2b (Desktop integration):** done — Background mode (tray + autostart + always-on-bottom), Config export/import, editable + persisted zoom.
- **Phase 2c (New tiles):** done — Vocab flashcards (tile + drill popup + per-tile speech), Memes (rotation + collection + captioning + GIF/PNG export).
- **Phase 2d (UI + Calendar + Vocab SRS, 2026-10-09..15):** done — 6 extra themes (#35), tile right-click context menu (#38), animated country-themed weather card (#39), per-tile Hide-header mode (#40), Calendar tile (Vietnamese lunar + moon phase + holidays, #41), design-token layer + Design tab (#42), Vocab drill options — category filter / 9-position placement / instant reveal (#36), **SM-2 spaced repetition** (#43), **mastery buckets + per-category table** (#44), **capped drill sessions + struggling-first pile + ungraded practice mode** (#45).
- **Phase 2e (Lyrics tile, 2026-10-23):** done — separate synced Lyrics tile from **LRCLIB** (focus prev/current/next + full list, shared playback poll, per-tile settings, dynamic cover colours) **plus translation** (offline language detection, up to 2 of EN/DE/ES, opencode LLM default / DeepL fallback).
- **Dropped:** Service Healthcheck (tab removed), git-status tile, sticky notes, Azure PAT live tiles, vocab-app gateway button. (Local clock covered by weather tiles; media keys covered by keyboard.)
- **Next up:** Phase 3 backlog below (offline badges, AC play-test, macOS/Linux, forecast detail). No open PRs, no open issues.
- **Review:** see `REVIEW.md` (base review + deltas; per-PR reviews through #45).

## Locked decisions (from spec)
| Decision | Value |
|---|---|
| Name | **lost-board** |
| Architecture | **Tauri v2** desktop app, local-only, single user |
| Grid | **Fixed-column grid** (drag + resize, snap to cells) |
| Auth | **None** (single user, localhost only) |
| Weather | **Per-compartment locations** + world-clock time per location |
| Healthcheck | **Dropped** (probe tile removed, PR #29) |
| Spotify | play/pause/next/prev/volume in MVP; **synced lyrics via a separate LRCLIB tile** |
| Azure | PAT from Settings (read-only live tiles); deep-links without PAT |
| Solutions | Clicking a solution **opens** the `.sln` — it does **not** build it |

## Implementation sequence

Build the shared foundation before individual compartments. This order keeps settings, layout,
data storage, error states, and secrets consistent across the dashboard.

1. **Development and build foundation**
   - Install the Node, Rust, and MSVC prerequisites on each development machine.
   - Make `npm run dev` start a frontend server at the URL configured for Tauri.
   - Verify `npm run build` produces a Windows bundle.
2. **Local data foundation**
   - Move ordinary configuration and grid layout from browser `localStorage` to JSON under the app-data directory.
   - Back up corrupt configuration and restore safe defaults.
   - Add OS secret-store access for credentials; never serialize secrets with ordinary config.
3. **Grid and settings foundation**
   - Replace the scaffold drag behavior with fixed-column snapping, collision handling, resize handles, and persisted positions/sizes.
   - Make Settings own reusable add, edit, and remove flows that update tiles immediately.
4. **Core launchers**
   - Implement folders and solutions with native pickers, click-to-open actions, and missing-path states.
   - Implement bookmark CRUD and URL launching.
   - Implement Azure repository configuration and correct PR/Files deep links; add optional authenticated live tiles once secret storage exists.
5. **Live information compartments**
   - Implement per-location weather and world clocks.
   - Implement RSS news and service health checks.
   - Implement Spotify OAuth and playback controls.
6. **Verification and polish**
   - Add offline/stale states, resolve timer cleanup, and play-test AC-001..014 and AC-018..037.

## Roadmap

### Phase 0 — Foundation (current)
- [x] Tauri v2 project scaffold (Rust backend + plain-JS frontend)
- [x] Native commands: `open_folder`, `open_solution`, `open_url`, `get_system_stats`
- [x] Frontend grid + compartment rendering shell
- [x] Settings overlay shell (tabs for each compartment type)
- [x] State persistence (localStorage)
- [x] `spec.md` + `PLAN.md` + `README.md` in repo
- [x] Verify compile on a machine with MSVC Build Tools (`cargo build`) — verified via `npm run dev` on Windows
- [x] Config persistence to app-data JSON (migrate from localStorage) — awaiting Rust build verification
- [x] Make the configured Tauri development URL available through an npm-managed frontend server
- [x] Replace scaffold drag behavior with collision-aware snap and resize behavior
- [x] Clear compartment refresh timers when tiles re-render or are removed

### Phase 1 — Core launchers
- [x] **Folders & Files** compartment: pick paths in Settings (or OS drag-drop), click to open via association
- [x] **Projects** compartment: repo-root scanning, per-project Folder + Solution buttons, re-scan, manual rows
- [x] **Bookmarks** compartment: CRUD + click-to-open
- [x] **Azure DevOps** compartment: repo config, deep-links (PR + Files) to specific repo
- [x] Azure live tiles (open PR count / latest commit) — **dropped** (deep-links are enough; spec §7)

### Phase 2 — Live information
- [x] **Weather + world clock** compartment: per-location conditions + local time
- [x] **News** compartment: RSS feeds, headline list, click-through
- [x] **Translate** compartment: 3 language fields (EN/DE/ES default), DeepL-backed, key in OS secret store
- [x] **Frame** compartment: photo/GIF tile with fit modes
- [x] ~~**Service Healthcheck** compartment~~ — **dropped** (dead tab removed, PR #29)
- [x] **Spotify** compartment: OAuth PKCE, now-playing, play/pause/next/prev/volume, shuffle/repeat, queue + click-to-jump
- [x] Config export/import (two-machine setup, secrets excluded) + editable/persisted zoom

### Next — all built 2026-10-08 (was: Background mode + Vocab, specced + planned)
- [x] Tray icon + menu (Show/Hide/Quit) — FR-WIN-001 → `plans/background-mode.md` (PR #30)
- [x] Autostart toggle in Settings — FR-WIN-002 → `plans/background-mode.md` (PR #30)
- [x] Always-on-bottom + fullscreen + skip taskbar — FR-WIN-003/004 → `plans/background-mode.md` (PR #30)
- [x] AC-018..020 implemented (manual play-test recommended on next run)
- [x] Vocab flashcard tile + drill popup + per-tile speech (FR-VOC-001..009, AC-021..026, AC-034) → `plans/vocab-flashcard-popup.md` (PRs #31, #33)
- [x] Meme tile: rotation (top-100 + curated) + local captioning + expanded view + search box + GIF/PNG export (FR-MEM-001..007, AC-027..033) → `plans/meme-tile.md` (PR #32)
- [x] Removed dead Healthcheck tab from UI → `plans/healthcheck-tab-removal.md` (PR #29)
- [x] Implementation plans index + conventions: `plans/README.md`

### Phase 2d — UI polish, Calendar, Vocab SRS (built 2026-10-09 .. 10-15)
- [x] 6 extra themes — Dracula, Nord, Solarized Dark/Light, Rosé Pine, Gruvbox (PR #35)
- [x] Vocab drill options — category filter, 9-position placement, instant reveal (PR #36)
- [x] Spotify responsive volume slider + locally-interpolated progress/seek (PR #37)
- [x] Tile right-click context menu (PR #38)
- [x] Country-themed animated weather card (PR #39)
- [x] Per-tile Hide-header (bare/immersive) mode (PR #40)
- [x] Calendar tile — Vietnamese lunar + moon phase + holidays → `plans/calendar-tile.md` (PR #41)
- [x] Design-token layer + Design tab → `plans/design-tokens.md` (PR #42)
- [x] Vocab spaced repetition (SM-2) → `plans/vocab-srs.md` (PR #43)
- [x] Vocab mastery buckets + per-category table (PR #44)
- [x] Vocab drill sessions — card cap + struggling-first pile + practice mode → `plans/vocab-sessions.md` (PR #45)

### Phase 3 — Enhancements and verification
- [ ] Offline / stale-data badges across remote compartments
- [ ] Play-test AC-001..014 and AC-018..037 (see spec.md)
- [x] ~~Spotify synced lyrics~~ — **built** as a separate LRCLIB Lyrics tile (Phase 2e)
- [ ] macOS / Linux builds
- [ ] Multi-screen / status-bar support
- [ ] Weather: forecast detail / multiple units

## Prerequisites per machine (to build)
- Rust (stable) — `rustup.rs`
- Windows: **Visual Studio Build Tools** ("Desktop development with C++") for the MSVC linker
- Node.js (for the Tauri CLI)

## Notes / gotchas
- Compiling requires the MSVC linker (`link.exe`) from VS Build Tools. Without it, `cargo build`
  fails at link time — install Build Tools first, not just Rust.
- `open_solution` uses the OS file association → routes to Visual Studio on Windows. It only opens.
- The frontend has no build step; `window.__TAURI__` is injected by Tauri at runtime.
