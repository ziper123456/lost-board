# Implementation Plan — Vocab flashcard tile + drill popup

> ⚠️ **Status: planned, not built.** Code sketches below are **uncompiled**
> (no Rust toolchain on the planning machine). Treat them as reference —
> verify every API at build time, fix drift, and note corrections in the commit.

## 1. Goal

Passive exposure on the board (infinite trilingual flashcard) + active recall on the
main screen (typing-drill popup). Spec: `spec.md` §2.13 (FR-VOC-001..008),
acceptance: AC-021..026. This **supersedes the Practice-tile discussion** — do not
build a separate drill tile; one passive surface + one active surface only.

## 2. Key design decisions (do not re-derive)

- **Single data source:** `src-tauri/resources/cards.csv` — **decided and snapshotted
  2026-10-07** (672 KB, 10,263 rows: `id,categories,studyCount,en_US,es_ES,de_DE`;
  copied from the vault's `Projects/vocab-app/cards.csv`, wired via
  `bundle.resources` in `tauri.conf.json`). Versioned, offline, no cross-repo path
  coupling. Re-snapshot (copy over + commit) when vocab-app updates the CSV.
- **Independent shuffles:** tile rotation and popup drill draw independently (different
  words in each = variety, not a bug).
- **One word per popup** (FR-VOC-005): fast in-and-out keeps high frequency tolerable.
- **Annoyance controls are requirements** (FR-VOC-008), not polish: Dismiss, Snooze-30min,
  no stacking, quiet hours, master switch.
- **Matching = port of vocab-app** `typingMatch.ts`: lowercase + NFD diacritic-strip +
  trim, equality check; 2 attempts max, then reveal (TRANSFER-NOTE §5/§7).
- **Progress stays local** (open question in spec §8): tile/popup stats (if any) live in
  lost-board state only. No shared store with vocab-app in v1.

## 3. Prerequisites

- Work laptop with MSVC toolchain; `npm install` fresh.
- `cards.csv` snapshot: **decided** — `src-tauri/resources/cards.csv`, wired via
  `bundle.resources` (committed 2026-10-07).

## 3b. Phase 0 — popup shell prototype (build FIRST, before §4c–4e)

> Pre-mortem Failure #2: the second-window integration (placement + focus + snooze
> round-trip) is the riskiest unknown in this plan and must be de-risked with an
> empty shell before any drill logic exists.

1. Create bare `src/drill.html` ("hello") and open it via the §4d window code on a
   timer: verify it lands **bottom-right of the primary monitor on the real 3-screen
   setup** (record any DPI/scale correction needed).
2. **Focus test:** trigger the popup while typing in another app (e.g. VS). If it
   steals keystrokes, set `focus: false` on creation (verify option name) — decide here,
   not later.
3. **Snooze round-trip test:** write the snooze flag from the popup, read it from the
   main-window scheduler tick. If `localStorage` is **not** shared between windows,
   implement the Rust-command fallback immediately — do not build drill logic on an
   unverified channel.
4. Only when 1–3 pass, proceed to §4c (drill content).

## 4. Changes, file by file

### 4a. Rust — `read_vocab_cards` command (`src-tauri/src/lib.rs`)

Parse the CSV once, cache rows process-wide (`OnceLock`, same pattern as the existing
`system_handle()`), return N random entries per call (sketch — verify `csv` crate vs
hand-rolled parsing; hand-rolled split on commas is **wrong** — the categories field
contains quoted commas, so use the `csv` crate or equivalent):

```rust
#[derive(Serialize, Clone)]
struct VocabCard { id: String, en_: String, es: String, de: String }

static VOCAB: OnceLock<Vec<VocabCard>> = OnceLock::new(); // load once from bundled resource

#[tauri::command]
fn read_vocab_cards(count: usize) -> Result<Vec<VocabCard>, String> {
    let all = VOCAB.get_or_init(load_vocab /* parse cards.csv, skip bad rows */);
    // shuffle + take(count)
}
```

- Register in `generate_handler![...]`.
- Add `csv = "1"` + `rand` (already a dependency) to `Cargo.toml`.
- If bundling via Tauri resources: add to `tauri.conf.json` `bundle.resources`, resolve at
  runtime via `app.path().resolve(...)` — verify resource API names at build.

