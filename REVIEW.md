# lost-board — Code Review Report

**Reviewer:** code-reviewer skill (with security pass)
**Scope:** full repo review at `49d221d`
**Date:** 2026-10-06

---

## 1. Intent recap
A single-user, local-only Tauri v2 desktop dashboard of customizable grid "compartments" — folders/solutions, bookmarks, Azure deep-links, weather+world-clock, news/RSS, system stats, Spotify remote, plus added Translate (DeepL) and Frame (photo/GIF) tiles.

**Overall assessment:** High quality for a personal project. Clean architecture, genuinely thoughtful engineering (timer lifecycle, signature-based re-rendering, collision-aware grid, OS secret store for credentials). No critical/vulnerable issues found. The main gaps are **unfinished features** and **spec/docs drift** — not bugs.

---

## 2. Critical issues (must fix before merge)
**None found.** No data-loss bugs, no exposed secrets, no crash footguns in normal use.

---

## 3. Major issues (should fix)

### M1 — Healthcheck compartment is a dead tab (UI present, no logic)
- `index.html` has the Healthcheck tab + `healthcheck-list` div, but `main.js` has **no** handler for it. `activateTab()`/`renderTabPanel()`/`KIND_TAB` omit `healthcheck`, and `lib.rs` has no probe command.
- **Impact:** A user clicking "Healthcheck" sees an empty panel. Dead UI.
- **Fix:** Either implement FR-HLT-001..007 (backend probe + render + settings) or remove the tab and mark Healthcheck explicitly deferred in `PLAN.md`. Left as-is it breaks AC-015/016/017 and the "everything configurable" promise.

