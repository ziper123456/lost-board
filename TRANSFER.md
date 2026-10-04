# lost-board — Transfer / Handoff Note

**Purpose:** This file tells the agent on the next machine what the project is, what state it's in,
and exactly what to do next. Read this first.

> Companion files: [`spec.md`](spec.md) (full requirements) · [`PLAN.md`](PLAN.md) (roadmap/TODO) ·
> [`README.md`](README.md) (run/build instructions).

---

## 1. What is this project?

A **single-user, local-only desktop dashboard** ("launcher + info hub") built on **Tauri v2**.
It renders a customizable **grid of compartments** the user can drag/resize, each showing live data
or a launcher action. All compartments are configured through a dedicated **Settings page**.

## 2. Current state (what's already done)

Scaffold is complete and pushed. The repo is at a clean, working baseline on `main`.

Done:
- [x] Tauri v2 project (Rust backend + plain-JS frontend, **no bundler**)
- [x] Native Rust commands in `src-tauri/src/lib.rs`:
  - `open_folder(path)` — open a folder in the OS file explorer
  - `open_solution(path)` — **open** a `.sln` via OS file association (**does NOT build it** — this is intentional)
  - `open_url(url)` — open URL in default browser
  - `get_system_stats()` — live CPU % + RAM (uses `sysinfo`)
- [x] Frontend `src/`: grid container, compartment renderer, Settings overlay (tabs per compartment type), localStorage persistence, drag-to-reorder (scaffold-level)
- [x] `spec.md`, `PLAN.md`, `README.md`, `.gitignore`, `package.json`, Tauri CLI installed (`node_modules` present)

## 3. ⚠️ FIRST THING — prerequisite check (the known blocker)

**This project does NOT yet compile on a machine without MSVC Build Tools.** The Rust toolchain
installed is `x86_64-pc-windows-msvc`, which requires the Microsoft linker (`link.exe`).

Before doing anything else, verify and fix the toolchain:

```powershell
# 1. Confirm Rust is installed and which toolchain is default
cargo --version
rustup show

# 2. Check the linker is available (this is what's missing on the dev machine)
where.exe link.exe

# 3. If link.exe is NOT found, install VS Build Tools (needs admin / UAC):
#    - Install "Visual Studio Build Tools 2022" from https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
#    - OR via winget (will prompt for elevation):
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

**Confirm it builds before writing any new code:**

```powershell
npm install        # if node_modules is missing
npm run dev        # or: cd src-tauri; cargo build
```

If it fails at the **link step** with `linker 'link.exe' not found`, MSVC Build Tools are still
missing — resolve that first. Do not proceed past this step until a build succeeds.

## 4. What to do next (in order)

Follow the roadmap in [`PLAN.md`](PLAN.md). Recommended next work items (start at the top):

1. **Folders / Solutions compartment** (highest value, simplest)
   - Settings: add a **native file/folder picker** (Tauri dialog plugin) so the user browses instead of typing paths.
   - Store paths in state; render a launcher tile per configured folder/solution.
   - Click tile → call `open_folder` / `open_solution`.
   - Degraded state (FR-DIR-003): if the path no longer exists, show "path not found", don't crash.
2. **Bookmarks compartment** — CRUD in Settings + click-to-open via `open_url`.
3. **Azure DevOps compartment** — repo config (org/project/repo), deep-links to PR + Files for the **specific** repo (not last-opened), plus optional live tiles using a PAT (stored via OS secret store).
4. **Weather + world-clock compartment** — per-location conditions + local time (Open-Meteo, no key).
5. **News compartment** — RSS feeds, headline list, click-through.
6. **Service Healthcheck compartment** — GET configured `/health`, green/red + latency.
7. **Spotify compartment** — OAuth PKCE, now-playing, play/pause/next/prev/volume (synced lyrics = Phase 2).

## 5. Key constraints to respect (from the spec)

- **Single user, local only. No auth, no accounts, no cloud sync.**
- **Grid = fixed-column** (snap to cells, no overlap), drag + resize, persist layout.
- **`open_solution` must only OPEN the file — never build it.**
- Weather: **per-compartment** locations (not one global) + world-clock time.
- Healthcheck: **probe-only**, observe; no start/stop/restart actions.
- Secrets (Azure PAT, Spotify token, healthcheck tokens): **OS secret store**, never logged or written to config/git.
- Cross-machine: commit work to `main` and push when done so the user can switch machines.
- The frontend has **no build step**; Tauri injects `window.__TAURI__` at runtime (UI also runs in a plain browser in prototype mode).

## 6. Where each requirement lives

- Functional requirements (EARS): `spec.md` §2
- Acceptance criteria (testable): `spec.md` §4
- Error handling table: `spec.md` §5
- Implementation TODO checklist: `spec.md` §6 and `PLAN.md`
- Out of scope: `spec.md` §7

---

**Handoff complete.** When you've confirmed the build works and started the first compartment, update
`PLAN.md` to reflect progress and commit.