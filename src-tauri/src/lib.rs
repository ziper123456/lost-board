//! lost-board native backend.
//!
//! Exposes Tauri commands that a pure web page cannot do:
//! - open a folder in the OS file explorer
//! - open a `.sln` (or any file) using its registered OS file association
//! - read live CPU / RAM usage
//!
//! All commands are local-only (single-user app). No network server is exposed.

use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

#[derive(Serialize)]
struct SystemStats {
    cpu_percent: f32,
    ram_used_bytes: u64,
    ram_total_bytes: u64,
    ram_percent: f32,
}

/// Open a folder in the OS file explorer. Accepts an absolute path.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }
    open_path(&path)
}

/// Open a solution (`.sln`) or any file via its registered OS file association.
/// This *opens* the file — it does NOT build the solution.
#[tauri::command]
fn open_solution(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {path}"));
    }
    open_path(&path)
}

/// Open a URL in the default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open_path(&url)
}

/// Open a native folder picker; returns the chosen absolute path or `None`.
#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    let dir = rfd::AsyncFileDialog::new()
        .set_title("Choose a folder")
        .pick_folder()
        .await;
    Ok(dir.map(|d| d.path().to_string_lossy().into_owned()))
}

/// Open a native file picker filtered to solutions; returns the path or `None`.
#[tauri::command]
async fn pick_solution() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Choose a solution (.sln)")
        .add_filter("Solution", &["sln"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().into_owned()))
}

/// Classify a dropped path so the frontend can add it as a folder or a solution:
/// returns `"dir"`, `"sln"` (a solution/project file), or `"file"` (any other file).
#[tauri::command]
fn classify_path(path: String) -> String {
    let p = Path::new(&path);
    if p.is_dir() {
        "dir".into()
    } else if p.is_file()
        && matches!(
            p.extension().and_then(|e| e.to_str()),
            Some("sln" | "slnx" | "csproj")
        )
    {
        "sln".into()
    } else if p.is_file() {
        "file".into()
    } else {
        "missing".into()
    }
}

#[derive(Serialize)]
struct FeedItem {
    title: String,
    link: String,
}

#[derive(Serialize)]
struct FeedResult {
    feed_title: String,
    items: Vec<FeedItem>,
}

/// Fetch and parse an RSS/Atom feed. Running in Rust avoids browser CORS
/// restrictions that would block arbitrary news feeds from the webview.
/// Returns the feed title and its entries (title + link each).
#[tauri::command]
async fn fetch_rss(url: String) -> Result<FeedResult, String> {
    let body = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "lost-board/0.1")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("read failed: {e}"))?;

    let feed = feed_rs::parser::parse(&body[..])
        .map_err(|e| format!("parse failed: {e}"))?;

    let items = feed
        .entries
        .into_iter()
        .filter_map(|e| {
            let link = e
                .links
                .iter()
                .find(|l| l.rel.as_deref().unwrap_or("alternate") == "alternate" || l.href.starts_with("http"))
                .map(|l| l.href.clone())
                .or(e.links.first().map(|l| l.href.clone()));
            let title = e.title.map(|t| t.content).unwrap_or_default();
            let link = link.unwrap_or_default();
            if title.is_empty() && link.is_empty() {
                None
            } else {
                Some(FeedItem { title, link })
            }
        })
        .take(20)
        .collect();

    Ok(FeedResult {
        feed_title: feed.title.map(|t| t.content).unwrap_or_default(),
        items,
    })
}

/// A process-wide `System` kept alive so CPU usage (a delta between samples)
/// accumulates across calls instead of resetting to 0 on every fresh instance.
/// Memory is only measured if `.with_ram()` is set — a bare `MemoryRefreshKind::new()`
/// is an *empty* set and yields 0 for both used and total RAM.
fn system_handle() -> &'static std::sync::Mutex<System> {
    use std::sync::{Mutex, OnceLock};
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        Mutex::new(System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::new().with_cpu_usage())
                .with_memory(MemoryRefreshKind::new().with_ram()),
        ))
    })
}

