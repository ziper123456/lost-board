# Implementation Plan — Meme tile (rotation + captioning + expanded view)

> ⚠️ **Status: planned, not built.** Code sketches below are **uncompiled**
> (no Rust toolchain on the planning machine). Treat them as reference —
> verify every API at build time, fix drift, and note corrections in the commit.

## 1. Goal

A compact meme tile for ambient rotation plus an expanded fullscreen view for doing
things (browse collection, caption, add sources) — tiles stay small, the work happens
big. Spec: `spec.md` §2.14 (FR-MEM-001..006), acceptance: AC-027..032. No third-party
accounts: imgflip `get_memes` is keyless, captioning is local.

## 2. Key design decisions (do not re-derive)

- **Pool = top-100 (auto) + curated collection (manual).** Refetch top-100 ~daily
  (cache timestamp in state); curated entries are `{name, imageUrl|dataUri}`.
- **Curated collection is shared across meme tiles** (one stash, independent rotation).
- **Custom images load through native fetch → data-URI + disk cache** — the exact
  `cache_favicon` pattern generalized (new `fetch_image_cached(url)` command or an
  optional dir param on the existing one). Kills CORS, hotlink blocks, and URL rot
  after first fetch. This is load-bearing for Pinterest URLs — do not render remote
  `<img src>` directly.
- **Captioning is local HTML/CSS overlay** (Impact-style: bold condensed white text,
  black outline via `-webkit-text-stroke` + `text-shadow` stack), live on input.
  PNG export via `<canvas>` (same-origin data-URIs ⇒ no taint; verify export works
  for top-100 remote URLs too — if tainted, route export through the cached data-URI,
  which is always same-origin-safe).
- **Expanded view = in-app fullscreen overlay** (not a second window — unlike the vocab
  popup, meme editing happens while looking at the board, so no cross-window state sync).
  Reuse the Settings overlay shell pattern (fixed full-viewport section + panel). Keep the
  implementation tile-specific, but structure the overlay open/close helpers generically
  so other crowded tiles can adopt the pattern later.
- **Drop sources, ranked:** (1) pasted URLs — primary flow, fewest steps; (2) OS file
  drops — reuse the launcher's `setupDragDrop` pattern guarded to `kind === "meme"`;
  (3) browser-tab drags — best-effort, verify payload availability at build, nothing
  depends on it.

## 3. Prerequisites

- Work laptop with MSVC toolchain; `npm install` fresh.
- imgflip `get_memes` verified live 2026-10-07 (100 templates, no auth).

## 4. Changes, file by file

### 4a. Rust — image fetch/cache (`src-tauri/src/lib.rs`)

Generalize the favicon cacher (sketch — keep `cache_favicon` untouched, add a sibling):

```rust
// Fetch any image URL (meme templates, Pinterest direct links), cache under
// app-data `images/` keyed by a hash of the URL, return data-URI.
// Same shape as cache_favicon: sanitize → disk cache → fetch w/ timeout → store.
#[tauri::command]
async fn fetch_image_cached(app: tauri::AppHandle, url: String) -> Result<String, String>
```

- Extension/mime: sniff from `Content-Type` response header (Pinterest URLs often lack
  usable extensions) with extension fallback; reject non-image content-types.
- Size guard: refuse absurd payloads (e.g. > 15 MB) with a clear error.
- Register in `generate_handler![...]`; add frontend `native.fetchImageCached(url)` wrapper.

Top-100 list itself: fetch from **frontend** `fetch()` (imgflip sends permissive CORS —
verify; fallback is a tiny `fetch_top_memes` Rust command reusing the same client).
Cache the list + timestamp in state; refetch when older than ~24h.

### 4b. Frontend — compact tile (`src/main.js`, `src/index.html`)

- New kind `"meme"` in `KIND_DEFAULTS` (`{ title: "Memes", data: { intervalSec: 30 } }`),
  add-kind `<option>`, `KIND_TAB` + settings renderer (rotation seconds + shared-collection
  manager link).