### 4b. Frontend — flashcard tile (`src/main.js`, `src/index.html`)

- New kind `"vocab"` in `KIND_DEFAULTS` (`{ title: "Vocab", data: { intervalSec: 10 } }`),
  add-kind `<option>`, `KIND_TAB` entry + settings renderer (rotation-seconds number input
  + per-tile collapsible/appearance rows like other editors).
- `renderCompartmentBody`: `vocab` branch — fetch a small batch (e.g. 20 cards) via
  `native.readVocabCards(20)`, render EN prominent + ES/DE below, `setInterval` advance
  per `data.intervalSec`, registered with `addTimer(body, t)` (existing lifecycle).
- Pause when collapsed: the render path already skips bodies for collapsed tiles and
  clears their timers (`clearBodyTimers`) — confirm rotation stops (it does by construction,
  since the interval is body-bound). AC-022 relies on this; play-test it.
- Tile footer action opening the full vocab-app URL/binary (FR-VOC-003): a small
  "Open vocab-app" button calling `native.openUrl(...)` with a Settings-configurable
  target (default `http://localhost:5173`, editable for a built binary path/URL).

### 4c. Drill popup page (`src/drill.html` + inline script or `drill.js`)

- New static page (frontendDist serves it; no bundler change needed).
- On load: read drill config passed via URL query (`?lang=es`) or re-read state through
  `invoke("load_state")` — prefer query params (simpler, no state parse in popup).
- Fetch 1 card via `invoke("read_vocab_cards", { count: 1 })`.
- Render: EN prompt + single input (+ second input if `lang=both`, both must match —
  mirroring vocab-app Both mode).
- Port matching: `const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();`
  auto-check on input event; 2 attempts then reveal answer.
- Correct → success style → `setTimeout(window.close, 1500)`.
- Buttons: Dismiss (close), Snooze 30 min (needs to tell the main window — see §4d),
  both always visible (FR-VOC-008).

### 4d. Popup window management + scheduler (`src/main.js`)

- Window creation (frontend-direct via existing `__TAURI__.webviewWindow` namespace —
  verify the create API + required capability, e.g. webview-window create permission,
  at build time).
