---
type: spec
title: lost-board — Feature Specification
project: lost-board
date: 2026-10-07
status: living (MVP built; healthcheck pending; in review — see REVIEW.md)
decisions:
  arch: A (Tauri desktop app, local-only)
  scope: MVP all compartments except synced lyrics (phase 2)
  grid: fixed-column grid (snap to rows/columns)
  azure: deep-links only (PAT live tiles dropped — deep-links sufficient)
  spotify: play/pause/next/prev/volume + shuffle/repeat + queue in v1; synced lyrics phase 2
  weather: per-compartment locations + world-clock time per location
  healthcheck: GET probes to configured /health endpoints (green/red + latency) — not yet built
  launcher: folders + any file (open via OS association), plus Projects tile with root scanning
  extras: Translate (DeepL) + Frame (photo/GIF) tiles added beyond original scope
  auth: none (single user, localhost only)
related:
  - "[[Projects/mu-idle/plan.md]]"
---

# 🖥️ lost-board — Feature Specification

## 1. Overview & User Value

A **single-user, local-only desktop dashboard** that replaces a browser start page and scattered
bookmarks with a customizable grid of live "compartments." It is a personal launcher + at-a-glance
info hub: open folders / solutions, jump to Azure DevOps repos, control Spotify, and see weather,
news, and system stats — all in one resizable, drag-to-arrange grid.

**Value:** one place to start work every day. No more re-opening the same ADO repo, no more hunting
bookmarks, no separate Spotify widget or system monitor. Because it's a native Tauri app, it can do
things a website cannot: open a folder, launch a `.sln` in Visual Studio, and read CPU/RAM.

