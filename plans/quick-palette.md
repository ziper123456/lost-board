# Plan - Full-width grid canvas + PowerToys Run-style quick palette

Status: **Built** (branch `feat/quick-palette`, 2026-11-04, PR pending).

Spec: `spec.md` FR-LAY-000..002/007, FR-UI-002..007, AC-055..056.

## Goal

Remove the dead strip caused by zooming out, make that area draggable, and
replace the fixed right preview rail with a fast, keyboard-first launcher.

## Locked decisions

- At zoom < 100%, horizontal grid width fills the viewport:
  `gridCanvasWidth = dashboard.clientWidth / zoom`.
- At zoom >= 100%, keep the existing uniform zoom + scrolling behavior.
- The tile layout/state is unchanged (no position/column migration).
- The right preview rail and its width setting are removed.
- **Ctrl+Space** opens the quick palette while the dashboard has focus.
- Palette searches tiles, launcher items, bookmarks, Azure repos, projects, and
  commands.
- Tile eye / right-click Preview opens a floating preview overlay:
  - desktop-style icon grid for launcher/bookmark/Azure/project tiles
  - read-only tile body for other kinds
- Non-launcher preview keeps working; lyrics etc. render into the modal body.
- No global hotkey in this PR (app-focused only).

## Behaviour

- Palette: centered, blurred backdrop, search input, grouped results, ↑/↓/Enter/Esc.
- Palette Enter:
  - place => open folder/solution/URL/repo
  - tile => scroll/focus it
  - command => execute it
- Preview icon grid: click opens the item; Azure cards have a PR action.
- Closing palette/preview restores focus and clears any live timers.

## Changes

- `src/main.js`
  - grid geometry (`gridCanvasWidth`, `cellWidth`, `render`)
  - remove right preview rail/openPreview width code
  - new quick palette builder/search/keyboard/actions
  - floating preview overlay + icon grids
- `src/index.html`
  - remove `#preview`, add `#quick-palette` and `#tile-preview`
  - remove Grid settings preview toggle/width; add Ctrl+Space hint
- `src/styles.css`
  - palette + icon-grid preview styles
  - remove old fixed right-panel styles
- `src/palette.js` (new)
  - pure normalize/score/group helpers
- `scripts/test-palette.cjs` (new)
- `plans/README.md`, `spec.md`

## Verification

- `node --check src/main.js`, `node --check src/palette.js`
- `node scripts/test-palette.cjs`
- Manual:
  - 80% zoom: board fills 1920px; drag/resize/drop/context menu work at the
    right edge.
  - 100%/125% zoom: no regression.
  - Ctrl+Space: search/open/close with keyboard and mouse.
  - Preview icon grids for launcher/bookmark/Azure/project tiles.
  - Preview non-launcher tiles; close/reopen clears timers.
  - Settings no longer shows the old preview width controls.

## Corrections log

- 2026-11-04: plan created and implemented. Full-width canvas, floating preview
  overlay with icon grids, and Ctrl+Space palette are in place. Verified
  `node --check`, `scripts/test-palette.cjs`, `cargo test --lib` (37 passing),
  and a headless DOM render. Manual 80% drag/drop and palette interaction still
  need a hands-on check.
- 2026-11-04: headless Chrome checks at 1920×1200 with `zoom=0.8` confirmed the
  grid rect fills the viewport (`1904px` in the headless viewport, right edge at
  `1904`). Palette opens with 9 results, filtering works, System preview renders,
  and a launcher preview renders one icon card. No JS exceptions.