/// Read current CPU and RAM usage.
#[tauri::command]
fn get_system_stats() -> SystemStats {
    let mut sys = system_handle().lock().expect("system mutex poisoned");
    // Let a little time pass so the CPU delta since the previous sample is meaningful.
    std::thread::sleep(std::time::Duration::from_millis(300));
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let ram_used_bytes = sys.used_memory();
    let ram_total_bytes = sys.total_memory();
    let ram_percent = if ram_total_bytes > 0 {
        (ram_used_bytes as f64 / ram_total_bytes as f64 * 100.0) as f32
    } else {
        0.0
    };

    SystemStats {
        cpu_percent,
        ram_used_bytes,
        ram_total_bytes,
        ram_percent,
    }
}

#[cfg(target_os = "windows")]
fn open_path(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // 0x00000008 = SW_HIDE, avoid flashing a console window.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", path])
        .creation_flags(0x08000000)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open '{path}': {e}"))
}

#[cfg(target_os = "macos")]
fn open_path(path: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open '{path}': {e}"))
}

#[cfg(target_os = "linux")]
fn open_path(path: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to open '{path}': {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            pick_folder,
            pick_solution,
            classify_path,
            open_folder,
            open_solution,
            open_url,
            fetch_rss,
            get_system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running lost-board");
}

const STATE_FILE_NAME: &str = "dashboard-state.json";

/// Validate the expected dashboard-state schema. The payload must be an object
/// with a positive-integer `columns` and an array of `compartments`, each a
/// valid compartment object. This guards against syntactically-valid but
/// semantically-broken payloads (e.g. `[]`, `"oops"`, `{ "columns": "12" }`)
/// that would otherwise break render logic later.
fn validate_state(state_json: &str) -> bool {
    let value: serde_json::Value = match serde_json::from_str(state_json) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let obj = match value.as_object() {
        Some(o) => o,
        None => return false,
    };

    let columns = match obj.get("columns") {
        Some(serde_json::Value::Number(n)) => n.as_i64(),
        _ => None,
    };
    if !matches!(columns, Some(n) if n > 0) {
        return false;
    }

    let compartments = match obj.get("compartments") {
        Some(serde_json::Value::Array(a)) => a,
        _ => return false,
    };

    compartments.iter().all(validate_compartment)
}

/// A compartment is valid when it has a string `id`, a string `kind`, a string
/// `title`, and numeric `x`, `y`, `w`, `h`. `data` is optional (objects only).
fn validate_compartment(c: &serde_json::Value) -> bool {
    let obj = match c.as_object() {
        Some(o) => o,
        None => return false,
    };

    let is_string = |k: &str| matches!(obj.get(k), Some(serde_json::Value::String(_)));
    let is_num = |k: &str| matches!(obj.get(k), Some(serde_json::Value::Number(_)));

    if !is_string("id") || !is_string("kind") || !is_string("title") {
        return false;
    }
    if !is_num("x") || !is_num("y") || !is_num("w") || !is_num("h") {
        return false;
    }
    match obj.get("data") {
        None => true,
        Some(serde_json::Value::Object(_)) => true,
        Some(_) => false,
    }
}

/// Read non-secret dashboard configuration from the app-data directory.
/// A file that is not valid, expected dashboard state is preserved as `.bak`
/// and treated as absent (so the app falls back to defaults).
#[tauri::command]
fn load_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = state_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read dashboard state: {e}"))?;

    if validate_state(&contents) {
        Ok(Some(contents))
    } else {
        let backup = path.with_extension("json.bak");
        fs::rename(&path, &backup)
            .map_err(|e| format!("Failed to back up corrupt dashboard state: {e}"))?;
        Ok(None)
    }
}

/// Save ordinary dashboard configuration. Credentials belong in the OS secret
/// store and must never be included in this JSON payload.
#[tauri::command]
fn save_state(app: tauri::AppHandle, state_json: String) -> Result<(), String> {
    if !validate_state(&state_json) {
        return Err("Refusing to save dashboard state that does not match the expected schema".into());
    }

    let path = state_file_path(&app)?;
    let parent = path.parent().ok_or("Dashboard state has no parent directory")?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create app-data directory: {e}"))?;
    fs::write(&path, state_json)
        .map_err(|e| format!("Failed to save dashboard state: {e}"))
}

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(STATE_FILE_NAME))
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))
}