**Core principles (carried from the user's stated philosophy):**
- Instant startup (goal ~1s cold), zero friction.
- Personal-only — no auth, no accounts, no cloud sync.
- Everything configurable through a dedicated Settings page, not by editing files.

---

## 2. Functional Requirements (EARS format)

### 2.1 Compartment System (layout)

- **FR-LAY-000** The dashboard shall use a **fixed-column grid**: compartments snap to rows and
  columns, so drag and resize keep the layout tidy with no overlap.
- **FR-LAY-001** While the app is open, the dashboard shall render compartments as a draggable,
  resizable grid so the user can arrange them by drag and resize handles.
- **FR-LAY-002** When the user drags a compartment to a new position, the system shall reflow the
  grid and persist the layout so the arrangement survives a restart.
- **FR-LAY-003** When the user resizes a compartment via its resize handle, the system shall update
  the grid and persist the new size.
- **FR-LAY-004** When the user adds a compartment, the system shall insert it into the grid and
  persist it.
- **FR-LAY-005** When the user removes a compartment, the system shall remove it from the grid and
  persist the change.
- **FR-LAY-006** When the user reorders compartments, the system shall persist the order.

### 2.2 Settings Page

- **FR-SET-001** Where the user opens Settings, the system shall display a dedicated page to manage
  folders, solutions, bookmarks, Azure repos, and per-compartment configuration.
- **FR-SET-002** When the user adds, edits, or removes any configured item, the system shall persist
  the change and reflect it in the corresponding compartment immediately.
- **FR-SET-003** Where the user enters an Azure PAT, the system shall store it locally (not in git,
  not in cloud) and use it only for Azure DevOps API calls.

### 2.3 Compartment: Folders & Files Launcher

- **FR-DIR-001** When the user clicks a configured folder item, the system shall open that
  folder in the OS file explorer.
- **FR-DIR-002** When the user clicks a configured file item (including `.sln`), the system shall
  open the file via its registered OS file association (a `.sln` opens in Visual Studio).
  Opening a solution shall **not** build it.
- **FR-DIR-003** Where a configured file or folder is missing, the system shall show a degraded
  state instead of failing silently.
- **FR-DIR-004** When the user configures a folder or file in Settings, the system shall let them
  browse to the path (native file picker) rather than typing it.
- **FR-DIR-005** When the user drops a folder or file from the OS file explorer onto a launcher
  tile, the system shall add it to that tile's items (deduplicated, sorted).

### 2.3b Compartment: Projects (repo-root scanning)

- **FR-PRJ-001** When the user adds a repo root in Settings, the system shall scan each immediate
  subfolder as a project and find its solution (`.sln` first, then `.slnx`, then `.csproj`,
  searching downward, skipping hidden/build-output directories).
- **FR-PRJ-002** Each project shall show a Folder button (opens in explorer) and a Solution button
  (opens via file association); where no solution is found the Solution button shall be disabled.
- **FR-PRJ-003** When the user clicks Re-scan, the system shall refresh that root's project list.
- **FR-PRJ-004** The system shall allow manual project rows (folder + solution overrides) and
  per-root titles and colors.

### 2.4 Compartment: Bookmarks + Azure DevOps

- **FR-BMK-001** When the user clicks a bookmark compartment item, the system shall open the URL in
  the default browser.
- **FR-BMK-002** When the user configures an Azure repo, the system shall store org, project, and
  repo identifiers, and provide two deep-link actions: **Pull Requests** and **Files**.
- **FR-BMK-003** When the user clicks an Azure "Pull Requests" or "Files" action, the system shall
  open the deep-link that targets the **specific configured repo** (not the last-opened one).
- **FR-BMK-004** ~~Where a PAT is configured, the system shall show live tiles~~ — **dropped**
  (deep-links are sufficient; see §7).
- **FR-BMK-005** The system shall allow deep-link navigation without any PAT
  (bookmark-only mode).

### 2.5 Compartment: Spotify

- **FR-SPT-001** While Spotify is running and authorized, the system shall display the current
  track, artist, and album art.
- **FR-SPT-002** When the user clicks Play/Pause, the system shall toggle playback.
- **FR-SPT-003** When the user clicks Next/Previous, the system shall skip tracks.
- **FR-SPT-004** When the user adjusts the volume control, the system shall set Spotify's volume.
- **FR-SPT-005** Where Spotify is not running or not authorized, the system shall show a clear
  "connect / open Spotify" state rather than an error.
- **FR-SPT-006** The system shall show shuffle and repeat state synced from the player and allow
  toggling shuffle and cycling repeat (off → context → track → off). Smart Shuffle is read-only
  (not settable via the Web API) and shall be indicated as such.
- **FR-SPT-007** The system shall show the upcoming queue; when the user clicks a queue song, the
  system shall jump playback to it.

### 2.6 Compartment: Weather + World Clock (per location)

- **FR-WEA-001** When the user configures a location for a weather compartment, the system shall
  display current conditions and a short forecast from a free weather API (e.g., Open-Meteo, no key).
- **FR-WEA-002** Each weather compartment shall have its **own independently configured location**
  (not a single global location).
- **FR-WEA-003** While a weather compartment has a configured location, the system shall also
  display the **current local time / clock for that location** (world-clock style), updated in
  real time.

### 2.7 Compartment: News (RSS)

- **FR-NEW-001** When the user configures one or more RSS feeds, the system shall fetch and display
  the latest headlines per feed.
- **FR-NEW-002** When the user clicks a headline, the system shall open the article in the browser.
- **FR-NEW-003** Where a feed is unreachable, the system shall show that feed's state as failed
  without blocking the others.

### 2.8 Compartment: System Stats

- **FR-SYS-001** The system shall display current CPU usage and RAM usage, refreshed on an interval
  (e.g., every 1–2s).

### 2.10 Compartment: Translate (added beyond original scope)

- **FR-TRN-001** Each translate tile shall hold up to 3 language fields; when the user types in one
  and clicks its Translate button, the system shall fill the others via DeepL.
- **FR-TRN-002** The DeepL API key shall be stored in the OS secret store, never in config or git.

### 2.11 Compartment: Frame (added beyond original scope)

- **FR-FRM-001** When the user picks a local image or GIF for a frame tile, the system shall display
  it filling the tile (configurable fit: cover / contain / stretch).

### 2.9 Compartment: Service Healthcheck

- **FR-HLT-001** When the user configures a service healthcheck, the system shall periodically send
  a `GET` request to the service's health endpoint (configurable path, default `/health`).
- **FR-HLT-002** When a health probe returns a 2xx status, the system shall mark that service
  **healthy** (green).
- **FR-HLT-003** When a health probe returns a non-2xx status, times out, or fails to connect, the
  system shall mark that service **unhealthy** (red).
- **FR-HLT-004** The system shall display the **HTTP status and latency (ms)** for each service.
- **FR-HLT-005** When the user clicks a service tile, the system shall open the service's health
  endpoint in the browser.
- **FR-HLT-006** Health probes shall be configurable in Settings (URL, optional custom path,
  optional timeout, refresh interval, optional auth header/token).
- **FR-HLT-007** Where a service requires authentication, the system shall send the configured token
  as a header (e.g., `Authorization: Bearer <token>`) and store it via the OS secret store.

---

## 3. Non-Functional Requirements

### Performance
- Cold start: dashboard interactive within ~1s (Tauri + small footprint).
- No compartment shall block the UI thread during refresh (async fetch/commands).
- System stats refresh interval: 1–2s; news/weather refresh: configurable, default ~15 min.

### Security
- Azure PAT stored locally via the OS secret store (Tauri `stronghold` / keyring), **never** in plain
  config, git, or sent anywhere but the ADO API over HTTPS.
- All native commands (folder open, sln launch, system stats) are local-only; expose no network
  surface beyond Spotify/ADO/weather/news HTTPS calls.
- No authentication required — single user, localhost only (decision 7).

### Reliability / Data
- All layout + configuration persisted locally (JSON under app data dir).
- Corrupt/missing config → re-init defaults, keep a backup copy.
- Network compartments (Spotify, weather, news, Azure) must degrade gracefully when offline or when
  their service is unavailable.

### Portability
- Cross-platform intent: Windows first (Visual Studio + sln association), macOS/Linux as stretch.

---

## 4. Acceptance Criteria (Given/When/Then)

### AC-001: Grid arrange & persist
Given a dashboard with two compartments,
When the user drags compartment A next to compartment B and restarts the app,
Then the layout is restored exactly as arranged.

### AC-002: Resize persists
Given a resizable compartment,
When the user drags its resize handle larger and restarts the app,
Then the new size is retained.

### AC-003: Open folder
Given a configured folder compartment,
When the user clicks it,
Then the OS file explorer opens at that path.

### AC-004: Launch solution
Given a configured `.sln` compartment pointing at an existing file,
When the user clicks it,
Then Visual Studio opens with that solution loaded.

### AC-005: Missing solution degrades
Given a solution compartment whose `.sln` file has been deleted,
When the user clicks it,
Then the system shows a "file not found" message and does not crash.

### AC-006: Azure deep-link targets correct repo
Given an Azure repo configured for org X / project Y / repo Z,
When the user clicks the "Files" action,
Then the browser opens the files page for repo Z specifically, not the last-opened repo.

### AC-007: Azure live tile (PAT present) — DROPPED
~~Given a valid PAT and an Azure repo with ≥1 open PR,
When the dashboard refreshes,
Then the tile shows the count of open PRs for that repo.~~
Dropped with FR-BMK-004 (deep-links sufficient).

### AC-008: Azure bookmark-only mode (no PAT)
Given no PAT configured,
When the user clicks "Pull Requests",
Then the deep-link still opens the correct repo page (no error).

### AC-009: Spotify playback controls
Given Spotify is running and authorized,
When the user clicks Next,
Then playback skips to the next track.

### AC-010: Spotify not running
Given Spotify is not running,
When the dashboard loads the Spotify compartment,
Then it shows a "connect / open Spotify" prompt instead of an error.

### AC-011: System stats
Given the app is open,
When 5 seconds elapse,
Then CPU and RAM usage are displayed and updating on the configured interval.

### AC-012: Settings add a bookmark
Given the Settings page,
When the user adds a new bookmark URL,
Then the bookmark immediately appears in the Bookmarks compartment.

### AC-013: Weather per-location + clock
Given two weather compartments configured for different cities,
When the dashboard renders them,
Then each shows its own conditions and the correct current local time for its city.

### AC-014: Grid snapping
Given a fixed-column grid,
When the user drags a compartment,
Then it snaps into the nearest grid cell without overlapping neighbors.

### AC-015: Healthy service — NOT YET BUILT
Given a configured service whose health endpoint returns 200,
When the dashboard probes it,
Then the tile shows green and the reported latency.
(Status: healthcheck tab exists in UI but has no logic — see REVIEW.md M1.)

### AC-016: Unhealthy service
Given a configured service whose health endpoint returns 500 (or is unreachable),
When the dashboard probes it,
Then the tile shows red and the failure status.

### AC-017: Click-through
Given a service tile,
When the user clicks it,
Then the health endpoint URL opens in the browser.

---

## 5. Error Handling

| Scenario | Handling |
|---|---|
| Folder path no longer exists | Degraded tile + "path not found" tooltip; no crash. |
| `.sln` file missing / no VS association | "File not found" / "no app to open this" message. |
| Azure API fails / invalid PAT / 401 | Mark tile "auth failed"; keep deep-links working; show re-auth hint. |
| Spotify not running / not authorized | Show "connect / open Spotify" state; polling paused. |
| Spotify API rate-limited | Back off polling; show "refreshing…" rather than error spam. |
| News feed unreachable / malformed RSS | Mark that feed failed; other feeds unaffected. |
| Weather API down | Show last-known conditions + "stale" indicator. |
| Network offline | All remote compartments show cached/stale data with offline badge. |
| Corrupt local config | Re-init defaults; keep a `.bak` of previous config. |
| PAT appears in logs / exported config | Block it (never logged, never serialized to config file). |
| Healthcheck times out / refuses connection | Mark unhealthy; show "timeout / connection refused"; no crash. |
| Healthcheck endpoint is slow (no timeout set) | Apply configured timeout (default ~5s) and never block other probes. |
| Service requires auth (401) | Show "auth required" state; don't leak token; hint to re-enter token. |

---

## 6. Implementation TODO Checklist

### Phase 1 — MVP (all compartments except synced lyrics)
**Scaffold**
- [ ] Create Tauri project (Rust backend + web frontend).
- [ ] Set up app data dir + JSON config load/save with backup on corrupt.

**Grid / layout engine**
- [ ] Integrate a draggable + resizable grid (e.g., `react-grid-layout` or `gridstack.js`).
- [ ] Persist layout (positions/sizes/order) on change; restore on launch.

**Settings page**
- [ ] Settings routes/sections: Folders, Solutions, Bookmarks, Azure, Spotify, Weather, News, System.
- [ ] Native folder/solution file picker (Tauri dialog) for path selection.

**Compartment: Folder/Solution**
- [ ] Tauri command `open_in_explorer(path)`.
- [ ] Tauri command `launch_sln(path)` (uses OS association).
- [ ] Missing-path degraded state.

**Compartment: Bookmarks + Azure**
- [ ] Bookmark CRUD in settings + tile rendering.
- [ ] Azure deep-link builder (`org/project/_git/repo/...` for PR and Files).
- [ ] Azure PAT input (stored via OS secret store).
- [ ] Azure REST: open-PR count + latest commit (GET `https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullrequests?...`).
- [ ] Bookmark-only fallback when no PAT.

**Compartment: Spotify**
- [ ] Spotify auth flow (OAuth PKCE, local-only token).
- [ ] Poll current playback (`/v1/me/player`) for track/artist/art.
- [ ] Play/Pause, Next/Previous (`/v1/me/player/next|previous|pause|play`).
- [ ] Volume set (`/v1/me/player/volume`).
- [ ] Not-running / not-authorized state.

**Compartment: Weather + World Clock**
- [ ] Open-Meteo fetch by configured location; current + short forecast.
- [ ] Per-compartment location configuration.
- [ ] World-clock time display per location (updated in real time).

**Compartment: News**
- [ ] RSS fetch + parse for configured feeds; headline list + click-through.

**Compartment: System Stats**
- [ ] Tauri command reading CPU % + RAM usage; interval refresh 1–2s.

**Compartment: Service Healthcheck**
- [ ] Healthcheck CRUD in settings (URL, path, timeout, interval, optional auth token).
- [ ] Probe runner: concurrent `GET` with timeout, independent per service.
- [ ] Status rendering: green/red, HTTP status, latency ms; click-through opens endpoint.
- [ ] Auth token stored via OS secret store, sent as `Authorization` header.

**Polish**
- [ ] Offline / stale-data badge behavior across network compartments.
- [ ] Play-test AC-001..AC-012.

### Phase 2 — Synced lyrics + enhancements
- [ ] Spotify synced lyrics via third-party provider (LRCLIB is free & sync-friendly; Musixmatch/Genius as alternatives).
- [ ] Timeline syncing to track position.
- [ ] Fallback "unsynced" display when no synced lyric available.
- [ ] (Optional) macOS/Linux build; multi-screen/status-bar support.

---

## 7. Out of Scope (MVP) / Future
- **Synced lyrics** → Phase 2 (largest complexity, least essential — confirmed decision).
- **Azure PAT live tiles** (FR-BMK-004/AC-007) → dropped (deep-links sufficient).
- Cloud sync, multi-device, accounts → out of scope (single-user local app).
- Authentication / PIN → out of scope (decision 7).
- Mobile / remote access → out of scope.
- Chat/AI compartments, browser tab management → future nice-to-haves.
- Healthcheck *active* actions (start/stop/restart a service, drain/repair) → out of scope (probe-only).

---

## 8. Open Questions
- [x] ~~Project name~~ → **lost-board** (confirmed).
- [x] ~~Grid density~~ → **fixed-column grid** (confirmed).
- [x] ~~Weather locations~~ → **per-compartment locations + world-clock time** (confirmed).
- [x] ~~Tech stack~~ → **Tauri** (confirmed).
- [x] ~~Healthcheck compartment~~ → **probe-only GET, green/red + latency** (confirmed; not yet built).
- [x] ~~Azure PAT live tiles~~ → **dropped** (deep-links sufficient).
- [ ] Healthcheck: which services/URLs do you want to probe first? (helps pick default refresh interval & whether auth headers are needed)
- [ ] Tracking: open review follow-ups as GitHub issues #18 (queue jump), #19 (tile resurrect), #20 (scanner).