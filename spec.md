---
type: spec
title: lost-board — Feature Specification
project: lost-board
date: 2026-10-08
status: living (all planned features built — see PLAN.md; Phase 3 backlog open)
decisions:
  arch: A (Tauri desktop app, local-only)
  scope: MVP all compartments except synced lyrics (phase 2)
  grid: fixed-column grid (snap to rows/columns)
  azure: deep-links only (PAT live tiles dropped — deep-links sufficient)
  spotify: play/pause/next/prev/volume + shuffle/repeat + queue in v1; synced lyrics dropped
  weather: per-compartment locations + world-clock time per location
  healthcheck: dropped (probe tile deemed unnecessary)
  lyrics: dropped (was phase 2; no longer wanted)
  launcher: folders + any file (open via OS association), plus Projects tile with root scanning
  extras: Translate (DeepL) + Frame (photo/GIF) tiles added beyond original scope
  window: background mode — tray + autostart + always-on-bottom (built, PR #30)
  vocab: flashcard tile + drill popup + per-tile speech (built, PRs #31, #33)
  meme: rotation tile (top-100 + curated) + local captioning + expanded view + GIF/PNG export (built, PR #32)
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

### 2.12 Window, Tray & Background Mode (built — PR #30)

Rationale: a dashboard glanced at all day belongs behind everything as a living background,
not as a window to reopen. Verified against Tauri v2 docs (2026-10-07): all three pieces are
first-class APIs.

- **FR-WIN-001** The system shall show a system-tray icon with a menu: Show/Hide, Autostart
  on/off, Quit. (Tauri core `tray-icon` feature + `TrayIconBuilder`.)
- **FR-WIN-002** When the user toggles Autostart in Settings, the system shall enable/disable
  launch-on-Windows-login. (`tauri-plugin-autostart`.)
- **FR-WIN-003** When the user enables Background mode, the system shall pin the window
  always-on-bottom, go fullscreen, and hide its taskbar slot, so the dashboard sits behind all
  other apps like wallpaper. (`setAlwaysOnBottom(true)` + `core:window:allow-set-always-on-bottom`
  permission + `skipTaskbar`.)
- **FR-WIN-004** When the user exits fullscreen (F11 / toggle) with Background mode on, the system
  shall return to a windowed mode that is movable by dragging the title bar.
- **FR-WIN-005** Known quirks (accepted): Win+D minimizes the window (restore via tray icon);
  Alt-Tab focus keeps it visually behind other windows.

### 2.13 Vocab: flashcard tile + drill popup + speech (built — PRs #31, #33)

Design: passive exposure lives on the board (infinite trilingual flashcard), active recall
lives in a popup on the main screen (typing drill). This supersedes the earlier
Practice-tile discussion — one passive surface + one active surface, no overlap.
Card data comes from the shared `cards.csv` (single source of truth); tile and popup
shuffle independently (different words in each is variety, not a bug).

**Flashcard tile (passive):**

- **FR-VOC-001** The tile shall display a trilingual card (English + Spanish + German) and
  auto-advance to the next card every N seconds (per-tile setting).
- **FR-VOC-002** Rotation shall pause while the tile is collapsed and resume when expanded.
- **FR-VOC-003** ~~The tile shall offer an action opening the full vocab-app (gateway, not replacement)~~ — **dropped** 2026-10-08 (single-app use; no second app to gateway to).

**Drill popup (active):**

- **FR-VOC-004** When popups are enabled, the system shall show a drill popup every M
  minutes (setting) at the configured 3x3 placement preset (default bottom-right
  of the primary monitor).
- **FR-VOC-005** Each popup shall present exactly one English word with an input for the target
  language (popup language setting: ES / DE / Both, mirroring vocab-app modes), drawn from
  the selected categories when a category filter is set (popup-only; empty filter = all cards).
- **FR-VOC-006** Typing shall auto-check on match (case- and diacritic-insensitive, port of
  vocab-app matching); max 2 attempts per word, then the answer is revealed — or immediately
  via the reveal button.
- **FR-VOC-007** On a correct answer the popup shall show a brief success state and auto-close
  (~1.5s); on reveal-after-fail the user dismisses manually.
- **FR-VOC-008** Every popup shall offer Dismiss and Snooze-30min; the system shall never stack
  popups (no second popup while one is open); a quiet-hours window and a master enable/disable
  switch shall be configurable.
- **FR-VOC-009** When speech is enabled on a tile, each card cycle shall speak the three
  languages in order (English, then Spanish, then German) via the Web Speech API, each in
  its per-language configured voice (default voice when unchosen or unavailable).

### 2.14 Meme tile: rotation + local captioning + expanded view (built — PR #32)

Design: a compact tile for ambient rotation plus an expanded view (larger than Settings)
for doing things — browsing the collection, captioning, adding sources. The expanded
pattern is designed reusable for other crowded tiles later, but specified here for the
meme tile only. No third-party accounts anywhere: imgflip's public `get_memes` needs no
auth, custom images are user-supplied, captioning is fully local.

**Sources & rotation:**

- **FR-MEM-001** The tile shall show a random meme from a combined pool — imgflip top-100
  (auto-fetched, refetched ~daily) plus the user's curated collection — and auto-rotate on
  a per-tile interval, with a manual "new meme" action.
- **FR-MEM-002** The curated collection shall accept pasted image URLs (fetched natively to
  data-URI + disk cache, same pattern as favicons — no CORS/hotlink/rot issues) and dropped
  image files via OS drag-drop. Browser-tab drags are best-effort (verify at build).
- **FR-MEM-003** The curated collection shall be shared across meme tiles (one stash);
  rotation per tile stays independent.

**Captioning (local, any image):**

- **FR-MEM-004** The tile shall offer top/bottom text inputs rendered as live meme-style
  overlay (white Impact-style with black outline) on any image — no API, no account.
- **FR-MEM-005** The system shall export the captioned meme to PNG (canvas → save).

**Expanded view (hot launch):**

- **FR-MEM-006** The tile shall offer an Expand action opening an expanded view larger than
  the Settings panel (fullscreen in-app overlay): large preview, collection browser grid,
  add-URL box, drop zone, and the caption editor — all operable without scrolling a tiny tile.
- **FR-MEM-007** The expanded view shall offer a search box: typing a query and confirming
  shall open a browser tab at the configured search URL with the encoded query appended
  (default: Pinterest `https://www.pinterest.com/search/pins/?q={q}&rs=typed`; engine URL
  configurable with a `{q}` placeholder).

### 2.15 Calendar tile: lunar calendar + moon phase + holidays

- **FR-CAL-001** The tile shall show a month grid (week starts Monday by default, Sunday optional)
  with adjacent-month days dimmed and the current day highlighted.
- **FR-CAL-002** Each day shall show the solar date plus the **Vietnamese lunar (âm lịch)**
  day/month (leap months marked), computed for the UTC+7 reference (`src/lunar.js`).
- **FR-CAL-003** Weekday/month labels shall be bilingual **Spanish/German** (e.g. `Sáb/Sam`, `Marzo/März`).
- **FR-CAL-004** When enabled, a per-day **moon-phase** glyph shall be shown (`src/lunar.js`).
- **FR-CAL-005** Public holidays shall be highlightable per country (Vietnam; Germany incl.
  Rheinland-Pfalz; Pakistan fixed-date), toggled in Settings; hovering a highlighted day shows
  the native holiday name plus its ES/DE translation when available. Holidays are computed offline
  in `src/holidays.js` (Vietnamese lunar dates + Gregorian Easter computus). Islamic Pakistan
  holidays are deferred (need a Hijri conversion).

### 2.9 Compartment: Service Healthcheck — DROPPED

~~FR-HLT-001..007 (probe-only GET healthchecks)~~ — **dropped 2026-10-07** (deemed unnecessary).
The dead Healthcheck tab shall be removed from the UI when implementation resumes (see §7).
AC-015..017 are dropped with it.

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

### AC-015/016/017: Healthcheck — DROPPED
~~Healthy / unhealthy service tiles, click-through.~~ Dropped with FR-HLT (2026-10-07).

### AC-018: Autostart
Given Autostart enabled in Settings,
When Windows starts a new login session,
Then lost-board launches automatically.

### AC-019: Background mode
Given Background mode enabled,
When the user opens other applications,
Then the dashboard stays fullscreen behind them, with no taskbar slot and a tray icon present.

### AC-020: Exit to windowed
Given Background mode on and fullscreen active,
When the user exits fullscreen,
Then the window returns to a movable windowed state (draggable by title bar).

### AC-021: Flashcard rotation
Given a vocab tile with rotation set to 10 seconds,
When 10 seconds elapse,
Then the tile shows the next trilingual (EN/ES/DE) card.

### AC-022: Collapsed tile pauses rotation
Given a collapsed vocab tile,
When the rotation interval elapses,
Then the card does not advance until the tile is expanded.

### AC-023: Drill popup placement and schedule
Given popups enabled every 30 minutes,
When 30 minutes elapse with no popup open,
Then a drill popup appears bottom-right of the primary monitor.

### AC-024: Correct answer auto-closes
Given an open drill popup,
When the user types the correct translation,
Then a success state shows and the popup auto-closes (~1.5s).

### AC-025: Two wrong attempts reveal
Given an open drill popup,
When the user fails twice,
Then the correct answer is revealed for manual dismissal.

### AC-026: Snooze and no stacking
Given an open drill popup,
When the user clicks Snooze-30min (or while any popup is open),
Then no new popup appears for 30 minutes (and never a second popup while one is open).

### AC-034: Tile speech
Given a Vocab tile with speech enabled and per-language voices chosen,
When a card cycle shows,
Then English is spoken, then Spanish, then German, each in its configured voice;
advancing the card cancels in-flight speech, and collapsing the tile silences it.

### AC-035: Calendar grid + lunar date
Given a Calendar tile, when it renders, then a Monday-first month grid shows the current day
highlighted, adjacent-month days dimmed, and each day carries its Vietnamese lunar day/month
(leap months marked).

### AC-036: Moon phase + bilingual labels
Given the calendar with moon phase enabled, then each day shows a moon-phase glyph, and the
weekday/month labels read bilingual ES/DE.

### AC-037: Holiday highlights
Given Vietnam/Germany/Pakistan holiday toggles enabled, then matching days are highlighted and
hovering one shows the native holiday name with its ES/DE translation when available.

### AC-027: Meme rotation pool
Given top-100 fetched plus two curated images,
When the tile rotates (or "new meme" is clicked),
Then shown images come from the combined pool.

### AC-028: Paste URL adds image
Given a Pinterest image URL pasted into the add box,
When the fetch completes,
Then the image is cached and joins the rotation.

### AC-029: Drop file adds image
Given an image file dropped onto the meme tile,
When the drop completes,
Then the image joins the curated collection.

### AC-030: Live caption overlay
Given a displayed meme,
When the user types top/bottom text,
Then meme-style overlay text renders live on the image.

### AC-031: Expanded view
Given a meme tile,
When the user clicks Expand,
Then a larger-than-Settings view opens with big preview, collection grid, add box, drop zone, and caption editor.

### AC-032: Export PNG
Given a captioned meme in the expanded view,
When the user clicks Export,
Then a PNG file is saved. (GIF sources stay animated GIFs — captioned or not.)

### AC-033: Search box opens browser tab
Given the expanded view with default engine,
When the user types "disappointing meme" and confirms,
Then a browser tab opens at `https://www.pinterest.com/search/pins/?q=disappointing%20meme&rs=typed`.

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

### Phase 2 — Enhancements (all built 2026-10-08)
- [x] ~~Spotify synced lyrics~~ — **dropped** (2026-10-07, no longer wanted).
- [x] ~~Background mode implementation (FR-WIN-001..005, AC-018..020)~~ — built (PR #30).
- [x] ~~Healthcheck tab removal from UI (dropped feature cleanup)~~ — built (PR #29).
- [x] ~~Vocab implementation (FR-VOC-001..009, AC-021..026, AC-034)~~ — built (PRs #31, #33):
  - [x] Rust `read_vocab_cards` command (parse shared `cards.csv`, in-memory cache).
  - [x] Flashcard tile (new `vocab` kind, per-tile rotation interval, pause-on-collapse).
  - [x] Drill popup page + scheduler + placement + annoyance controls.
  - [x] Port of vocab-app matching (normalize + auto-check + 2-attempt reveal).
  - [x] Per-tile speech with per-language voices, volume + speed (FR-VOC-009).
- [x] ~~Meme tile implementation (FR-MEM-001..007, AC-027..033)~~ — built (PR #32):
  - [x] Rotation from top-100 + shared curated collection (image fetch/cache command).
  - [x] Add via URL paste + file drop (browser-tab drop best-effort).
  - [x] Local caption overlay + PNG export (+ animated GIF export, captioned or not).
  - [x] Expanded view (fullscreen overlay, reusable pattern).
- [ ] (Optional) macOS/Linux build; multi-screen/status-bar support.

---

## 7. Out of Scope (MVP) / Future
- **Synced lyrics** → dropped (2026-10-07, was Phase 2, no longer wanted).
- **Service Healthcheck** (FR-HLT/AC-015..017 + UI tab) → dropped (2026-10-07, deemed unnecessary).
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
- [x] ~~Healthcheck compartment~~ → **dropped with the feature** (dead tab removed, PR #29).
- [x] ~~Azure PAT live tiles~~ → **dropped** (deep-links sufficient).
- [x] ~~Healthcheck services/URLs~~ → dropped with the feature.
- [x] ~~Tracking: open review follow-ups as GitHub issues~~ — all closed (#18 queue jump, #19 tile resurrect, #20 scanner, #21 config export/import).
- [x] ~~Window close behavior with tray present~~ → **close quits (unchanged)** — decided during background-mode implementation (2026-10-08): no close interception in v1; closing the window exits the app and removes the tray icon. Tray menu offers Hide for getting the window out of the way without quitting. Revisit close-to-tray only if real usage asks for it.
- [ ] Shared progress merge (tile/popup practice stats + vocab-app sessions in one store)? — future work; tile/popup stats stay local for now.