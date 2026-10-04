# lost-board — PLAN

Cross-machine tracking for the project. **This file + `spec.md` live in the repo** so work can
continue from any machine. Keep this updated as you go.

## Status
- **Phase 0 (Scaffold):** in progress — project skeleton + native commands are in place.
- **Phase 1 (MVP):** not started.
- **Phase 2:** not started (synced lyrics etc.).

## Locked decisions (from spec)
| Decision | Value |
|---|---|
| Name | **lost-board** |
| Architecture | **Tauri v2** desktop app, local-only, single user |
| Grid | **Fixed-column grid** (drag + resize, snap to cells) |
| Auth | **None** (single user, localhost only) |
| Weather | **Per-compartment locations** + world-clock time per location |
| Healthcheck | **Probe-only** GET to /health, green/red + latency |
| Spotify | play/pause/next/prev/volume in MVP; **synced lyrics → Phase 2** |
| Azure | PAT from Settings (read-only live tiles); deep-links without PAT |
| Solutions | Clicking a solution **opens** the `.sln` — it does **not** build it |

## Roadmap

### Phase 0 — Scaffold (current)
- [x] Tauri v2 project scaffold (Rust backend + plain-JS frontend)
- [x] Native commands: `open_folder`, `open_solution`, `open_url`, `get_system_stats`
- [x] Frontend grid + compartment rendering shell
- [x] Settings overlay shell (tabs for each compartment type)
- [x] State persistence (localStorage)
- [x] `spec.md` + `PLAN.md` + `README.md` in repo
- [ ] Verify compile on a machine with MSVC Build Tools (`cargo build`)
- [ ] Config persistence to app-data JSON (migrate from localStorage) — see spec NFR

### Phase 1 — MVP (all compartments)
- [ ] **Folders / Solutions** compartment: pick paths in Settings, click to open
- [ ] **Bookmarks** compartment: CRUD + click-to-open
- [ ] **Azure DevOps** compartment: repo config, deep-links (PR + Files) to specific repo
- [ ] **Azure live tiles** (needs PAT from Settings, stored in OS secret store): open-PR count
- [ ] **Spotify** compartment: OAuth PKCE, now-playing, play/pause/next/prev/volume
- [ ] **Weather + world clock** compartment: per-location conditions + local time
- [ ] **News** compartment: RSS feeds, headline list, click-through
- [ ] **Service Healthcheck** compartment: GET /health, green/red + latency
- [ ] **Grid polish:** real drag + resize with snap persistence (fixed-column grid)
- [ ] Play-test AC-001..AC-017 (see spec.md)

### Phase 2 — Enhancements
- [ ] **Spotify synced lyrics** (third-party provider, timeline sync)
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