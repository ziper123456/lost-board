# Implementation Plan — Background Mode (tray + autostart + always-on-bottom)

> ⚠️ **Status: planned, not built.** Code sketches below are **uncompiled**
> (no Rust toolchain on the planning machine). Treat them as reference —
> verify every API against docs.rs / Tauri v2 docs while implementing,
> fix drift, and note corrections in the commit message.

## 1. Goal

Make lost-board livable as a permanent desktop background: tray icon as its home,
launch-on-login, and an always-behind fullscreen mode. Spec: `spec.md` §2.12
(FR-WIN-001..005), acceptance: AC-018..020.

## 2. Key design finding (do not re-derive)

The frontend has **no bundler** and uses only the `window.__TAURI__` global —
so plugin JS packages (`@tauri-apps/plugin-*`) **cannot** be imported. Consequences:

- **Tray icon → Rust only** (`TrayIconBuilder` in `setup()`).
- **Autostart toggle → Rust wrapper commands** (`set_autostart` / `autostart_enabled`)
  around `tauri-plugin-autostart`; frontend calls them via `invoke` like any other command.
- **Always-on-bottom / fullscreen / skip-taskbar → frontend-direct** via the already-used
  `window.__TAURI__.window.getCurrentWindow()` object (same pattern as the existing
  F11 fullscreen toggle). Only needs ACL permissions in `capabilities/default.json`.

## 3. Prerequisites

- Work laptop with MSVC Build Tools (see TRANSFER-era notes / README prerequisites).
- `npm install` fresh (adds the autostart plugin's build needs — none for JS since no imports).

## 4. Changes, file by file

### 4a. `src-tauri/Cargo.toml`

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }   # ADD "tray-icon"
tauri-plugin-autostart = "2"                          # ADD
```

Then `cargo build` once to update `Cargo.lock` (commit the lockfile).

### 4b. `src-tauri/capabilities/default.json`

Add (verify exact permission IDs against the installed Tauri version):

```json
"permissions": [
  "core:default",
  "core:window:allow-set-fullscreen",
  "core:window:allow-set-always-on-bottom",
  "core:window:allow-set-skip-taskbar",
  "opener:default",
  "shell:allow-open"
]
```

No `autostart:*` permissions needed — the frontend never calls plugin commands
directly; all autostart access goes through our own Rust wrappers (§4c), which are
covered by `core:default` invoke rights like every other command.

### 4c. `src-tauri/src/lib.rs`

Autostart wrappers (sketch — verify `ManagerExt`/`autolaunch()` names):

```rust
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled { m.enable() } else { m.disable() }
        .map_err(|e| format!("autostart: {e}"))
}

#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| format!("autostart: {e}"))
}
```

Register both in `generate_handler![...]`, and init the plugin in the builder
(verify `init` signature for the installed version):

```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None, // extra args
))
```

Tray icon in `.setup()` (sketch — verify `MenuBuilder`/`MenuItemBuilder`/`TrayIconBuilder` names):

```rust
.setup(|app| {
    use tauri::{
        menu::{MenuBuilder, MenuItemBuilder},
        tray::TrayIconBuilder,
        Manager,
    };
    let show = MenuItemBuilder::new("Show").id("show").build(app)?;
    let hide = MenuItemBuilder::new("Hide").id("hide").build(app)?;
    let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &hide, &quit]).build()?;
    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("lost-board")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => { let _ = app.get_webview_window("main").map(|w| { let _ = w.show(); let _ = w.set_focus(); }); }
            "hide" => { let _ = app.get_webview_window("main").map(|w| { let _ = w.hide(); }); }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
})
```

Icon: reuse the app icon via `app.default_window_icon()` if the builder doesn't pick
it up automatically — check at runtime; a missing tray icon is immediately visible.

### 4d. `src/index.html` — Settings UI

In the Grid tab's `.view-controls`, add (next to the fullscreen row):

```html
<div class="item-row">
  <label>Background mode
    <input id="set-background" type="checkbox" title="Pin fullscreen behind all windows" />
  </label>
  <label>Start with Windows
    <input id="set-autostart" type="checkbox" />
  </label>
</div>
```

### 4e. `src/main.js` — behavior

```js
// Native wrappers (same pattern as the rest of `native`):
async setAutostart(enabled) {
  if (window.__TAURI__) return invoke("set_autostart", { enabled });
},
async autostartEnabled() {
  if (window.__TAURI__) return invoke("autostart_enabled");
  return false;
},
```

Background-mode apply function (frontend-direct via the existing `__TAURI__.window` handle):

```js
async function applyBackgroundMode(on) {
  state.backgroundMode = on === true;
  saveState();
  if (!window.__TAURI__) return;
  const win = window.__TAURI__.window.getCurrentWindow();
  await win.setAlwaysOnBottom(state.backgroundMode);
  await win.setSkipTaskbar(state.backgroundMode);   // verify method name
  if (state.backgroundMode) await win.setFullscreen(true);
  // Leaving background mode does NOT force-exit fullscreen; F11/toggle still controls it.
}
```

Wire-up:

- `#set-background` change → `applyBackgroundMode(e.target.checked)` + `render()`.
- `#set-autostart` change → `native.setAutostart(...)`, revert checkbox + alert on error.
- In `initialize()`: after state load, sync both checkboxes
  (`set-background` ← `state.backgroundMode`; `set-autostart` ← `await native.autostartEnabled()`),
  then `applyBackgroundMode(state.backgroundMode)` to restore the mode across restarts.
  (Autostart itself persists OS-side; only the checkbox needs syncing.)

Edge: `setSkipTaskbar` method/permission names must be verified — if the method doesn't
exist in the installed version, drop taskbar-hiding from v1 of this feature (tray +
behind-mode still deliver the value) and note it.

## 5. Verification (on the work laptop — requires build)

1. `npm run dev` compiles clean (this validates all sketches at once).
2. Toggle Autostart on → check Windows Task Manager → Startup tab lists lost-board; toggle off → gone. (AC-018)
3. Enable Background mode → open Notepad/another app over it → dashboard stays fullscreen behind; no taskbar slot; tray icon visible with Show/Hide/Quit working. (AC-019)
4. F11 / fullscreen toggle → windowed, draggable by title bar; re-enable fullscreen keeps behind-mode. (AC-020)
5. Restart app → background mode + checkboxes restored from state.
6. Win+D minimizes → restore via tray Show (accepted quirk, FR-WIN-005 — just confirm no crash/weirdness).

## 6. Done criteria

- [ ] Builds clean (`npm run dev` / `cargo build`).
- [ ] AC-018..020 play-tested, results noted in commit message.
- [ ] Commit references this plan (`plans/background-mode.md`) and lists any API corrections.
- [ ] Open question resolved: window-close behavior with tray present (close-to-tray vs quit) — record decision in `spec.md` §8.

## 7. Risks & unknowns

- Exact `tauri-plugin-autostart` init/Menu builder method names (verify at build time).
- `setSkipTaskbar` availability (fallback: ship without taskbar-hiding).
- Tray icon rendering (verify visually; fallback: explicit `.icon(...)` from app icon).
