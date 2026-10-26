# lost-board

Personal dashboard launcher — a single-user, local-only desktop app.

It replaces a browser start page and scattered bookmarks with a customizable grid of live
"compartments": open folders / solutions / files, browse scanned repo projects, jump to Azure
DevOps repos, control Spotify, drill vocabulary with spaced repetition, rotate memes, and see
weather (with world clocks), news, a Vietnamese lunar calendar, translate text, framed photos,
and system stats. Tiles are themed (built-in themes + a design-token layer) with per-tile
context menus and an optional "hide header" immersive mode, and the board can be pinned as a
desktop background with tray + autostart.

> **Spec & progress tracking live in this repo** so work can continue on any machine (e.g. a work PC).
> See [`spec.md`](spec.md) (requirements) and [`PLAN.md`](PLAN.md) (roadmap / TODO).

## Architecture

- **Frontend:** plain HTML + CSS + JS (no bundler) — fast to start, easy to reason about.
- **Backend:** [Tauri v2](https://v2.tauri.app) (Rust). Exposes native commands a webpage cannot do:
  - `open_folder` / `open_solution` / `open_url` — open folders, files (`.sln` opens in VS, **never builds**), URLs
  - `pick_folder` / `pick_solution` / `pick_icon` / `pick_image` — native file pickers
  - `classify_path` — classify a dropped path (dir / solution / file / missing)
  - `scan_project_root` — scan a repo root into projects with solutions
  - `get_system_stats` — live CPU / RAM usage, disk usage, battery, uptime
  - `fetch_rss` / `cache_favicon` — CORS-free feed fetch, on-disk favicon cache
  - `load_state` / `save_state` — app-data JSON config with schema validation + `.bak` on corrupt
  - `export_config` / `import_config` — move the config to another machine (secrets never exported)
  - `backup_export` — timestamped bundle (config + localStorage + lyrics caches) to a chosen folder; keeps the newest 30
  - `set_deepl_key` / `deepl_translate` (+ status/clear) — DeepL via OS secret store
  - `spotify_*` — OAuth PKCE, now-playing, play/pause/skip/shuffle/repeat/volume/queue/jump
  - `set_autostart` / `autostart_enabled` — launch on login (tray icon + background behind-mode)
  - `read_vocab_cards` / `vocab_tick` (+ popup open/snooze/close, `vocab_popup_config`) — bundled CSV flashcards + drill popup
  - `vocab_due_card` / `vocab_due_batch` / `vocab_practice_batch` / `vocab_record_review` — drill session selection + SM-2 grading (due cards, struggling-first, ungraded practice)
  - `vocab_srs_stats` / `vocab_category_stats` / `vocab_pos_counts` / `vocab_srs_enabled` / `vocab_set_srs` / `vocab_reset_srs` — mastery buckets, per-category breakdown, part-of-speech counts, SRS toggle/reset
  - `vocab_card_detail` / `vocab_set_popup_expanded` — per-card usage/conjugation enrichment + in-place drill resize
  - `set_popup_theme` / `get_popup_theme` — push the board's design tokens into the drill popup window
  - `fetch_image_cached` / `import_image_file` / `load_cached_image` — disk-cached image pool (meme tile)
  - `save_meme_png` / `save_meme_source` / `save_meme_captioned_gif` — captioned/static/animated exports

## Prerequisites (one-time, per machine)

- [Rust](https://rustup.rs) (stable toolchain)
- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  with the "Desktop development with C++" workload (provides the MSVC linker) — **required to compile**.
  (If MSVC is absent, `cargo build` will fail at the linking step.)
- [Node.js](https://nodejs.org) (for the Tauri CLI)

## Run / Build

```bash
npm install          # installs the Tauri CLI
npm run dev          # runs the app in a dev window (frontend served from src/)
npm run build        # produces a release bundle in src-tauri/target/release/
```

To run in a plain browser for quick UI prototyping (native calls no-op):

```bash
npx serve src        # or open src/index.html — native features are stubbed
```

## Project layout

```
src/                  # frontend (HTML/CSS/JS)
  index.html          # topbar, dashboard grid container, settings overlay
  styles.css          # theme tokens + layout
  main.js             # state, grid rendering, compartment logic, settings wiring
  drill.html          # vocab drill popup window (session loop + practice mode)
  lunar.js            # Vietnamese lunar calendar + moon phase (calendar tile)
  holidays.js         # offline holiday computation (Vietnam / Germany / Pakistan)
src-tauri/            # Rust backend (Tauri v2)
  Cargo.toml
  tauri.conf.json
  capabilities/default.json   # main window permissions
  capabilities/drill.json     # drill popup permissions
  resources/cards.csv # bundled vocabulary list (versioned snapshot)
  src/lib.rs          # native commands
  src/main.rs         # entry point
spec.md               # feature specification (EARS requirements, ACs, error handling)
PLAN.md               # roadmap + implementation TODO (cross-machine)
plans/                # per-feature implementation plans + corrections logs
```

## Status (updated 2026-10-15)

Everything planned is built: fixed-column grid (drag + snap + resize, editable zoom),
Folders & Files, Projects (root scanning), Bookmarks, Azure deep-links, Weather (with an
animated weather card) + world clocks, News, Translate, Frame, System stats, Spotify
(playback + shuffle/repeat + queue jump + seek), **Lyrics (synced from LRCLIB)**, Calendar
(Vietnamese lunar + moon phase +
holidays), Background mode (tray + autostart + always-on-bottom), Config export/import, six
extra themes plus a design-token layer (Design tab, including optional dynamic colours from the
Spotify cover), per-tile right-click context menus and a
Hide-header mode, and Vocab (flashcard tile + drill popup + per-tile speech + **SM-2 spaced
repetition** with mastery buckets, a per-category breakdown, capped drill sessions, a
struggling-first pile and an ungraded practice mode). Service Healthcheck was dropped and its
tab removed. **No open PRs, no open issues.** Details in [`PLAN.md`](PLAN.md), requirements in
[`spec.md`](spec.md), review history in [`REVIEW.md`](REVIEW.md).