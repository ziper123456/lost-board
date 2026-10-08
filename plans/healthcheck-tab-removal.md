# Implementation Plan — Remove dead Healthcheck tab

> ✅ **Status: built and merged (PR #29, 2026-10-08).** Deletion-only as planned, plus an editable/persisted zoom input on the same branch.

## 1. Goal

Complete the Healthcheck drop (decided 2026-10-07, spec §2.9/§7): remove the dead UI
so no empty panel misleads users. No logic to delete — the tab was never wired.

## 2. Changes, file by file

### 2a. `src/index.html` — delete 2 blocks

1. The tab button:
   `<button class="tab" data-tab="healthcheck">Healthcheck</button>`
2. The panel:
   `<div class="tab-panel" data-panel="healthcheck"><div id="healthcheck-list"></div></div>`

### 2b. `src/styles.css` — optional

Delete the `/* Status badges for healthcheck */` block (`.status`, `.status.ok`,
`.status.bad`, `.status.unknown`) **only if** nothing else uses those classes —
grep first. If in doubt, leave the CSS; dead CSS is harmless.

### 2c. Verify no JS references (expected: none)

Grep `src/main.js` for `healthcheck` — prior review confirmed the only matches are
none in JS (`activateTab`, `renderTabPanel`, `KIND_TAB` all omit it). If any reference
appeared since, remove or guard it.

## 3. Verification (on the work laptop)

1. `npm run dev` compiles/runs.
2. Open Settings → confirm no Healthcheck tab; click through every remaining tab
   (no console errors from a missing panel).
3. Grid renders normally; add/remove a tile as a smoke test.

## 4. Done criteria

- [ ] Tab + panel gone; no JS/CSS references remain (or are intentionally kept).
- [ ] Commit references this plan.
