# Plan — Lyrics tile (synced, LRCLIB)

Status: Phase 1 ✅ built. Phase 2 (translation) planned.
Spec: `spec.md` §2.18, FR-LYR-001..005 / AC-046..048.

## Goal

A separate **Lyrics** tile that shows the current track's lyrics synced to playback, with a
focus view (prev/current/next) and a full scrollable view. Lyrics come from **LRCLIB** (free,
keyless) via Rust. No translation in Phase 1.

## Phase 1 (built)

**Rust**
- `lyrics_get(title, artist, album, duration_ms)`:
  - `GET https://lrclib.net/api/get?artist_name&track_name&album_name&duration`;
  - 404/mismatch → `GET /api/search?q=` and pick the best by (synced present, closest duration);
  - returns `{ synced: [{t_ms,text}], plain, instrumental, source }`.
  - In-memory cache (cap 256, cleared when full) including negative results; `User-Agent` set.
- `parse_lrc` (pure): `[mm:ss.xx]`/`[mm:ss.xxx]`, multiple stamps per line, `[offset:]`, metadata
  tags, drops empty lines. Unit test `lrc_parsing_handles_timestamps_offsets_and_metadata`.

**Shared playback**
- One 5s `spotify_now_playing` poller (`subscribePlayback`) feeds every Spotify and Lyrics tile;
  the Spotify tile was refactored to consume the shared sample. Unsubscribe is tied to the tile
  body via `addTimer` (cleanup entries may be functions).

**Lyrics tile (JS/CSS)**
- New `lyrics` kind + Settings tab (tile selector, previous/next counts 0–10 default 3/3, sync
  offset ms, text alignment left/center/right) + Add-a-tile option (Settings and background
  right-click menu) + `KIND_DEFAULTS`.
- Focus view: previous/current/next (current in `--accent`); **Full** toggle (scrollable,
  auto-scroll on line change).
- Fallback: no synced/current line → Full plain list; instrumental → "Instrumental"; none → empty
  state; nothing playing → "Nothing playing".
- Sync: position from the shared sample (`progress_ms` + local interpolation) + offset; the
  highlight updates only when the line index changes (400 ms check).
- Follows theme/design tokens, including the dynamic Spotify cover colours.

**Follow-ups (implemented)**
- **Disk cache:** LRCLIB results (including negatives) persist to `lyrics-cache.json` in the
  app-data dir (loaded once, atomic writes) → instant replays and offline restarts.
- **Second provider (plain fallback):** when LRCLIB has nothing, `lyrics.ovh` supplies plain
  lyrics (unsynced). Provider is recorded in `source`.
- **Per-track sync offset:** `state.lyricsOffsets[trackKey]` (persisted, ±5 s) adjusted with the
  tile's `−`/`+` (0.1 s steps); "Reset per-track offsets" in the Lyrics tab.
- **Faster sync:** the shared playback poll tightens to **2.5 s while a Lyrics tile is visible**
  (5 s otherwise), so seeks/scrubs catch up quicker.

## Phase 2 (planned) — translation
- Offline detection (`whatlang`); low confidence → prompt in the tile/Settings, remembered per
  track.
- Fixed target set {EN, DE, ES}: source EN→DE+ES, DE→EN+ES, ES→EN+DE, VI→DE+ES, other→ask.
- One global "Show translations (up to 2)" setting.
- **LLM default** via `opencode run` (aligned JSON, validated line counts), **DeepL fallback**
  (order-preserving line batch). Cache per `(track, targets, provider)`. No LGPL code copied.
- Non-blocking: originals first, translations fill in.

## Corrections log

- Built as planned. `image`/network not needed (lyrics are JSON). The Spotify tile now uses the
  shared poller. LRCLIB search falls back to the closest duration when the exact `get` misses.
- Follow-ups: lyrics text uses `em` so the per-tile **font size** works; added a **text align**
  setting (left/center/right); added Lyrics to the background right-click add-tile menu.
- Simplification/quality pass (`code-simplification`): pure helpers extracted to `src/lyrics.js`
  (`activeIndex`, `focusWindow`, `positionMs`, `parsePlain`) + `scripts/test-lyrics.cjs`; the Full
  view now builds once per track and only toggles the active-line class (no per-line innerHTML
  rebuild) with auto-scroll stopping when the user scrolls; transient fetch failures retry with
  exponential backoff instead of blocking the track; LRCLIB matching retries without the album and
  searches with a cleaned title (`clean_title`, unit-tested).