### M2 — Spec / PLAN / README drift (the biggest issue)
Several files contradict each other and the code:
- `spec.md` still lists **FR-BMK-004/AC-007 (Azure PAT live tiles)** and checkbox items as `[ ]`-unchecked, and the Healthcheck section & AC-015..017 — but **PLAN.md says Azure live tiles were "dropped"** and marks healthcheck unmet. Decide reality and reconcile.
- `PLAN.md` "Status" says *Phase 1: not started* and *Phase 2: not started*, yet the roadmap checkboxes below show them done — **internal contradiction**.
- `README.md` "Status" is stale (says bookmarks/Azure/Spotify/healthcheck "still to build"; they're largely built).
- **Bonus compartments added that aren't in the spec:** Translate (DeepL) and Frame. These are legitimate scope additions but the spec was never updated. Add them to `spec.md` so the spec reflects reality.
- `spec.md` also duplicates the "Grid density" line in Open Questions (lines 350 & 353).

### M3 — CSP is `null` while rendering remote content into the DOM
- `tauri.conf.json` sets `"csp": null`. The frontend injects **remote album art URLs** and bookmark/favicon data-URIs / external URLs into `innerHTML` and inline `style`/`src`. Currently everything is escaped via `escapeHtml`, which is good — but a null CSP means a single escaping slip or a maliciously-crafted feed/bookmark imposes no second line of defense.
- **Fix (recommended):** set a real CSP, e.g. allow `img-src 'self' data: https:; style-src 'self' 'unsafe-inline'` and tighten `script-src`. Worth doing since the app connects to arbitrary RSS/bookmark/Azure/Spotify content.

### M4 — Feeds & remote sizes unbounded (no cap on item/link length)
- `main.js` `renderNewsFeeds`/`bookmarks` interpolate user-configured URLs and feed titles into the DOM with `escapeHtml`. That's XSS-safe. But a huge malicious entry (e.g. an enormous URL string) could bloat render. Minor perf/resilience — clamp lengths. Low severity.

---

## 4. Minor issues / polish

1. **`loadState()` browser/localStorage is effectively dead in the desktop app** — `initialize()` calls `native.loadState()` and, if present, **replaces** the in-memory state, so the localStorage write in `saveState()` is redundant for Tauri (still useful as a prototype fallback). Not a bug, note only.
2. **Weather/geocode use browser `fetch`** (CORS-dependent) while news/favicon use native Rust. Inconsistent, but Open-Meteo sends permissive CORS so it works. Worth a comment rationale.
3. **`fetchWeather` no timeout** — a stalled Open-Meteo response leaves "Loading weather…" forever. The native calls have timeouts; this leaf `fetch` does not. Add `AbortController` timeout.
4. **Error surfacing via `alert()`** in Spotify control paths — works but is intrusive/clunky; a toast would be nicer. Non-blocking.
5. **`spotify_volume(percent: u8)`** clamps `min(100)` but doesn't clamp/negate a possible 0 — harmless.
6. **`get_system_stats` sleeps 300ms on the calling thread** — it's a `#[tauri::command]` (runs on the async runtime, so not blocking the UI thread directly), but the per-call sleep adds latency; acceptable for a 2s refresh. Note only.
7. **Duplicate `use base64::Engine`** import mid-function (lines 122, 156, 273) — harmless, could move to top.
8. **`faviconCache`/`frameImageCache` memoize failures** forever for a given host/path — a transient network blip means the icon never retries this session. Minor.

---

## 5. Positive feedback (genuinely good)
- **OS secret store discipline** — DeepL key + Spotify client/access/refresh tokens all via `keyring`, never serialized to config/git; `clear_deepl_key` and status helpers are thoughtful.
- **Corrupt-state safety** — `validate_state()` + `.bak` backup before rename; schema validation before save. Excellent data handling.
- **Timer lifecycle** — `compartmentTimers` keyed by body element with `clearBodyTimers` on every teardown path (collapse, remove, re-render, preview swap). This is the kind of leak most people get wrong; it's done right.
- **Signature-based re-rendering** — `tileHeaderSig`/`tileBodySig` avoid needless DOM teardown and re-fetching. Mature approach.
- **Collision-aware grid** with a guard counter (`resolveCollisions`) and zoom-corrected drag math (screen px ÷ zoom before snapping).
- **Native fetch for RSS** (`fetch_rss` in Rust) to dodge webview CORS — the right call, well documented.
- **Per-compartment isolates** for weather/news caches so drag/resize/rename don't hammer APIs, yet stale data stays out of persisted state.
- Spotify OAuth: PKCE correctly implemented, token refresh with expiry tracking + 60s safety margin, localhost callback server on a fixed port with a 120s timeout.

---

## 6. Security assessment (dedicated pass)
- **Secrets:** handled correctly (keyring). No hardcoded tokens in the repo. ✅
- **XSS:** all user/remote strings pass through `escapeHtml` before entering the DOM; favicon/img use `onerror="this.remove()"` safely. Strong given the app handles untrusted URLs. The weak point is only the null CSP (M3).
- **Command injection:** `open_path` shells out via `cmd /C start "" {path}` on Windows. `start` with a quoted argument is reasonably safe, and the paths/URLs are user-configured, single-user — low risk. No `&|` chaining possible through a single quoted arg. Acceptable; note only.
- **Local file access:** `load_tile_icon`/`load_frame_image` read arbitrary paths the *user* picks — fine for a single-user local app.
- **Localhost callback server** (Spotify) binds `127.0.0.1` only. A 120s timeout and short-lived server reduce exposure. Acceptable.

---

## 7. Spec compliance snapshot

| Spec item | Status |
|---|---|
| FR-LAY (grid drag/resize/snap/persist) | ✅ Implemented |
| FR-SET (settings page) | ✅ Implemented |
| FR-DIR (folders / solutions open) | ✅ Implemented (+ native pickers, missing-path degrade) |
| FR-BMK-001..003 / 005 (bookmarks + Azure deep-links) | ✅ Implemented |
| FR-BMK-004 / AC-007 (Azure PAT live tiles) | ❌ **Dropped** (per PLAN) — must reconcile spec |
| FR-SPT (Spotify play/pause/next/prev/volume) | ✅ Implemented (synced lyrics correctly deferred) |
| FR-WEA (weather + world clock, per location) | ✅ Implemented |
| FR-NEW (news RSS, click-through, failure isolation) | ✅ Implemented |
| FR-SYS (CPU/RAM) | ✅ Implemented |
| FR-HLT (healthcheck) | ❌ **Not implemented** — dead tab (M1) |
| AC-001..014, AC-009/010, AC-011 | ✅ Built (not formally play-tested) |
| AC-015/016/017 (healthcheck) | ❌ Blocked by M1 |

**Bonus beyond spec:** Translate (DeepL), Frame tiles, preview panel, fullscreen, themes, zoom, OS drag-and-drop of folders/`.sln` onto tiles.

---

## 8. Questions for author
1. **Healthcheck:** implement or cut? (dead tab currently)
2. **Azure live tiles (PAT):** confirmed permanently dropped, or deferred to later? Spec still requires them.
3. Should I add a proper **CSP** (M3)?
4. Are the **Translate** and **Frame** compartments intentionally in scope (spec should be updated to match)?

---

## 9. Verdict
**Approve with recommendations.** No critical defects. The code is well-engineered and secure in its handling of a remarkable number of integrations. The actionable work is: (1) fix the dead Healthcheck tab, (2) reconcile spec/PLAN/README drift, (3) optionally tighten CSP. Play-test AC-001..AC-017 once healthcheck is resolved.

---

## 10. Follow-up — delta review `49d221d..e74e39d` (2026-10-07)

Reviewed PRs #15 (Projects tile), #16 (Spotify shuffle/repeat), #17 (queue jump). Approved.
Findings and dispositions:

- **F1 — case-sensitive extension matching in `solution_in` / `pick_best_solution` / `classify_path`** (`src-tauri/src/lib.rs`): uppercase extensions (`.SLN`, `.CSPROJ`) are silently ignored on Windows. **Disposition: acknowledged, wontfix for now** — Visual Studio writes lowercase extensions in practice; revisit only if a real-world miss is reported. (Owner decision 2026-10-07.)
- **F2 — queue-jump is O(n) sequential skips** (`body._spotJump` in `src/main.js`): correct but slow for deep jumps and risks Spotify `429` (rolling 30s window, `Retry-After` header). Researched alternatives — see recommendation below. **Status: open, recommendation provided.**
- **F3 — `ensureProjectComp()` side effect in delegated panel handler** (`src/main.js`): deleting the Projects tile while its Settings panel is open, then clicking any panel button, silently resurrects an empty tile. **Status: open, fix suggested.**
- **F4 — `find_solution` reads each directory twice** (`src-tauri/src/lib.rs`): two `read_dir` passes (files, then dirs). Harmless but wasteful on large repos. **Status: open, fix suggested.**
- **F5 — symlinked directories are followed by the scanner** (`src-tauri/src/lib.rs`): bounded by the depth-4 cap so no infinite loop, but a symlinked tree under an unusual name is still walked. **Status: open, fix suggested.**

---

## 11. Follow-up — delta review `e74e39d..0e79805` (2026-10-08, PRs #18–#33)

All prior open findings are now resolved; each PR below got a dedicated pre-merge review:

- **F2 (queue-jump fast path) → fixed** (PR #18, #24): `PUT /play {context_uri, offset}` one-call jump on album/playlist contexts; paced (~175ms) skip fallback that stops on 429 with visible status; `context_uri`/`context_type` surfaced via `/me/player`. Follow-up arg-casing bug (`context_uri` vs `contextUri`) diagnosed from the refusal-reason status and fixed (PRs #26–#28).
- **F3 (tile resurrect) → fixed** (PR #22, issue #19): non-creating `findProjectComp()` in the delegated handler; same rule applied to the Vocab tab later (PR #31 review).
- **F4 + F5 (scanner) → fixed** (PR #23, issue #20): single-pass `read_dir`, symlinked entries skipped up front (root loop included).
- **M1 (dead Healthcheck tab) → resolved by removal** (PR #29): tab + panel + unused CSS deleted, zero references remain.
- **M2 (spec drift) → resolved 2026-10-08:** Azure PAT live tiles marked dropped in spec (FR-BMK-004/AC-007), Translate/Frame/Vocab/Meme/Background/Config all specced (FR-VOC incl. 009, FR-MEM, FR-WIN, AC-018..034), README/PLAN status rewritten.
- **New since `e74e39d`:** PR #25 config export/import (#21), PR #29 healthcheck removal + editable/persisted zoom, PR #30 background mode (tray/autostart/behind-mode), PR #31 vocab tile + drill popup (5 pre-merge review findings fixed on-branch), PR #32 meme tile (3 pre-merge review findings fixed on-branch, incl. captioned animated GIF export), PR #33 vocab TTS (per-tile toggle, volume/speed sliders, per-language voices).
- **M3 (null CSP) / M4 (unbounded remote sizes):** still open, unchanged — deferred to Phase 3 hardening.
- **Scope note:** spec §8 healthcheck entries now historical (feature dropped + tab removed); Azure PAT stays dropped; close-behavior decided (close quits).

---

## 12. Follow-up — delta review `0e79805..5d90650` (2026-10-09..15, PRs #34–#45)

Continued work after the MVP: UI polish, a new tile, and a full spaced-repetition stack for the
vocab drill. Each substantive PR got a dedicated pre-merge review; findings were fixed on-branch
before merge.

**Shipped**
- **#34** docs sync · **#35** 6 extra themes (Dracula, Nord, Solarized D/L, Rosé Pine, Gruvbox) ·
  **#36** vocab drill options (category filter, 9-position placement, instant reveal) ·
  **#37** Spotify responsive volume + locally-interpolated progress/seek · **#38** tile right-click
  context menu · **#39** animated country-themed weather card · **#40** per-tile Hide-header mode ·
  **#41** Calendar tile (Vietnamese lunar + moon phase + holidays) · **#42** design-token layer +
  Design tab · **#43** vocab **SM-2 spaced repetition** (+ due badge) · **#44** mastery buckets +
  per-category table · **#45** drill **sessions** (card cap, struggling-first pile, ungraded practice).

**Findings & dispositions**
- **#43 — High (fixed on-branch `a87e198`):** `save_state` wrote the main window's stale in-memory
  `vocab` verbatim, clobbering the drill-written `vocab.srs` on any unrelated save (silent loss of
  SRS progress). Fix: `preserve_rust_vocab_keys()` merges the on-disk Rust-managed keys
  (`srs`, `srsEnabled`, `snoozeUntil`, `lastPopupAt`) into every save; also parses the SRS map once
  in the due/stats scans. Covered by unit tests.
- **#44 — Low (fixed `5bac79a`):** uncategorized cards dropped out of the per-category table (row
  totals didn't reconcile); the table now counts them under `(uncategorized)` and takes the same
  category filter as the mastery bar, so bar and table agree.
- **#45 — Medium + Low (fixed `f8a947e`):** practice inherited the review session cap (default 1) →
  practice now has its own `practicePerSession` (default 10); opening a mode while the popup was
  already open is now honoured by reloading it; the due/mastery snapshot is fetched once per
  session. Separately, a regression where a revealed card **auto-skipped** was fixed (`6e3ae7a`) —
  reveal keeps the card open and retyping is the only way forward (retyping after reveal is part of
  learning).
- **M3 (null CSP) / M4 (unbounded remote sizes):** still open — deferred to Phase 3 hardening.
- **Tests:** the project gained its first Rust unit tests (§ `srs_tests`) — SM-2 scheduling,
  mastery buckets, due/practice batch selection, `save_state` merge, category bucketing —
  `cargo test --lib` → 11 passing at merge of #45.

**Verdict:** #34–#42 approved (Low/Nit only); #43 Approve-with-nits after the High fix; #44/#45
Changes-needed → fixed → merged. `main` clean, no open PRs/issues.

---

## 13. PR #58 - Captions tile review (2026-10-30)

**Scope:** `origin/main...origin/feat/captions-tile` at `e036430` - 5 commits, 15 files, 2032 additions.
**Verdict: Approve-with-nits** - High/Medium findings fixed in `2529ab3`; 3 Low remain.

**Good**
- Clean captions module boundary and command registration; audio stays local; models are opt-in downloads.
- Correct Vosk endpoint handling after the follow-up: `DecodingState::Finalized` now finalizes immediately, with a configurable 700 ms fallback.
- Model catalog is now keyed by unique IDs, so small/large DE/ES packs coexist; temp paths are per-ID; 31 Rust tests pass.
- Good UX: download progress, no auto-download, device selection in both places, pack removal guard, body/status/error handling, 24 h timestamps.
- Windows bundle wiring is present (SDK zip -> link/copy -> resource map); Tauri's Windows resource dir is the exe directory, so the target paths are appropriate.

**Concerns**

| # | Severity | Finding | Suggested fix |
|---|---|---|---|
| 1 | **High** | Auto-save failures are silent (`captions.rs:781-802`): `create_dir_all`, `fs::write`, and the append open/write all ignore errors. If the chosen folder disappears or disk is full, the UI still shows "listening" and the transcript is lost when the app closes. | Surface a save error in `CaptionStatus`/tile status and retry; optionally fall back to app-data `captions/` and tell the user. |
| 2 | Medium | **Clear** stops capture and clears the transcript with no confirmation (`main.js:4644-4648`). With auto-save off, the session is gone in one click. | Use `showConfirmPopup` like model removal; disable while a save is pending. |
| 3 | Medium | Audio backlog is unbounded (`captions.rs:655-703`): `queue`/`samples` keep growing if Vosk is slower than real time (especially with the new 1.9 GB model). Result is increasing latency/memory, not a crash. | Cap backlog to ~1-2 s; drop oldest chunks and mark "falling behind". |
| 4 | Medium | `DecodingState::Failed` is not handled (`captions.rs:668-683`): only `Finalized` is matched, so a decoder failure can leave the UI "listening" with no text and no error. | Treat `Failed` like `accept_waveform` errors and set the engine error state. |
| 5 | Medium | The only caption test covers the catalog (`captions.rs:862-879`); there are no tests for `format_markdown`, the endpoint/pause state machine, or model-download failure paths. | Extract the pure finalization decision + Markdown formatter and unit-test them; mock the download/extract path. |
| 6 | Low | `resources/vosk/NOTICE.txt` is not in `bundle.resources` (`tauri.conf.json:31-39`), so installed builds do not ship the Apache-2.0 NOTICE. | Add `resources/vosk/NOTICE.txt` to the bundle resources (or a credits/About surface). |
| 7 | Low | `wasapi` and `vosk` are unconditional dependencies and the Vosk resources are Windows paths (`Cargo.toml:42-43`), so macOS/Linux builds are blocked more than before. | Gate WASAPI/Vosk behind `cfg(windows)` or a feature; make resources target-specific. |
| 8 | Low | Model removal (`captions.rs:541`) and stopping during a large model load (`captions.rs:295` + `609-613`) run synchronously and can block the invoke/UI for seconds. | Move removal to the background thread; make stop non-blocking or show a "stopping" state. |

**Notes**
- No reviewer comments or CI checks on the PR.
- Installer not built/tested (acknowledged in the PR). Resource-dir placement is correct for Windows per Tauri docs, but a packaged-build smoke test is still needed before release.
- Nit: `spec.md` places the new 2.19 section before the historical 2.9 dropped section; harmless but worth ordering later.

**Disposition after fixes (`2529ab3`)**
- #1 fixed: auto-save failures now set `save_error`, surface in the tile/settings status, and fall back to app-data `captions/`.
- #2 fixed: Clear now asks for confirmation and always stops the engine before clearing.
- #3 fixed: samples are capped at 4 s; oldest audio is dropped if the recognizer falls behind.
- #4 fixed: `DecodingState::Failed` now stops the capture with a visible error.
- #5 fixed: tests added for backlog trimming, partial finalization, Markdown, caption-file creation, and valid/invalid model-zip installs (31 total).
- #6-#8 remain Low follow-ups (NOTICE bundling, Windows-only gating, blocking model remove/stop).

**Recommended merge path:** merge after a packaged-build smoke test; remaining Low items can ship as follow-ups.
