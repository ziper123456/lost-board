# lost-board

Personal dashboard launcher — a single-user, local-only desktop app.

It replaces a browser start page and scattered bookmarks with a customizable grid of live
"compartments": open folders / solutions, jump to Azure DevOps repos, control Spotify, and see
weather (with world clocks), news, service healthchecks, and system stats.

> **Spec & progress tracking live in this repo** so work can continue on any machine (e.g. a work PC).
> See [`spec.md`](spec.md) (requirements) and [`PLAN.md`](PLAN.md) (roadmap / TODO).

## Architecture

- **Frontend:** plain HTML + CSS + JS (no bundler) — fast to start, easy to reason about.
- **Backend:** [Tauri v2](https://v2.tauri.app) (Rust). Exposes native commands a webpage cannot do:
  - `open_folder` / `open_solution` / `open_url` — open folders, files (`.sln` opens in VS, **never builds**), URLs
  - `pick_folder` / `pick_solution` / `pick_icon` / `pick_image` — native file pickers
  - `classify_path` — classify a dropped path (dir / solution / file / missing)
  - `scan_project_root` — scan a repo root into projects with solutions
  - `get_system_stats` — live CPU / RAM usage
  - `fetch_rss` / `cache_favicon` — CORS-free feed fetch, on-disk favicon cache
  - `load_state` / `save_state` — app-data JSON config with schema validation + `.bak` on corrupt
  - `set_deepl_key` / `deepl_translate` (+ status/clear) — DeepL via OS secret store
  - `spotify_*` — OAuth PKCE, now-playing, play/pause/skip/shuffle/repeat/volume/queue

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
  styles.css          # theme + layout
  main.js             # state, grid rendering, compartment logic, settings wiring
src-tauri/            # Rust backend (Tauri v2)
  Cargo.toml
  tauri.conf.json
  capabilities/default.json
  src/lib.rs          # native commands
  src/main.rs         # entry point
spec.md               # feature specification (EARS requirements, ACs, error handling)
PLAN.md               # roadmap + implementation TODO (cross-machine)
```

## Status (updated 2026-10-07)

MVP is built: fixed-column grid (drag + snap + resize), Folders & Files, Projects (root
scanning), Bookmarks, Azure deep-links, Weather + world clocks, News, Translate, Frame,
System stats, and Spotify (playback + shuffle/repeat + queue). **Still to build:** Service
Healthcheck (tab exists, no logic yet). Details in [`PLAN.md`](PLAN.md), requirements in
[`spec.md`](spec.md), latest review in [`REVIEW.md`](REVIEW.md), open follow-ups as GitHub
issues #18, #19, #20.