- `renderCompartmentBody`: `meme` branch — pick random entry from combined pool
  (top-100 list + curated data-URIs), render image + current caption overlay (persist
  per-tile `top`/`bottom` text in `data` so rotation keeps your caption? No — captions
  belong to the expanded editing session; tile shows image + last caption only after
  export... decide: tile shows plain rotation; captioning happens expanded. Simpler and
  matches "compact tile, work happens big").
- Timer via `addTimer(body, t)` per existing lifecycle; "↻" header-adjacent button for
  manual advance; Expand button opening §4d.

### 4c. Curated collection settings

- Shared store: `state.memeCollection = [{ id, name, dataUri|url, addedAt }]` (top-level,
  not per tile). Cap at ~200 entries with a clear-full/oldest warning (data-URIs bloat
  state JSON — note: large GIFs as data-URIs in persisted state is the known perf
  caveat from the performance review; prefer stills, warn over ~5 MB total).
- Add flows: URL paste box (fetch → cache → push), file browse (reuse `pick_image` +
  `load_frame_image`), OS drop onto tile (§2).
- Per-entry remove; collection browser grid lives in the expanded view (§4d), settings
  tab holds a compact manager (list + remove + count).

### 4d. Expanded view (fullscreen overlay)

- New overlay section in `index.html` (sibling to `#settings`, e.g. `#meme-focus`):
  large preview (image + live caption overlay), caption top/bottom inputs, collection
  grid (click = preview, × = remove), add-URL box, drop zone (same drop handler family),
  **search row (query input + engine select + Go; Enter confirms)**, Export PNG button, Close.
- Search row behavior: on confirm, build `engineUrl.replace("{q}", encodeURIComponent(query))`
  and call the existing `native.openUrl(...)` (same command bookmarks use — no new Rust code).
  Default engine: Pinterest `https://www.pinterest.com/search/pins/?q={q}&rs=typed`;
  engine URL stored in state (editable in the meme settings tab); a couple of presets
  (Google Images, Bing) may be offered if their `{q}` patterns verify at build time —
  otherwise ship Pinterest-only and add presets later.
- Open/close helpers written generically (`openFocus(kind, id)` / `closeFocus()`) so a
  second tile can reuse them later — but only the meme tile wires them in v1.
- Export: draw image + overlay text onto `<canvas>` at natural resolution, `toBlob` →
  save via anchor download (verify in webview; fallback: Rust `save_meme_png` command
  with native save dialog — flag if needed at build).

### 4e. State shape (additive, backward-compatible)

```js
state.memeCollection = [];        // shared curated stash
state.memeTop100 = { at: 0, items: [] };  // cached template list
// per meme tile data: { intervalSec, top, bottom } (caption draft, optional)
```

Old states load fine (arrays default to empty via existing `|| []` guards).

## 5. Verification (on the work laptop — requires build)

1. `npm run dev` compiles clean.
2. Tile rotates across top-100 + curated entries on the interval; ↻ advances (AC-027).
3. Paste a Pinterest image URL → cached, joins rotation, survives restart + offline (AC-028).
4. Drop an image file onto the tile → joins collection (AC-029). Note browser-tab drag result.
5. Caption inputs render live overlay in expanded view (AC-030).
6. Expand opens a larger-than-Settings view with preview, grid, add box, drop zone, editor (AC-031).
7. Export saves an openable PNG (AC-032).
8. Search box with "disappointing meme" opens the Pinterest search tab (AC-033); custom engine URL respected.

## 6. Done criteria

- [ ] Builds clean; sketches verified/corrected.
- [ ] AC-027..032 play-tested.
- [ ] Commit references this plan + lists API corrections.
- [ ] Browser-tab drop verdict recorded (works / doesn't — update FR-MEM-002 note).

## 7. Risks & unknowns

- Pinterest direct-image fetch blocked/redirected (fallback: user re-hosts or saves file; record outcome).
- `Content-Type` sniffing for extension-less URLs (implement first, it's the likely path).
- State JSON bloat from data-URI collection (mitigate: cap + stills-preferred warning).
- Canvas export in webview (verify; Rust-save fallback ready).
- `focus` behavior of the fullscreen overlay vs. grid drag gestures (overlay must swallow pointer events fully).
