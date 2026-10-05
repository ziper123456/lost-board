# lost-board — PLAN

Cross-machine tracking for the project. **This file + `spec.md` live in the repo** so work can
continue from any machine. Keep this updated as you go.

## Status
- **Phase 0 (Foundation):** in progress — project skeleton + native commands are in place; build tooling, app-data persistence, and the production grid still need completing.
- **Phase 1 (Core launchers):** not started.
- **Phase 2 (Live information):** not started.
- **Phase 3 (Enhancements):** not started (synced lyrics etc.).

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
   - Add offline/stale states, resolve timer cleanup, and play-test AC-001 through AC-017.

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
- [x] **Folders / Solutions** compartment: pick paths in Settings, click to open
- [x] **Bookmarks** compartment: CRUD + click-to-open
- [x] **Azure DevOps** compartment: repo config, deep-links (PR + Files) to specific repo
- [x] Azure live tiles (open PR count / latest commit) — **dropped** (deep-links are enough)

### Phase 2 — Live information
- [x] **Weather + world clock** compartment: per-location conditions + local time
- [x] **News** compartment: RSS feeds, headline list, click-through
- [ ] **Service Healthcheck** compartment: GET /health, green/red + latency
- [ ] **Spotify** compartment: OAuth PKCE, now-playing, play/pause/next/prev/volume

### Phase 3 — Enhancements and verification
- [ ] Offline / stale-data badges across remote compartments
- [ ] Play-test AC-001..AC-017 (see spec.md)
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
