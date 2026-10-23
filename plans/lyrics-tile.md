# Plan — Lyrics tile (synced, LRCLIB)

Status: Phase 1 ✅ built. Phase 2 (translation) ✅ built.
Spec: `spec.md` §2.18, FR-LYR-001..008 / AC-046..050.

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
- **Transitions:** the active line fades/slides in (0.3 s), the full view scrolls smoothly, and
  `prefers-reduced-motion` disables both.
- **Fixes after testing:** LRCLIB sometimes returns **bilingual** lines (`original^translation`);
  the parser now splits them into `text` + `alt` (shown as a muted built-in translation when our
  translator is off; plain lines keep only the original). The opencode call no longer uses `-f`
  (its `--file` array swallowed the instruction — LLM always failed before); lines are inlined.
  The lyrics tile body signature now includes the global translation setting + remembered
  languages, so toggling translation actually rebuilds the tile.

## Phase 2 (built) — translation
- **Detection:** `whatlang` (offline) in Rust (`lyrics_detect`), returns lang + confidence;
  confidence < 0.35 or an unsupported language → a prompt in the tile, remembered per track
  (`state.lyricsLang`).
- **Targets:** fixed set {EN, DE, ES}: EN→DE+ES, DE→EN+ES, ES→EN+DE, VI→DE+ES.
- **Setting:** one global "Show translations (up to 2)" toggle (`state.lyricsTranslate`).
- **Provider:** `lyrics_translate` tries the **opencode LLM** first (`opencode run --format json`,
  aligned JSON validated line-by-line), then **DeepL** per target (order-preserving batch; source
  omitted for unsupported DeepL source languages).
- **UI:** translations render under each line (full view: all; focus: current line); in-memory
  cache per `(track, source, targets)`; "Translating…"/"Translation unavailable" status; privacy
  note in Settings. No LGPL code copied.
- **Persistent translation cache:** `lyrics-translations.json` in the app-data dir (loaded once,
  atomic writes, capped at 1000 entries), keyed by a hash of the exact lines + source + targets, so
  translations survive restarts and replays don't re-spend tokens. "Clear translation cache" in
  Settings clears both the disk and in-memory caches.

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
