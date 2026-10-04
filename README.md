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
  - `open_folder` — open a folder in the OS file explorer
  - `open_solution` — **open** a `.sln` via its OS file association (does **not** build it)
  - `open_url` — open a URL in the default browser
  - `get_system_stats` — live CPU / RAM usage

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

## Status

Scaffold complete. Fixed-column grid (drag + snap + resize) and the Folders/Solutions
compartment are done. Compartments still to build per [`PLAN.md`](PLAN.md): bookmarks, Azure,
Spotify, weather+world-clock, news, healthcheck.