- Placement: `primaryMonitor()` (verify namespace: `__TAURI__.window.primaryMonitor()`)
  → `x = mon.position.x + mon.size.width - POPUP_W - MARGIN`,
  `y = mon.position.y + mon.size.height - POPUP_H - MARGIN`;
  size ~360×220, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true` (verify names).
- Scheduler: a 30s (configurable tick) interval in main window checking state
  (`popupEnabled`, `popupEveryMin`, `quietHours`, `snoozeUntil`, `lastPopupAt`).
  Persist `snoozeUntil`/`lastPopupAt` in state so restarts don't double-fire.
- Snooze from popup → popup calls back: simplest is `localStorage` flag + `storage` event,
  or invoke a tiny `snooze_vocab_popup()` Rust command writing to state file... but main
  window holds state in memory. Pragmatic v1: popup writes `localStorage["lost-board.vocab-snooze"]`,
  main window's scheduler tick reads it (same origin → shared localStorage across windows
  in the same webview profile — verify; fallback is a Rust command + file).
- Never stack: track open popup window handle; skip tick while it exists (FR-VOC-008).

### 4e. Settings UI (`src/index.html` Grid tab or new Vocab tab)

Recommend a dedicated **Vocab tab** (two independent configs live here):
- Flashcard tile selector (like other editors) + rotation seconds.
- Popup: enable checkbox, every-N-minutes, language (ES/DE/Both), quiet-hours start/end,
  vocab-app open target (URL/path), snooze state display + clear-snooze button.

## 5. Verification (on the work laptop — requires build)

1. `npm run dev` compiles clean.
2. Vocab tile rotates trilingual cards on the configured interval (AC-021); collapse pauses it (AC-022).
3. Popup appears bottom-right of primary monitor on schedule, only when enabled and outside quiet hours (AC-023). Test on the real multi-screen setup (DPI/virtual coords).
4. Correct typing auto-checks + auto-closes; two fails reveal (AC-024/025).
5. Snooze suppresses 30 min; no stacking even across rapid ticks (AC-026).
6. Restart app mid-snooze → still snoozed (persisted `snoozeUntil`).

## 6. Done criteria

- [ ] Phase 0 shell prototype passed (placement + focus + snooze round-trip) before drill logic.
- [ ] Builds clean; all sketches verified/corrected.
- [ ] AC-021..026 play-tested on the real 3-screen setup.
- [ ] Commit references this plan.
- [ ] **Corrections log appended below** (per `plans/README.md` convention).
- [x] ~~`cards.csv` snapshot strategy~~ — decided: `src-tauri/resources/cards.csv` + `bundle.resources`.

## 8. Corrections log (filled at implementation)

_(Work-laptop agent: append dated entries here.)_
- 2026-10-08: `WebviewWindowBuilder::new(manager, label, url)` confirmed (Tauri 2.12.1); `position`/`inner_size` take **logical** pixels — physical monitor geometry is converted via `scale_factor()`. `focused/decorations/resizable/always_on_top/skip_taskbar` all exist as sketched.
- 2026-10-08: deviation from §4d — popup window is created **Rust-side** (`open_vocab_popup` command, `WebviewWindowBuilder`), not frontend-direct via `__TAURI__.webviewWindow`. Reason: deterministic, no JS-namespace or creation-permission questions; the popup itself still uses plain `invoke`.
- 2026-10-08: deviation from §4d — snooze round-trip uses **Rust commands + state file** (`snooze_vocab_popup` writes `vocab.snoozeUntil`; `vocab_tick` reads it), not `localStorage` + `storage` event. Reason: sidesteps the cross-window storage-sharing unknown entirely; restart persistence falls out for free.
- 2026-10-08: deviation from §4c — popup language passed via **`vocab_popup_lang` command backed by a process static**, not URL query params. Reason: avoids `WebviewUrl::App` query-string uncertainty.
- 2026-10-08: new `src-tauri/capabilities/drill.json` (`windows: ["drill"]`, `core:default`) so the popup webview may `invoke`; `csv = "1"` + `chrono = "0.4"` deps added (CSV has quoted commas — hand-split would break; chrono for quiet-hours local time).
- 2026-10-08: `focused(false)` kept per plan lean — manual focus test (§5 step 3 here, Phase 0 item 2) decides whether it stays.
- 2026-10-08 (PR-review fixes, pre-merge): tick no longer focuses an already-open popup (`focus_existing` flag — only Preview focuses; fixes a 30s focus-theft loop); CSV load requires en+es+de non-empty (empty target auto-matched empty input); `lastPopupAt` static seeded from file on first tick (restarts honor cadence); new `vocab_popup_state` command mirrored into JS memory by the tick so settings commits can't clobber a popup-set snooze; Vocab tab renders tile-less via non-creating lookup (no resurrect, same rule as Projects).
- 2026-10-08: FR-VOC-003 (vocab-app gateway button + URL setting) removed per user request — single-app use. Tile button, settings field, and state default deleted; spec marked dropped.
- 2026-10-08: TTS follow-up (FR-VOC-009/AC-034): per-tile "Voice enable" + per-language voice dropdowns (EN/ES/DE, voiceURI stored in tile data), Web Speech API sequence EN→ES→DE with generation-guarded chaining, cancel on advance, teardown hook in clearBodyTimers (silent on collapse/remove). No Rust changes.

## 7. Risks & unknowns

- `WebviewWindow` creation API + permission names from the `__TAURI__` global (verify).
- `primaryMonitor()` shape (`position`/`size` fields, physical vs logical px + `scaleFactor` — the existing drag-drop code already handles scale conversion; reuse that pattern).
- localStorage sharing between main + popup windows (verify; Rust-command fallback ready).
- CSV parsing: categories field has quoted commas — must use a real CSV parser, not `split(',')`.
- Popup focus theft: an always-on-top popup popping while typing elsewhere could steal keystrokes — consider `focus: false` on creation + flash instead (verify option; note in commit).
