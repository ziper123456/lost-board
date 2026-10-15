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
use base64::Engine;

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

/// Open a native image picker for a custom tile-head icon; returns path or None.
#[tauri::command]
async fn pick_icon() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Choose an icon (.ico, .png, .jpg, .svg)")
        .add_filter("Icon", &["ico", "png", "jpg", "jpeg", "svg"])
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

/// Read an image file (e.g. a custom tile-head icon) and return it as a data URI.
/// Validates that it's an image extension; reuses the base64 helpers.
#[tauri::command]
fn load_tile_icon(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "ico" => "image/x-icon",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        _ => return Err("unsupported icon file type".into()),
    };
    let bytes = fs::read(p).map_err(|e| format!("Failed to read icon: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Open a native image picker for a frame tile (image/GIF); returns path or None.
#[tauri::command]
async fn pick_image() -> Result<Option<String>, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Choose an image or GIF")
        .add_filter("Image", &["png", "jpg", "jpeg", "gif", "webp", "svg"])
        .pick_file()
        .await;
    Ok(file.map(|f| f.path().to_string_lossy().into_owned()))
}

/// Read an image/GIF file for a photo-frame tile and return it as a data URI.
#[tauri::command]
fn load_frame_image(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => return Err("unsupported image file type".into()),
    };
    let bytes = fs::read(p).map_err(|e| format!("Failed to read image: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[derive(Serialize)]
struct ProjectEntry {
    /// Full path of the project folder.
    folder: String,
    /// Optional solution path found within (or below) the project folder.
    solution: Option<String>,
}

/// Scan a repository root: every immediate subfolder becomes a "project". For
/// each, walk downward until a solution file (.sln/.slnx/.csproj) is found.
/// Also returns any solution files loose in the root itself.
#[tauri::command]
fn scan_project_root(root: String) -> Result<Vec<ProjectEntry>, String> {
    let root_p = Path::new(&root);
    if !root_p.is_dir() {
        return Err(format!("Root folder not found: {root}"));
    }

    // Solutions loose in the root (e.g. repo-level .sln) get a "root" pseudo-project.
    let mut projects = Vec::new();
    let mut root_solutions: Vec<String> = Vec::new();
    for entry in fs::read_dir(root_p)
        .map_err(|e| format!("Failed to read root: {e}"))?
        .filter_map(Result::ok)
    {
        // Never follow symlinked entries at the root either.
        if entry.file_type().map(|t| t.is_symlink()).unwrap_or(false) {
            continue;
        }
        let p = entry.path();
        if p.is_file() {
            if let Some(sln) = solution_in(&p) {
                root_solutions.push(sln);
            }
        } else if p.is_dir() {
            // Skip common ignored dirs and hidden/dot-dirs (e.g. .vs, .idea).
            let name = p.file_name().and_then(|x| x.to_str()).unwrap_or("");
            if is_ignored_dir(name) {
                continue;
            }
            let solution = find_solution(&p, 0);
            projects.push(ProjectEntry {
                folder: p.to_string_lossy().into_owned(),
                solution,
            });
        }
    }

    if !root_solutions.is_empty() {
        projects.insert(0, ProjectEntry {
            folder: root_p.to_string_lossy().into_owned(),
            solution: pick_best_solution(&mut root_solutions),
        });
    }

    projects.sort_by(|a, b| a.folder.cmp(&b.folder));
    Ok(projects)
}

/// Directories never treated as projects and never recursed into.
fn is_ignored_dir(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "node_modules" | "bin" | "obj" | "target" | "dist" | "out"
        )
}

/// A folder can hold several candidates (e.g. a .sln next to a .csproj).
/// The Solution button opens exactly one path, so pick a single winner:
/// .sln first, then .slnx, then .csproj, alphabetical within each kind.
fn pick_best_solution(candidates: &mut Vec<String>) -> Option<String> {
    candidates.sort();
    let rank = |s: &str| {
        if s.ends_with(".sln") {
            0
        } else if s.ends_with(".slnx") {
            1
        } else {
            2
        }
    };
    candidates.sort_by_key(|s| rank(s));
    candidates.into_iter().next().cloned()
}

fn solution_in(p: &Path) -> Option<String> {
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    if matches!(ext, "sln" | "slnx" | "csproj") {
        Some(p.to_string_lossy().into_owned())
    } else {
        None
    }
}

/// Recursively search `dir` for a solution file, up to `depth` levels.
/// Single pass: collects candidate files + subdirs together, skipping
/// symlinked entries up front so linked trees are never followed.
fn find_solution(dir: &Path, depth: usize) -> Option<String> {
    let mut here = Vec::new();
    let mut subdirs = Vec::new();
    if let Ok(read) = fs::read_dir(dir) {
        for entry in read.filter_map(Result::ok) {
            // Never follow symlinked dirs (avoids cycles / duplicated trees).
            if entry.file_type().map(|t| t.is_symlink()).unwrap_or(false) {
                continue;
            }
            let p = entry.path();
            if p.is_file() {
                if let Some(s) = solution_in(&p) {
                    here.push(s);
                }
            } else if p.is_dir() {
                subdirs.push(p);
            }
        }
    }
    if !here.is_empty() {
        return pick_best_solution(&mut here);
    }
    if depth >= 4 {
        return None;
    }
    for p in subdirs {
        let name = p.file_name().and_then(|x| x.to_str()).unwrap_or("");
        if is_ignored_dir(name) {
            continue;
        }
        if let Some(s) = find_solution(&p, depth + 1) {
            return Some(s);
        }
    }
    None
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

const FAVICON_DIR: &str = "favicons";

/// Fetch a site favicon (via DuckDuckGo's keyless icon service), cache it under
/// the app-data dir, and return it as a `data:` URI. Subsequent calls for the
/// same host are served from the on-disk cache (no network), so the app works
/// offline once an icon has been fetched.
#[tauri::command]
async fn cache_favicon(app: tauri::AppHandle, host: String) -> Result<String, String> {
    // Sanitize the host into a safe file name.
    let safe: String = host
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        return Err("invalid host".into());
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))?
        .join(FAVICON_DIR);
    let path = dir.join(format!("{safe}.ico"));

    let bytes = if path.exists() {
        fs::read(&path).map_err(|e| format!("Failed to read cached favicon: {e}"))?
    } else {
        let url = format!("https://icons.duckduckgo.com/ip3/{host}.ico");
        let resp = reqwest::Client::new()
            .get(&url)
            .header("User-Agent", "lost-board/0.1")
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("favicon request failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("favicon HTTP {}", resp.status()));
        }
        let b = resp
            .bytes()
            .await
            .map_err(|e| format!("favicon read failed: {e}"))?
            .to_vec();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create favicon dir: {e}"))?;
        fs::write(&path, &b).map_err(|e| format!("Failed to cache favicon: {e}"))?;
        b
    };

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/x-icon;base64,{b64}"))
}

const IMAGE_DIR: &str = "images";
const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(data))
}

/// MIME from a cached file extension (only types this command ever stores).
fn image_mime_for(ext: &str) -> &'static str {
    match ext {
        "jpg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn image_data_uri(ext: &str, bytes: &[u8]) -> String {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{};base64,{b64}", image_mime_for(ext))
}

/// Resolve an image extension: sniff the response Content-Type first
/// (Pinterest URLs often lack usable extensions), fall back to the URL
/// extension, reject anything that isn't an image.
fn image_ext_for(content_type: &str, url: &str) -> Option<&'static str> {
    match content_type {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/avif" => Some("avif"),
        "image/x-icon" => Some("ico"),
        _ => {
            let ext = url
                .rsplit(['?', '#'])
                .next()
                .unwrap_or(url)
                .rsplit('.')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();
            match ext.as_str() {
                "jpg" | "jpeg" => Some("jpg"),
                "png" => Some("png"),
                "gif" => Some("gif"),
                "webp" => Some("webp"),
                "svg" => Some("svg"),
                "bmp" => Some("bmp"),
                "avif" => Some("avif"),
                "ico" => Some("ico"),
                _ => None,
            }
        }
    }
}

/// Fetch any image URL (meme templates, Pinterest direct links), cache the
/// bytes under app-data `images/` keyed by SHA-256 of the URL, and return a
/// data-URI. State holds the cache key (reference), never the bytes.
/// Fetching through here (never remote `<img src>`) kills CORS, hotlink
/// blocks, and URL rot after the first fetch.
#[tauri::command]
async fn fetch_image_cached(app: tauri::AppHandle, url: String) -> Result<String, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http(s) image URLs can be fetched".into());
    }
    let key = sha256_hex(url.as_bytes());
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))?
        .join(IMAGE_DIR);

    if let Ok(rd) = fs::read_dir(&dir) {
        for entry in rd.filter_map(Result::ok) {
            let p = entry.path();
            if p.file_stem().and_then(|s| s.to_str()) == Some(key.as_str()) {
                let bytes = fs::read(&p).map_err(|e| format!("Failed to read cached image: {e}"))?;
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("bin")
                    .to_string();
                return Ok(image_data_uri(&ext, &bytes));
            }
        }
    }

    let (ext, bytes) = download_image(&url).await?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create image dir: {e}"))?;
    fs::write(dir.join(format!("{key}.{ext}")), &bytes)
        .map_err(|e| format!("Failed to cache image: {e}"))?;
    Ok(image_data_uri(&ext, &bytes))
}

/// Download + validate a remote image without caching: returns extension and
/// bytes. Shared by fetch_image_cached (which also stores) and
/// save_meme_source (export path).
async fn download_image(url: &str) -> Result<(String, Vec<u8>), String> {
    let resp = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "lost-board/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("image request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("image HTTP {}", resp.status()));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !content_type.is_empty() && !content_type.starts_with("image/") {
        return Err(format!("URL is not an image ({content_type})"));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("image read failed: {e}"))?
        .to_vec();
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds the 15 MB limit".into());
    }
    let ext = image_ext_for(&content_type, url).ok_or("could not determine image type")?;
    Ok((ext.to_string(), bytes))
}

#[derive(serde::Serialize)]
struct CachedImageRef {
    key: String,
    uri: String,
}

/// Import a local image file (file browse / OS drop) into the image cache.
/// Content-addressed by SHA-256 of the bytes; state stores the key only.
#[tauri::command]
async fn import_image_file(app: tauri::AppHandle, path: String) -> Result<CachedImageRef, String> {
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let ext = match ext.as_str() {
        "jpg" | "jpeg" => "jpg".to_string(),
        "png" | "gif" | "webp" | "svg" | "bmp" | "avif" | "ico" => ext,
        _ => return Err("not a supported image file".into()),
    };
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read image: {e}"))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("image exceeds the 15 MB limit".into());
    }
    let key = sha256_hex(&bytes);
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))?
        .join(IMAGE_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create image dir: {e}"))?;
    fs::write(dir.join(format!("{key}.{ext}")), &bytes)
        .map_err(|e| format!("Failed to cache image: {e}"))?;
    Ok(CachedImageRef {
        key,
        uri: image_data_uri(&ext, &bytes),
    })
}

/// Resolve a cache key to a data-URI (collection render path). File-backed
/// entries re-fetch from `sourceUrl` on a miss via `fetch_image_cached`.
#[tauri::command]
async fn load_cached_image(app: tauri::AppHandle, key: String) -> Result<String, String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid cache key".into());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))?
        .join(IMAGE_DIR);
    if let Ok(rd) = fs::read_dir(&dir) {
        for entry in rd.filter_map(Result::ok) {
            let p = entry.path();
            if p.file_stem().and_then(|s| s.to_str()) == Some(key.as_str()) {
                let bytes = fs::read(&p).map_err(|e| format!("Failed to read cached image: {e}"))?;
                let ext = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("bin")
                    .to_string();
                return Ok(image_data_uri(&ext, &bytes));
            }
        }
    }
    Err("image not in cache".into())
}

/// Save an exported meme PNG (base64 payload from the canvas export). When
/// `dir` names an existing folder the file lands there as `filename` — the
/// caller shows the full path, so exports are never lost in a silent
/// download folder. With an empty `dir`, a native save dialog asks each time.
/// Returns the written path, or None when the dialog was cancelled.
#[tauri::command]
async fn save_meme_png(dir: String, filename: String, png_base64: String) -> Result<Option<String>, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim())
        .map_err(|e| format!("bad image data: {e}"))?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("payload is not a PNG image".into());
    }
    let safe = sanitize_meme_filename(&filename)?;
    let dest = match resolve_meme_dest(&dir, &safe, "Save meme PNG", "PNG", &["png"]).await? {
        Some(d) => d,
        None => return Ok(None),
    };
    fs::write(&dest, &bytes).map_err(|e| format!("Failed to save PNG: {e}"))?;
    Ok(Some(dest.to_string_lossy().into_owned()))
}

#[derive(serde::Serialize)]
struct SavedMeme {
    path: String,
    ext: String,
}

/// Save the ORIGINAL source bytes of a collection entry (no re-encode): a GIF
/// stays an animated GIF, a JPG stays a JPG. Used for caption-less exports;
/// anything with caption text still goes through the PNG canvas render.
/// Resolution order: disk cache by key, then remote download by URL (which
/// also refreshes the cache). Returns path + extension, or None on cancel.
#[tauri::command]
async fn save_meme_source(
    app: tauri::AppHandle,
    dir: String,
    stem: String,
    cache_key: String,
    source_url: String,
) -> Result<Option<SavedMeme>, String> {
    let (ext, bytes) = resolve_meme_source_bytes(&app, &cache_key, &source_url).await?;
    let stem = sanitize_meme_stem(&stem)?;
    let dest = match resolve_meme_dest(
        &dir,
        &format!("{stem}.{ext}"),
        "Save meme",
        "Images",
        &["png", "jpg", "jpeg", "gif", "webp", "bmp"],
    )
    .await?
    {
        Some(d) => d,
        None => return Ok(None),
    };
    fs::write(&dest, &bytes).map_err(|e| format!("Failed to save image: {e}"))?;
    Ok(Some(SavedMeme {
        path: dest.to_string_lossy().into_owned(),
        ext,
    }))
}

/// Shared resolution of a collection entry to its original (extension,
/// bytes): disk cache by key first, then remote download by URL (which also
/// refreshes the cache).
async fn resolve_meme_source_bytes(
    app: &tauri::AppHandle,
    cache_key: &str,
    source_url: &str,
) -> Result<(String, Vec<u8>), String> {
    let image_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))?
        .join(IMAGE_DIR);
    if !cache_key.is_empty() && cache_key.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Ok(rd) = fs::read_dir(&image_dir) {
            for entry in rd.filter_map(Result::ok) {
                let p = entry.path();
                if p.file_stem().and_then(|s| s.to_str()) == Some(cache_key) {
                    let bytes = fs::read(&p).map_err(|e| format!("Failed to read cached image: {e}"))?;
                    let ext = p
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("bin")
                        .to_string();
                    return Ok((ext, bytes));
                }
            }
        }
    }
    if source_url.starts_with("http://") || source_url.starts_with("https://") {
        if let Ok((ext, bytes)) = download_image(source_url.trim()).await {
            let key = sha256_hex(source_url.trim().as_bytes());
            fs::create_dir_all(&image_dir).map_err(|e| format!("Failed to create image dir: {e}"))?;
            let _ = fs::write(image_dir.join(format!("{key}.{ext}")), &bytes);
            return Ok((ext, bytes));
        }
    }
    Err("original image unavailable (offline and uncached)".into())
}

fn sanitize_meme_stem(stem: &str) -> Result<String, String> {
    let safe: String = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        return Err("invalid file name".into());
    }
    Ok(safe)
}

/// Filename variant that additionally allows dots (for caller-built names
/// like `meme-123.png` that already carry their extension).
fn sanitize_meme_filename(name: &str) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() || safe == ".png" {
        return Err("invalid file name".into());
    }
    Ok(safe)
}

/// Resolve the export destination: fixed output dir, or a native save dialog.
/// Returns None when the dialog was cancelled.
async fn resolve_meme_dest(
    dir: &str,
    filename: &str,
    dialog_title: &str,
    filter_name: &str,
    filter_exts: &[&str],
) -> Result<Option<std::path::PathBuf>, String> {
    if dir.trim().is_empty() {
        match rfd::AsyncFileDialog::new()
            .set_title(dialog_title)
            .set_file_name(filename)
            .add_filter(filter_name, filter_exts)
            .save_file()
            .await
        {
            Some(f) => Ok(Some(f.path().to_path_buf())),
            None => Ok(None),
        }
    } else {
        let d = std::path::PathBuf::from(dir.trim());
        if !d.is_dir() {
            return Err("output folder no longer exists — pick it again".into());
        }
        Ok(Some(d.join(filename)))
    }
}

/// Load a Windows caption font (Impact preferred, bold Arial fallback).
fn load_meme_font() -> Result<Vec<u8>, String> {
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_string());
    for name in ["impact.ttf", "arialbd.ttf"] {
        let p = Path::new(&windir).join("Fonts").join(name);
        if let Ok(bytes) = fs::read(&p) {
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }
    Err("no caption font found (expected Impact or Arial Bold in Windows Fonts)".into())
}

/// Draw one Impact-style caption (white fill, black outline, word-wrapped,
/// uppercased like the canvas preview) onto a composited GIF frame.
fn draw_meme_caption(
    img: &mut image::RgbaImage,
    text: &str,
    top_side: bool,
    font: &ab_glyph::FontRef,
) {
    let clean = text.trim().to_uppercase();
    if clean.is_empty() {
        return;
    }
    let w = img.width();
    let h = img.height();
    let size = (w / 10).max(16);
    let scale = ab_glyph::PxScale::from(size as f32);
    let mut lines: Vec<String> = Vec::new();
    let mut line = String::new();
    for word in clean.split_whitespace() {
        let test = if line.is_empty() {
            word.to_string()
        } else {
            format!("{line} {word}")
        };
        let (tw, _) = imageproc::drawing::text_size(scale, font, &test);
        if tw > (w as f32 * 0.94) as u32 && !line.is_empty() {
            lines.push(std::mem::take(&mut line));
            line = word.to_string();
        } else {
            line = test;
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    let black = image::Rgba([0, 0, 0, 255]);
    let white = image::Rgba([255, 255, 255, 255]);
    let d = (size / 14).max(2) as i32;
    let step = size as i32 + d * 2;
    for (i, ln) in lines.iter().enumerate() {
        let (tw, _) = imageproc::drawing::text_size(scale, font, ln);
        let x = (w as i32 - tw as i32) / 2;
        let y = if top_side {
            (size / 3) as i32 + step * i as i32
        } else {
            h as i32 - (size / 3) as i32 - step * (lines.len() - i) as i32
        };
        for (dx, dy) in [
            (-d, -d),
            (0, -d),
            (d, -d),
            (-d, 0),
            (d, 0),
            (-d, d),
            (0, d),
            (d, d),
        ] {
            imageproc::drawing::draw_text_mut(img, black, x + dx, y + dy, scale, font, ln);
        }
        imageproc::drawing::draw_text_mut(img, white, x, y, scale, font, ln);
    }
}

/// Caption every frame of an animated GIF and re-encode it, preserving frame
/// delays and disposal semantics (partial frames composited onto a running
/// canvas, like a player would). Caps at 500 frames for sanity.
fn caption_gif_frames(
    bytes: &[u8],
    top: &str,
    bottom: &str,
    font: &ab_glyph::FontRef,
) -> Result<Vec<u8>, String> {
    let mut opts = gif::DecodeOptions::new();
    opts.set_color_output(gif::ColorOutput::RGBA);
    let mut reader = opts
        .read_info(std::io::Cursor::new(bytes))
        .map_err(|e| format!("GIF decode: {e}"))?;
    let (gw, gh) = (reader.width() as u32, reader.height() as u32);
    if gw == 0 || gh == 0 {
        return Err("GIF has no dimensions".into());
    }
    let mut canvas = image::RgbaImage::new(gw, gh);
    let mut out: Vec<image::Frame> = Vec::new();
    let mut count = 0u32;
    while let Some(frame) = reader
        .read_next_frame()
        .map_err(|e| format!("GIF frame: {e}"))?
    {
        count += 1;
        if count > 500 {
            return Err("GIF has too many frames (500+ cap)".into());
        }
        let (fw, fh) = (frame.width as u32, frame.height as u32);
        let (fx, fy) = (frame.left as u32, frame.top as u32);
        if fw == 0 || fh == 0 || frame.buffer.len() < (fw * fh * 4) as usize {
            continue;
        }
        let snapshot = if frame.dispose == gif::DisposalMethod::Previous {
            Some(canvas.clone())
        } else {
            None
        };
        if let Some(sub) = image::RgbaImage::from_raw(fw, fh, frame.buffer.to_vec()) {
            let cx = fx.min(gw.saturating_sub(1)) as i64;
            let cy = fy.min(gh.saturating_sub(1)) as i64;
            image::imageops::overlay(&mut canvas, &sub, cx, cy);
        }
        let mut composed = canvas.clone();
        draw_meme_caption(&mut composed, top, true, font);
        draw_meme_caption(&mut composed, bottom, false, font);
        let delay = image::Delay::from_numer_denom_ms(frame.delay as u32 * 10, 1);
        out.push(image::Frame::from_parts(composed, 0, 0, delay));
        match frame.dispose {
            gif::DisposalMethod::Background => {
                let clear = image::Rgba([0, 0, 0, 0]);
                for y in fy..(fy + fh).min(gh) {
                    for x in fx..(fx + fw).min(gw) {
                        canvas.put_pixel(x, y, clear);
                    }
                }
            }
            gif::DisposalMethod::Previous => {
                if let Some(s) = snapshot {
                    canvas = s;
                }
            }
            _ => {}
        }
    }
    if out.is_empty() {
        return Err("GIF has no frames".into());
    }
    let mut buf = Vec::new();
    {
        let mut enc = image::codecs::gif::GifEncoder::new(&mut buf);
        enc.set_repeat(image::codecs::gif::Repeat::Infinite)
            .map_err(|e| format!("GIF encode: {e}"))?;
        enc.encode_frames(out)
            .map_err(|e| format!("GIF encode: {e}"))?;
    }
    Ok(buf)
}

/// Save a CAPTIONED animated GIF: decode the source, overlay Impact-style
/// captions on every frame (delays + disposal preserved), re-encode. Falls
/// back to the static PNG path in the frontend when this fails.
#[tauri::command]
async fn save_meme_captioned_gif(
    app: tauri::AppHandle,
    dir: String,
    stem: String,
    cache_key: String,
    source_url: String,
    top: String,
    bottom: String,
) -> Result<Option<SavedMeme>, String> {
    let (ext, bytes) = resolve_meme_source_bytes(&app, &cache_key, &source_url).await?;
    if ext != "gif" {
        return Err("source is not a GIF".into());
    }
    if top.trim().is_empty() && bottom.trim().is_empty() {
        return Err("no caption text".into());
    }
    let font_bytes = load_meme_font()?;
    let stem = sanitize_meme_stem(&stem)?;
    // Resolve the destination (dialog) BEFORE the heavy CPU work so a
    // cancellation returns fast instead of waiting out the encode.
    let dest = match resolve_meme_dest(&dir, &format!("{stem}.gif"), "Save meme GIF", "GIF", &["gif"]).await? {
        Some(d) => d,
        None => return Ok(None),
    };
    // Decode + caption + re-encode is pure CPU (up to 500 frames of text
    // rasterization + quantization): keep it off the async runtime workers.
    let top_owned = top.clone();
    let bottom_owned = bottom.clone();
    let gif_bytes = tokio::task::spawn_blocking(move || {
        let font = ab_glyph::FontRef::try_from_slice(&font_bytes)
            .map_err(|e| format!("caption font: {e}"))?;
        caption_gif_frames(&bytes, &top_owned, &bottom_owned, &font)
    })
    .await
    .map_err(|e| format!("GIF worker: {e}"))??;
    fs::write(&dest, &gif_bytes).map_err(|e| format!("Failed to save GIF: {e}"))?;
    Ok(Some(SavedMeme {
        path: dest.to_string_lossy().into_owned(),
        ext: "gif".into(),
    }))
}

const KEYRING_SERVICE: &str = "lost-board";
const DEEPL_KEY_USER: &str = "deepl_api_key";

/// Store the DeepL API key in the OS secret store (never in config/git).
#[tauri::command]
fn set_deepl_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, DEEPL_KEY_USER)
        .map_err(|e| format!("secret store error: {e}"))?;
    entry
        .set_password(&key)
        .map_err(|e| format!("failed to store DeepL key: {e}"))
}

/// Whether a DeepL API key is currently stored (does not return the key).
#[tauri::command]
fn deepl_key_status() -> bool {
    keyring::Entry::new(KEYRING_SERVICE, DEEPL_KEY_USER)
        .and_then(|e| e.get_password())
        .map(|p| !p.is_empty())
        .unwrap_or(false)
}

/// Remove the stored DeepL API key.
#[tauri::command]
fn clear_deepl_key() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, DEEPL_KEY_USER)
        .map_err(|e| format!("secret store error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Deleting a non-existent entry is fine.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to clear DeepL key: {e}")),
    }
}

#[derive(serde::Deserialize)]
struct DeepLTranslation {
    text: String,
}

#[derive(serde::Deserialize)]
struct DeepLResponse {
    translations: Vec<DeepLTranslation>,
}

/// Translate text with DeepL. `source_lang` may be empty for auto-detect.
/// Uses the free endpoint for keys ending in ":fx", otherwise the pro endpoint.
#[tauri::command]
async fn deepl_translate(
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    let key = keyring::Entry::new(KEYRING_SERVICE, DEEPL_KEY_USER)
        .and_then(|e| e.get_password())
        .map_err(|_| "No DeepL API key configured".to_string())?;
    if key.is_empty() {
        return Err("No DeepL API key configured".into());
    }

    let endpoint = if key.trim_end().ends_with(":fx") {
        "https://api-free.deepl.com/v2/translate"
    } else {
        "https://api.deepl.com/v2/translate"
    };

    let mut form: Vec<(&str, String)> = vec![
        ("text", text),
        ("target_lang", target_lang.to_uppercase()),
    ];
    if !source_lang.is_empty() {
        form.push(("source_lang", source_lang.to_uppercase()));
    }

    let resp = reqwest::Client::new()
        .post(endpoint)
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .form(&form)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("DeepL request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("DeepL read failed: {e}"))?;
    if !status.is_success() {
        return Err(format!("DeepL HTTP {status}: {body}"));
    }

    let parsed: DeepLResponse =
        serde_json::from_str(&body).map_err(|e| format!("DeepL parse failed: {e}"))?;
    parsed
        .translations
        .into_iter()
        .next()
        .map(|t| t.text)
        .ok_or_else(|| "DeepL returned no translation".into())
}

// ---------------------------------------------------------------------------
// Spotify. OAuth 2.0 Authorization Code + PKCE via a localhost callback server.
// Client id, access token, and refresh token are stored in the OS secret store.
// The tile acts as a remote control for the installed Spotify app / a Connect
// device (the API does not stream audio).
// ---------------------------------------------------------------------------
const SPOTIFY_CLIENT_ID: &str = "spotify_client_id";
const SPOTIFY_ACCESS: &str = "spotify_access_token";
const SPOTIFY_REFRESH: &str = "spotify_refresh_token";
const SPOTIFY_EXPIRES: &str = "spotify_token_expires_at";

// PKCE verifier is kept in memory between the authorize step and the callback.
use std::sync::Mutex as StdMutex; // avoid clash with tauri::Manager
static SPOTIFY_VERIFIER: StdMutex<Option<String>> = StdMutex::new(None);

fn spot_key(user: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, user).map_err(|e| format!("secret store error: {e}"))
}
fn spot_get(user: &str) -> Result<String, String> {
    spot_key(user)
        .and_then(|e| e.get_password().map_err(|er| format!("{er}")))
        .map(|s| s.to_string())
}
fn spot_set(user: &str, val: &str) -> Result<(), String> {
    let e = spot_key(user)?;
    e.set_password(val).map_err(|er| format!("failed to store: {er}"))
}
fn base64url_encode(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}
fn random_verifier() -> String {
    use rand::Rng;
    let bytes: Vec<u8> = (0..64).map(|_| rand::thread_rng().r#gen()).collect();
    base64url_encode(&bytes)
}
fn pkce_challenge(verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    base64url_encode(&Sha256::digest(verifier.as_bytes()))
}

/// Store the Spotify client id in the secret store.
#[tauri::command]
fn set_spotify_client_id(id: String) -> Result<(), String> {
    spot_set(SPOTIFY_CLIENT_ID, id.trim())
}

/// Whether a Spotify client id is stored and a refresh token exists.
#[tauri::command]
fn spotify_connected() -> bool {
    spot_get(SPOTIFY_CLIENT_ID).is_ok() && spot_get(SPOTIFY_REFRESH).is_ok()
}

/// Begin Spotify authorization: open the browser to the PKCE authorize URL and
/// start a localhost callback server. Returns a URL to open.
#[tauri::command]
async fn spotify_begin() -> Result<String, String> {
    let client_id = spot_get(SPOTIFY_CLIENT_ID).map_err(|_| "No Spotify client id set".to_string())?;
    let verifier = random_verifier();
    *SPOTIFY_VERIFIER.lock().unwrap() = Some(verifier.clone());
    let challenge = pkce_challenge(&verifier);
    let redirect = "http://127.0.0.1:3937/callback";
    let scope = "user-read-playback-state user-modify-playback-state user-read-currently-playing";
    let url = format!(
        "https://accounts.spotify.com/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256",
        client_id, redirect, scope, challenge
    );
    Ok(url)
}

/// Exchange the authorization code (captured on the localhost callback) for
/// tokens and store them. Call after the user returns from the browser.
#[tauri::command]
async fn spotify_capture() -> Result<(), String> {
    let verifier = SPOTIFY_VERIFIER.lock().unwrap().take();
    if verifier.is_none() {
        return Err("no pending authorization".into());
    }
    let verifier = verifier.unwrap();
    let client_id = spot_get(SPOTIFY_CLIENT_ID).map_err(|_| "No Spotify client id set".to_string())?;
    let redirect = "http://127.0.0.1:3937/callback";
    let server = tiny_http::Server::http("127.0.0.1:3937")
        .map_err(|e| format!("callback server: {e}"))?;
    let request = server
        .recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|_| "timed out waiting for Spotify callback".to_string())?
        .ok_or("timed out waiting for Spotify callback".to_string())?;
    let code = {
        let url = request.url().to_string();
        let _ = request.respond(tiny_http::Response::from_string("You can close this window."));
        url.split("code=").nth(1).and_then(|s| s.split('&').next()).map(|s| s.to_string())
            .ok_or("no code in callback".to_string())?
    };
    let params = [
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", redirect),
        ("client_id", &client_id),
        ("code_verifier", &verifier),
    ];
    let resp = reqwest::Client::new()
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("token request: {e}"))?;
    let body = resp.text().await.map_err(|e| format!("token read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("token parse: {e}, body: {body}"))?;
    let access = v
        .get("access_token")
        .and_then(|x| x.as_str())
        .ok_or("no access_token in response")?
        .to_string();
    let refresh = v
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    if refresh.is_empty() {
        return Err("no refresh_token returned (PKCE should provide one)".into());
    }
    spot_set(SPOTIFY_ACCESS, &access)?;
    spot_set(SPOTIFY_REFRESH, &refresh)?;
    // Store when the access token expires (refresh proactively after that).
    let expires_in = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600).min(3600);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() + expires_in)
        .unwrap_or(0);
    spot_set(SPOTIFY_EXPIRES, &expires_at.to_string())?;
    Ok(())
}

/// Get a valid access token, refreshing via refresh_token when expired/missing.
async fn spotify_access_token() -> Result<String, String> {
    // Valid (unexpired) token already stored? Use it.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let valid = spot_get(SPOTIFY_EXPIRES)
        .ok()
        .and_then(|e| e.parse::<u64>().ok())
        .map(|exp| now + 60 < exp) // leave a 60s safety margin
        .unwrap_or(false);
    if valid {
        if let Ok(t) = spot_get(SPOTIFY_ACCESS) {
            return Ok(t);
        }
    }

    let refresh = spot_get(SPOTIFY_REFRESH).map_err(|_| "not connected".to_string())?;
    let client_id = spot_get(SPOTIFY_CLIENT_ID).map_err(|_| "no client id".to_string())?;
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", &refresh),
        ("client_id", &client_id),
    ];
    let resp = reqwest::Client::new()
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("refresh request: {e}"))?;
    let body = resp.text().await.map_err(|e| format!("refresh read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("refresh parse: {e}, body: {body}"))?;
    let access = v
        .get("access_token")
        .and_then(|x| x.as_str())
        .ok_or_else(|| format!("refresh failed: {body}"))?
        .to_string();
    spot_set(SPOTIFY_ACCESS, &access)?;
    let expires_in = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600).min(3600);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() + expires_in)
        .unwrap_or(0);
    spot_set(SPOTIFY_EXPIRES, &expires_at.to_string())?;
    Ok(access)
}

#[derive(serde::Serialize)]
struct SpotifyTrack {
    title: String,
    artist: String,
    album: String,
    art: String,
    playing: bool,
    progress_ms: u64,
    duration_ms: u64,
    shuffle: bool,
    smart_shuffle: bool,
    repeat: String,
    context_uri: String,
    context_type: String,
}

/// Fetch the current playback state (track + shuffle/repeat flags).
/// Uses GET /me/player (a superset of currently-playing) so one call also
/// yields shuffle_state, smart_shuffle and repeat_state.
#[tauri::command]
async fn spotify_now_playing() -> Result<Option<SpotifyTrack>, String> {
    let token = spotify_access_token().await?;
    let resp = reqwest::Client::new()
        .get("https://api.spotify.com/v1/me/player")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("now-playing request: {e}"))?;
    if resp.status() == reqwest::StatusCode::NO_CONTENT {
        return Ok(None);
    }
    let body = resp.text().await.map_err(|e| format!("read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("parse: {e}, body: {body}"))?;
    let item = match v.get("item") {
        Some(it) if !it.is_null() => it,
        _ => return Ok(None),
    };
    let title = item.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let artist = item
        .get("artists")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|x| x.get("name"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let album = item.get("album").and_then(|x| x.get("name")).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let art = item
        .get("album")
        .and_then(|x| x.get("images"))
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .and_then(|x| x.get("url"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let playing = v.get("is_playing").and_then(|x| x.as_bool()).unwrap_or(false);
    let progress_ms = v.get("progress_ms").and_then(|x| x.as_u64()).unwrap_or(0);
    let duration_ms = item.get("duration_ms").and_then(|x| x.as_u64()).unwrap_or(0);
    let shuffle = v.get("shuffle_state").and_then(|x| x.as_bool()).unwrap_or(false);
    let smart_shuffle = v.get("smart_shuffle").and_then(|x| x.as_bool()).unwrap_or(false);
    let repeat = v
        .get("repeat_state")
        .and_then(|x| x.as_str())
        .unwrap_or("off")
        .to_string();
    let context_uri = v
        .get("context")
        .and_then(|c| c.get("uri"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let context_type = v
        .get("context")
        .and_then(|c| c.get("type"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    Ok(Some(SpotifyTrack {
        title,
        artist,
        album,
        art,
        playing,
        progress_ms,
        duration_ms,
        shuffle,
        smart_shuffle,
        repeat,
        context_uri,
        context_type,
    }))
}

/// Toggle regular shuffle on the active device.
/// (Smart Shuffle cannot be enabled via the Web API — it is read-only here
/// and surfaced through `smart_shuffle` in now-playing.)
#[tauri::command]
async fn spotify_shuffle(state: bool) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let url = format!("https://api.spotify.com/v1/me/player/shuffle?state={state}");
    let resp = reqwest::Client::new()
        .put(&url)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("shuffle request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Set repeat mode on the active device: off | context | track.
#[tauri::command]
async fn spotify_repeat(state: String) -> Result<(), String> {
    if !matches!(state.as_str(), "off" | "context" | "track") {
        return Err("repeat state must be off, context or track".to_string());
    }
    let token = spotify_access_token().await?;
    let url = format!("https://api.spotify.com/v1/me/player/repeat?state={state}");
    let resp = reqwest::Client::new()
        .put(&url)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("repeat request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Play (or pause) on the active device.
#[tauri::command]
async fn spotify_play(play: bool) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let url = if play { "https://api.spotify.com/v1/me/player/play" } else { "https://api.spotify.com/v1/me/player/pause" };
    let resp = reqwest::Client::new()
        .put(url)
        .bearer_auth(&token)
        .header("Content-Length", "0") // 411 without it (body-less PUT/POST)
        .send()
        .await
        .map_err(|e| format!("play request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Jump directly to a track within its context (album/playlist) in one call.
/// Uses PUT /me/player/play with context_uri + offset.uri — instant, no
/// skip-loop, preserves context and repeat mode. Fails when the track is not
/// part of the context (callers fall back to paced skips).
#[tauri::command]
async fn spotify_jump(context_uri: String, track_uri: String) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let payload = serde_json::json!({
        "context_uri": context_uri,
        "offset": { "uri": track_uri },
    });
    let resp = reqwest::Client::new()
        .put("https://api.spotify.com/v1/me/player/play")
        .bearer_auth(&token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("jump request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Skip to next / previous.
#[tauri::command]
async fn spotify_skip(next: bool) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let url = if next { "https://api.spotify.com/v1/me/player/next" } else { "https://api.spotify.com/v1/me/player/previous" };
    let resp = reqwest::Client::new()
        .post(url)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("skip request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Seek to a position (ms) on the active device. Used by the tile's
/// click/drag on the progress bar.
#[tauri::command]
async fn spotify_seek(position_ms: u64) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let url = format!("https://api.spotify.com/v1/me/player/seek?position_ms={position_ms}");
    let resp = reqwest::Client::new()
        .put(&url)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("seek request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

/// Set volume on the active device (0-100).
#[tauri::command]
async fn spotify_volume(percent: u8) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let p = percent.min(100);
    let url = format!("https://api.spotify.com/v1/me/player/volume?volume_percent={p}");
    let resp = reqwest::Client::new()
        .put(&url)
        .bearer_auth(&token)
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("volume request: {e}"))?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Spotify HTTP {status}: {body}"));
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct SpotifyQueueItem {
    title: String,
    artist: String,
    uri: String,
}

/// Fetch the current playback queue (the next-up tracks).
#[tauri::command]
async fn spotify_queue() -> Result<Vec<SpotifyQueueItem>, String> {
    let token = spotify_access_token().await?;
    let resp = reqwest::Client::new()
        .get("https://api.spotify.com/v1/me/player/queue")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("queue request: {e}"))?;
    let body = resp.text().await.map_err(|e| format!("queue read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("queue parse: {e}, body: {body}"))?;
    Ok(v.get("queue")
        .and_then(|q| q.as_array())
        .map(|arr| {
            arr.iter()
                .map(|it| SpotifyQueueItem {
                    title: it.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    artist: it
                        .get("artists")
                        .and_then(|a| a.as_array())
                        .and_then(|a| a.first())
                        .and_then(|x| x.get("name"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    uri: it.get("uri").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default())
}

/// A process-wide `System` kept alive so CPU usage (a delta between samples)
/// accumulates across calls instead of resetting to 0 on every fresh instance.
/// Memory is only measured if `.with_ram()` is set — a bare `MemoryRefreshKind::new()` is an *empty* set and yields 0 for both used and total RAM.
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("lost-board")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        let _ = app.get_webview_window("main").map(|w| {
                            let _ = w.show();
                            let _ = w.set_focus();
                        });
                    }
                    "hide" => {
                        let _ = app.get_webview_window("main").map(|w| {
                            let _ = w.hide();
                        });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            // A missing tray must never prevent the app itself from starting —
            // log it and continue without one.
            if let Err(e) = tray.build(app) {
                eprintln!("lost-board: failed to create tray icon: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            export_config,
            import_config,
            set_autostart,
            autostart_enabled,
            read_vocab_cards,
            vocab_categories,
            vocab_due_card,
            vocab_due_batch,
            vocab_practice_batch,
            vocab_record_review,
            vocab_due_count,
            vocab_reset_srs,
            vocab_set_srs,
            vocab_srs_enabled,
            vocab_srs_stats,
            vocab_category_stats,
            set_popup_theme,
            get_popup_theme,
            vocab_popup_config,
            open_vocab_popup,
            close_vocab_popup,
            snooze_vocab_popup,
            clear_vocab_snooze,
            vocab_popup_state,
            vocab_tick,
            pick_folder,
            pick_solution,
            pick_icon,
            classify_path,
            open_folder,
            open_solution,
            open_url,
            fetch_rss,
            cache_favicon,
            fetch_image_cached,
            import_image_file,
            load_cached_image,
            save_meme_png,
            save_meme_source,
            save_meme_captioned_gif,
            set_deepl_key,
            deepl_key_status,
            clear_deepl_key,
            deepl_translate,
            load_tile_icon,
            pick_image,
            load_frame_image,
            scan_project_root,
            set_spotify_client_id,
            spotify_connected,
            spotify_begin,
            spotify_capture,
            spotify_now_playing,
            spotify_play,
            spotify_skip,
            spotify_jump,
            spotify_shuffle,
            spotify_repeat,
            spotify_volume,
            spotify_seek,
            spotify_queue,
            get_system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running lost-board");
}

const STATE_FILE_NAME: &str = "dashboard-state.json";

// ---------------------------------------------------------------------------
// Background mode: launch-on-login via tauri-plugin-autostart, wrapped in our
// own commands so the frontend never touches plugin commands directly.
// ---------------------------------------------------------------------------

/// Enable or disable launch-on-login for this app.
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable()
    } else {
        m.disable()
    }
    .map_err(|e| format!("autostart: {e}"))
}

/// Whether launch-on-login is currently enabled.
#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart: {e}"))
}

// ---------------------------------------------------------------------------
// Vocab flashcards: bundled CSV word list + drill popup window management.
// The popup is created Rust-side (no frontend window-API needed); the main
// window drives it through a periodic vocab_tick() call. Transient popup
// state (last fire time) lives in process statics; snooze is persisted in
// the state file under `vocab.snoozeUntil` so restarts stay snoozed.
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone)]
struct VocabCard {
    id: String,
    en: String,
    es: String,
    de: String,
    cats: Vec<String>,
}

#[derive(serde::Serialize, Clone, Default)]
struct VocabPopupConfig {
    lang: String,
    cats: Vec<String>,
    /// Max graded cards per popup (0 = all due). Drives the session loop.
    session_size: usize,
    /// Surface high-lapse due cards first.
    struggling_first: bool,
    /// Practice mode: show not-due struggling cards, never graded.
    practice: bool,
    /// Cards per practice session (0 = all). Separate from the review cap.
    practice_size: usize,
}

#[derive(serde::Serialize)]
struct VocabCategory {
    name: String,
    count: usize,
}

static VOCAB: std::sync::OnceLock<Vec<VocabCard>> = std::sync::OnceLock::new();
static VOCAB_POPUP: StdMutex<VocabPopupConfig> = StdMutex::new(VocabPopupConfig {
    lang: String::new(),
    cats: Vec::new(),
    session_size: 1,
    struggling_first: true,
    practice: false,
    practice_size: 10,
});
static VOCAB_LAST_POPUP_AT: StdMutex<u64> = StdMutex::new(0);

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Normalize a raw `categories` CSV field into clean category names: split on
/// commas, strip stray brackets/quotes/whitespace baked into the snapshot
/// (`["Adjectives"]`, `"Beginner"`), drop empties, dedupe preserving order.
fn normalize_vocab_cats(raw: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tok in raw.split(',') {
        let clean = tok
            .trim()
            .trim_matches(|c| c == '[' || c == ']' || c == '"' || c == '\'')
            .trim()
            .to_string();
        if !clean.is_empty() && !out.iter().any(|c| c == &clean) {
            out.push(clean);
        }
    }
    out
}

fn load_vocab_cards(app: &tauri::AppHandle) -> Vec<VocabCard> {
    use tauri::path::BaseDirectory;
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(p) = app.path().resolve("resources/cards.csv", BaseDirectory::Resource) {
        candidates.push(p);
    }
    candidates.push(std::path::PathBuf::from("src-tauri/resources/cards.csv"));
    candidates.push(std::path::PathBuf::from("resources/cards.csv"));
    let path = candidates.into_iter().find(|p| p.is_file());
    let path = match path {
        Some(p) => p,
        None => {
            eprintln!("lost-board: cards.csv not found in any candidate location");
            return Vec::new();
        }
    };
    let mut rdr = match csv::Reader::from_path(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("lost-board: failed to open {}: {e}", path.display());
            return Vec::new();
        }
    };
    // Columns: id,categories,studyCount,en_US,es_ES,de_DE. Categories contain
    // quoted commas, so index into parsed records (never split lines by hand).
    // Header row is consumed by the csv reader; skip short/bad rows.
    rdr.records()
        .filter_map(|r| r.ok())
        .filter_map(|rec| {
            if rec.len() < 6 {
                return None;
            }
            let (id, en, es, de) = (
                rec.get(0)?.trim(),
                rec.get(3)?.trim(),
                rec.get(4)?.trim(),
                rec.get(5)?.trim(),
            );
            // All three languages are required: an empty translation would
            // auto-match an empty input and close the drill instantly.
            if id.is_empty() || en.is_empty() || es.is_empty() || de.is_empty() {
                return None;
            }
            Some(VocabCard {
                id: id.to_string(),
                en: en.to_string(),
                es: es.to_string(),
                de: de.to_string(),
                cats: normalize_vocab_cats(rec.get(1).unwrap_or("")),
            })
        })
        .collect()
}

/// Return `count` random cards (shuffled each call; tile and popup draw
/// independently by design — different words in each is variety, not a bug).
/// A non-empty `categories` filter restricts to cards in ANY of them (the
/// drill popup's topic filter); empty means all cards (tile rotation).
#[tauri::command]
fn read_vocab_cards(
    app: tauri::AppHandle,
    count: usize,
    categories: Vec<String>,
) -> Result<Vec<VocabCard>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    if all.is_empty() {
        return Err("no vocabulary cards available".into());
    }
    use rand::seq::SliceRandom;
    let mut rng = rand::thread_rng();
    let mut idx: Vec<usize> = (0..all.len())
        .filter(|&i| {
            categories.is_empty() || all[i].cats.iter().any(|c| categories.contains(c))
        })
        .collect();
    if idx.is_empty() {
        return Err("no cards match the selected categories".into());
    }
    idx.shuffle(&mut rng);
    let n = count.max(1).min(idx.len());
    Ok(idx
        .into_iter()
        .take(n)
        .map(|i| all[i].clone())
        .collect())
}

/// Normalized category list with per-category card counts, for the settings
/// checkbox UI. Computed from the same normalized values stored per card.
#[tauri::command]
fn vocab_categories(app: tauri::AppHandle) -> Result<Vec<VocabCategory>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let mut counts: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for card in all.iter() {
        for c in card.cats.iter() {
            *counts.entry(c.clone()).or_insert(0) += 1;
        }
    }
    Ok(counts
        .into_iter()
        .map(|(name, count)| VocabCategory { name, count })
        .collect())
}

fn read_vocab_section(app: &tauri::AppHandle) -> serde_json::Map<String, serde_json::Value> {
    let path = match state_file_path(app) {
        Ok(p) => p,
        Err(_) => return serde_json::Map::new(),
    };
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return serde_json::Map::new(),
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("vocab").cloned())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn write_vocab_keys(app: &tauri::AppHandle, keys: &[(&str, serde_json::Value)]) -> Result<(), String> {
    let path = state_file_path(app)?;
    let text = fs::read_to_string(&path).unwrap_or_else(|_| "{}".into());
    let mut v: serde_json::Value =
        serde_json::from_str(&text).unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
    let obj = v.as_object_mut().ok_or("state root is not an object")?;
    let vocab = obj
        .entry("vocab")
        .or_insert(serde_json::Value::Object(serde_json::Map::new()));
    let vobj = vocab.as_object_mut().ok_or("vocab is not an object")?;
    for (k, val) in keys {
        vobj.insert((*k).to_string(), val.clone());
    }
    fs::write(&path, serde_json::to_string(&v).map_err(|e| format!("serialize: {e}"))?)
        .map_err(|e| format!("Failed to save vocab state: {e}"))
}

// ---------------------------------------------------------------------------
// Spaced repetition (SM-2) for the vocab drill. Per-card state lives in the
// state file under `vocab.srs` (keyed by card id) so both the drill window and
// the tile read one source of truth. Design follows the spaced-repetition
// methodology: expanding intervals, honest grading (reveal = fail), and an
// interval cap to guard SM-2's "interval explosion".
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Default)]
struct SrsEntry {
    #[serde(default)]
    due: u64, // unix seconds; 0 = never reviewed (due immediately)
    #[serde(default)]
    ivl: i64, // interval in days
    #[serde(default)]
    ease: f64, // 0 = unset (defaults to 2.5)
    #[serde(default)]
    reps: u32,
    #[serde(default)]
    lapses: u32,
}

#[derive(serde::Serialize)]
struct DueCard {
    card: VocabCard,
    due: bool,
}

fn srs_map(app: &tauri::AppHandle) -> serde_json::Map<String, serde_json::Value> {
    read_vocab_section(app)
        .get("srs")
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

fn srs_enabled(app: &tauri::AppHandle) -> bool {
    read_vocab_section(app)
        .get("srsEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn get_srs(map: &serde_json::Map<String, serde_json::Value>, id: &str) -> SrsEntry {
    map.get(id)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

/// Deserialize the whole SRS map once (avoids a JSON parse per card in the
/// due/stats scans).
fn parse_srs(map: &serde_json::Map<String, serde_json::Value>) -> std::collections::HashMap<String, SrsEntry> {
    map.iter()
        .filter_map(|(k, v)| serde_json::from_value::<SrsEntry>(v.clone()).ok().map(|e| (k.clone(), e)))
        .collect()
}

fn write_srs_entry(app: &tauri::AppHandle, id: &str, entry: &SrsEntry) -> Result<(), String> {
    let mut map = srs_map(app);
    map.insert(
        id.to_string(),
        serde_json::to_value(entry).map_err(|e| format!("serialize srs: {e}"))?,
    );
    write_vocab_keys(app, &[("srs", serde_json::Value::Object(map))])
}

/// Canonical SM-2: quality 0–5; <3 fails (relearn soon), else expanding interval
/// by an ease factor. Capped at 730 days so ease never explodes the interval.
fn sm2_next(mut e: SrsEntry, quality: u32, now: u64) -> SrsEntry {
    let q = quality.min(5);
    if e.ease < 1.3 {
        e.ease = 2.5;
    }
    if q < 3 {
        e.lapses += 1;
        e.reps = 0;
        e.ivl = 0;
        e.ease = (e.ease - 0.2).max(1.3);
        e.due = now + 10 * 60; // relearn in ~10 minutes
    } else {
        e.reps += 1;
        e.ivl = if e.reps == 1 {
            1
        } else if e.reps == 2 {
            6
        } else {
            ((e.ivl.max(1) as f64) * e.ease).round() as i64
        };
        e.ivl = e.ivl.min(730);
        e.ease = (e.ease + (0.1 - (5 - q) as f64 * (0.08 + (5 - q) as f64 * 0.02))).clamp(1.3, 3.0);
        e.due = now + (e.ivl as u64) * 86_400;
    }
    e
}

fn vocab_matching<'a>(all: &'a [VocabCard], categories: &[String]) -> Vec<&'a VocabCard> {
    all.iter()
        .filter(|c| categories.is_empty() || c.cats.iter().any(|x| categories.contains(x)))
        .collect()
}

/// One card for the drill: a due card (graded) when any are due, otherwise a
/// random card flagged `due:false` for passive exposure (never graded — the
/// methodology says don't pre-empt the schedule).
#[tauri::command]
fn vocab_due_card(app: tauri::AppHandle, categories: Vec<String>) -> Result<Option<DueCard>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let matching = vocab_matching(all, &categories);
    if matching.is_empty() {
        return Ok(None);
    }
    use rand::seq::SliceRandom;
    let now = now_secs();
    if srs_enabled(&app) {
        let typed = parse_srs(&srs_map(&app));
        let mut due: Vec<&VocabCard> = matching
            .iter()
            .copied()
            .filter(|c| typed.get(&c.id).map(|e| e.due).unwrap_or(0) <= now)
            .collect();
        if !due.is_empty() {
            due.shuffle(&mut rand::thread_rng());
            return Ok(Some(DueCard { card: due[0].clone(), due: true }));
        }
    }
    let mut m = matching.clone();
    m.shuffle(&mut rand::thread_rng());
    Ok(Some(DueCard { card: m[0].clone(), due: false }))
}

/// Pick up to `limit` distinct due cards (0 = all), shuffled; when
/// `struggling_first`, high-lapse cards lead. Falls back to one not-due exposure
/// card when nothing is due (parity with the single-card behavior). Pure, so it
/// can be unit-tested.
fn pick_due_batch<'a>(
    matching: &[&'a VocabCard],
    typed: &std::collections::HashMap<String, SrsEntry>,
    now: u64,
    limit: usize,
    struggling_first: bool,
) -> Vec<DueCard> {
    use rand::seq::SliceRandom;
    let mut due: Vec<&VocabCard> = matching
        .iter()
        .copied()
        .filter(|c| typed.get(&c.id).map(|e| e.due).unwrap_or(0) <= now)
        .collect();
    due.shuffle(&mut rand::thread_rng());
    if struggling_first {
        let (mut s, r): (Vec<&VocabCard>, Vec<&VocabCard>) =
            due.into_iter().partition(|c| is_struggling(typed.get(&c.id)));
        s.extend(r);
        due = s;
    }
    let take = if limit == 0 { due.len() } else { limit.min(due.len()) };
    let out: Vec<DueCard> = due
        .into_iter()
        .take(take)
        .map(|c| DueCard { card: c.clone(), due: true })
        .collect();
    if out.is_empty() {
        if let Some(c) = matching.choose(&mut rand::thread_rng()) {
            return vec![DueCard { card: (*c).clone(), due: false }];
        }
    }
    out
}

/// A session's worth of due cards for the drill popup. `limit` = cards per
/// session (0 = all due). Only due cards come back `due:true` (graded); a lone
/// exposure card comes back `due:false` when nothing is scheduled.
#[tauri::command]
fn vocab_due_batch(
    app: tauri::AppHandle,
    categories: Vec<String>,
    limit: usize,
    prefer_struggling: bool,
) -> Result<Vec<DueCard>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let matching = vocab_matching(all, &categories);
    if !srs_enabled(&app) {
        use rand::seq::SliceRandom;
        return Ok(matching
            .choose(&mut rand::thread_rng())
            .map(|c| vec![DueCard { card: (*c).clone(), due: false }])
            .unwrap_or_default());
    }
    let typed = parse_srs(&srs_map(&app));
    Ok(pick_due_batch(&matching, &typed, now_secs(), limit, prefer_struggling))
}

/// Extra practice pool: matching cards that are NOT due but that you keep
/// failing. Pure, for testing.
fn pick_practice_batch<'a>(
    matching: &[&'a VocabCard],
    typed: &std::collections::HashMap<String, SrsEntry>,
    now: u64,
    limit: usize,
) -> Vec<&'a VocabCard> {
    use rand::seq::SliceRandom;
    let mut pool: Vec<&VocabCard> = matching
        .iter()
        .copied()
        .filter(|c| {
            let e = typed.get(&c.id);
            e.map(|e| e.due > now).unwrap_or(false) && is_struggling(e)
        })
        .collect();
    pool.shuffle(&mut rand::thread_rng());
    let take = if limit == 0 { pool.len() } else { limit.min(pool.len()) };
    pool.truncate(take);
    pool
}

/// Extra practice: matching cards that are NOT due but that you keep failing
/// (high lapses). Never graded — the popup must not call vocab_record_review,
/// so these reps leave the schedule and mastery untouched.
#[tauri::command]
fn vocab_practice_batch(
    app: tauri::AppHandle,
    categories: Vec<String>,
    limit: usize,
) -> Result<Vec<VocabCard>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let matching = vocab_matching(all, &categories);
    let typed = parse_srs(&srs_map(&app));
    Ok(pick_practice_batch(&matching, &typed, now_secs(), limit)
        .into_iter()
        .cloned()
        .collect())
}

/// Record a graded review. `grade` is again | hard | good | easy.
#[tauri::command]
fn vocab_record_review(app: tauri::AppHandle, card_id: String, grade: String) -> Result<(), String> {
    let q = match grade.as_str() {
        "again" => 2,
        "hard" => 3,
        "good" => 4,
        "easy" => 5,
        _ => 4,
    };
    let map = srs_map(&app);
    let next = sm2_next(get_srs(&map, &card_id), q, now_secs());
    write_srs_entry(&app, &card_id, &next)
}

/// How many cards are due right now (for the tile badge). 0 when SRS is off.
#[tauri::command]
fn vocab_due_count(app: tauri::AppHandle, categories: Vec<String>) -> Result<usize, String> {
    if !srs_enabled(&app) {
        return Ok(0);
    }
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let now = now_secs();
    let typed = parse_srs(&srs_map(&app));
    Ok(vocab_matching(all, &categories)
        .iter()
        .filter(|c| typed.get(&c.id).map(|e| e.due).unwrap_or(0) <= now)
        .count())
}

/// Clear all review history.
#[tauri::command]
fn vocab_reset_srs(app: tauri::AppHandle) -> Result<(), String> {
    write_vocab_keys(&app, &[("srs", serde_json::Value::Object(serde_json::Map::new()))])
}

/// Toggle spaced repetition on/off.
#[tauri::command]
fn vocab_set_srs(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    write_vocab_keys(&app, &[("srsEnabled", serde_json::Value::from(enabled))])
}

/// Whether spaced repetition is currently enabled.
#[tauri::command]
fn vocab_srs_enabled(app: tauri::AppHandle) -> bool {
    srs_enabled(&app)
}

/// Mastery is read back from the card's own SM-2 state (the interval only grows
/// with repeated success and collapses on a fail), so it reflects durability,
/// not just "was shown". Thresholds follow the common SRS convention.
#[derive(PartialEq)]
enum Mastery {
    New,
    Learning,
    Young,
    Mature,
}

const MATURE_DAYS: i64 = 21; // interval >= 21 days => scheduler trusts ~3+ weeks recall
const STRUGGLE_LAPSES: u32 = 3; // failed this many times => a "leech"

fn mastery_of(e: Option<&SrsEntry>) -> Mastery {
    match e {
        None => Mastery::New,
        Some(e) if e.reps == 0 => Mastery::Learning,
        Some(e) if e.ivl >= MATURE_DAYS => Mastery::Mature,
        Some(_) => Mastery::Young,
    }
}

/// A card you keep forgetting. Same threshold as the "struggling" stat so the
/// pile and the number on screen agree.
fn is_struggling(e: Option<&SrsEntry>) -> bool {
    e.map(|e| e.lapses >= STRUGGLE_LAPSES).unwrap_or(false)
}

#[derive(serde::Serialize)]
struct SrsStats {
    total: usize,
    due: usize,
    seen: usize,
    new: usize,
    learning: usize,
    young: usize,
    mature: usize,
    struggling: usize,
}

/// Review progress for the settings tab: totals, due now, and mastery buckets.
#[tauri::command]
fn vocab_srs_stats(app: tauri::AppHandle, categories: Vec<String>) -> Result<SrsStats, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let matching = vocab_matching(all, &categories);
    let now = now_secs();
    let typed = parse_srs(&srs_map(&app));
    let mut s = SrsStats {
        total: matching.len(),
        due: 0,
        seen: 0,
        new: 0,
        learning: 0,
        young: 0,
        mature: 0,
        struggling: 0,
    };
    for c in &matching {
        let e = typed.get(&c.id);
        if e.map(|e| e.due <= now).unwrap_or(true) {
            s.due += 1;
        }
        if let Some(e) = e {
            s.seen += 1;
            if e.lapses >= STRUGGLE_LAPSES {
                s.struggling += 1;
            }
        }
        match mastery_of(e) {
            Mastery::New => s.new += 1,
            Mastery::Learning => s.learning += 1,
            Mastery::Young => s.young += 1,
            Mastery::Mature => s.mature += 1,
        }
    }
    Ok(s)
}

#[derive(serde::Serialize)]
struct CategoryStat {
    category: String,
    total: usize,
    due: usize,
    new: usize,
    learning: usize,
    young: usize,
    mature: usize,
}

/// Synthetic bucket so cards with no category still reconcile in the table.
const UNCATEGORIZED: &str = "(uncategorized)";

/// Category labels for a card; uncategorized cards get the synthetic bucket so
/// they can't silently drop out of the per-category totals.
fn card_categories(c: &VocabCard) -> Vec<&str> {
    if c.cats.is_empty() {
        vec![UNCATEGORIZED]
    } else {
        c.cats.iter().map(|s| s.as_str()).collect()
    }
}

/// Per-category mastery breakdown for the settings tab, so you can see which
/// categories you've got and which are still stuck in learning. Scoped to the
/// same `categories` filter as the mastery bar (empty = all). Sorted by size.
#[tauri::command]
fn vocab_category_stats(app: tauri::AppHandle, categories: Vec<String>) -> Result<Vec<CategoryStat>, String> {
    let all = VOCAB.get_or_init(|| load_vocab_cards(&app));
    let typed = parse_srs(&srs_map(&app));
    let now = now_secs();
    let mut map: std::collections::HashMap<String, CategoryStat> = std::collections::HashMap::new();
    for c in vocab_matching(all, &categories) {
        let e = typed.get(&c.id);
        let is_due = e.map(|e| e.due <= now).unwrap_or(true);
        let bucket = mastery_of(e);
        for cat in card_categories(c) {
            let s = map.entry(cat.to_string()).or_insert_with(|| CategoryStat {
                category: cat.to_string(),
                total: 0,
                due: 0,
                new: 0,
                learning: 0,
                young: 0,
                mature: 0,
            });
            s.total += 1;
            if is_due {
                s.due += 1;
            }
            match bucket {
                Mastery::New => s.new += 1,
                Mastery::Learning => s.learning += 1,
                Mastery::Young => s.young += 1,
                Mastery::Mature => s.mature += 1,
            }
        }
    }
    let mut out: Vec<CategoryStat> = map.into_values().collect();
    out.sort_by(|a, b| b.total.cmp(&a.total).then(a.category.cmp(&b.category)));
    Ok(out)
}

// The drill is a separate window with its own stylesheet, so it can't read the
// main window's CSS variables. The main window pushes its computed theme tokens
// here (a `:root{...}` string) and the popup pulls them on load, so the popup is
// decorated like the rest of the board.
static POPUP_THEME: StdMutex<String> = StdMutex::new(String::new());

#[tauri::command]
fn set_popup_theme(css: String) {
    *POPUP_THEME.lock().unwrap() = css;
}

#[tauri::command]
fn get_popup_theme() -> String {
    POPUP_THEME.lock().unwrap().clone()
}

/// Drill language + category filter, stored at open time so drill.html needs
/// no URL-query parsing. (Replaces the earlier lang-only command.)
#[tauri::command]
fn vocab_popup_config() -> Result<VocabPopupConfig, String> {
    Ok(VOCAB_POPUP.lock().unwrap().clone())
}

/// Map a 3x3 placement preset to logical-pixel coordinates on the primary
/// monitor. Accepts either word order ("center-right" / "right-center").
/// Unknown values fall back to bottom-right (the spec default).
fn drill_position(preset: &str, mon_x: f64, mon_y: f64, mon_w: f64, mon_h: f64) -> (f64, f64) {
    const W: f64 = 360.0;
    const H: f64 = 240.0;
    const M: f64 = 16.0;
    let hx = if preset.contains("left") {
        0
    } else if preset.contains("right") {
        2
    } else if preset.contains("center") {
        1
    } else {
        2
    };
    let vy = if preset.starts_with("top") {
        0
    } else if preset.starts_with("bottom") {
        2
    } else if preset.contains("center") {
        1
    } else {
        2
    };
    let x = match hx {
        0 => mon_x + M,
        2 => mon_x + mon_w - W - M,
        _ => mon_x + (mon_w - W) / 2.0,
    };
    let y = match vy {
        0 => mon_y + M,
        2 => mon_y + mon_h - H - M,
        _ => mon_y + (mon_h - H) / 2.0,
    };
    (x, y)
}

fn open_drill_window(
    app: &tauri::AppHandle,
    lang: &str,
    cats: &[String],
    position: &str,
    focus_existing: bool,
    practice: bool,
) -> Result<&'static str, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    let cfg = read_vocab_section(app);
    let session_size = cfg
        .get("cardsPerSession")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as usize;
    let struggling_first = cfg
        .get("strugglingFirst")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let practice_size = cfg
        .get("practicePerSession")
        .and_then(|v| v.as_u64())
        .unwrap_or(10) as usize;
    let new_config = VocabPopupConfig {
        lang: lang.to_string(),
        cats: cats.to_vec(),
        session_size,
        struggling_first,
        practice,
        practice_size,
    };
    if let Some(w) = app.get_webview_window("drill") {
        // A different mode must be honoured: reload the popup so it re-reads the
        // config and rebuilds its queue. Same mode → just focus (never steal
        // focus on the scheduler tick).
        let same_mode = VOCAB_POPUP.lock().unwrap().practice == practice;
        if !same_mode {
            *VOCAB_POPUP.lock().unwrap() = new_config;
            let _ = w.eval("location.reload()");
        }
        if focus_existing {
            let _ = w.set_focus();
        }
        return Ok("already-open");
    }
    *VOCAB_POPUP.lock().unwrap() = new_config;
    // Placement preset on the primary monitor, converted to logical pixels.
    let mon = app
        .primary_monitor()
        .map_err(|e| format!("monitor: {e}"))?
        .ok_or("no primary monitor")?;
    let scale = mon.scale_factor().max(1.0);
    let (x, y) = drill_position(
        position,
        mon.position().x as f64 / scale,
        mon.position().y as f64 / scale,
        mon.size().width as f64 / scale,
        mon.size().height as f64 / scale,
    );
    WebviewWindowBuilder::new(app, "drill", WebviewUrl::App("drill.html".into()))
        .title("Vocab drill")
        .inner_size(360.0, 240.0)
        .position(x, y)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| format!("popup: {e}"))?;
    Ok("opened")
}

/// Open (or focus) the drill popup. Used by the scheduler and the settings
/// Preview button alike. Categories filter the drilled cards (popup-only);
/// position is a 3x3 preset (default bottom-right).
#[tauri::command]
async fn open_vocab_popup(
    app: tauri::AppHandle,
    lang: String,
    categories: Vec<String>,
    position: String,
    practice: bool,
) -> Result<String, String> {
    open_drill_window(&app, &lang, &categories, &position, true, practice).map(|s| s.to_string())
}

/// Close the drill popup (called from the popup itself).
#[tauri::command]
async fn close_vocab_popup(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("drill") {
        w.close().map_err(|e| format!("close popup: {e}"))?;
    }
    Ok(())
}

/// Snooze popups for 30 minutes (spec FR-VOC-008). Persisted so a restart
/// stays snoozed; the popup closes itself right after.
#[tauri::command]
async fn snooze_vocab_popup(app: tauri::AppHandle) -> Result<(), String> {
    let until = now_secs() + 30 * 60;
    write_vocab_keys(&app, &[("snoozeUntil", serde_json::Value::from(until))])?;
    close_vocab_popup(app).await
}

/// Clear a snooze early (settings button).
#[tauri::command]
async fn clear_vocab_snooze(app: tauri::AppHandle) -> Result<(), String> {
    write_vocab_keys(&app, &[("snoozeUntil", serde_json::Value::from(0))])
}

#[derive(serde::Serialize)]
struct VocabPopupState {
    snooze_until: u64,
    last_popup_at: u64,
}

/// Live popup timing for the main window to mirror into memory: the file is
/// the source of truth for snooze (written by the popup itself), the static
/// for the session's last fire time. The main window merges these without
/// saving, so its full-state writes can never clobber a popup-set snooze.
#[tauri::command]
fn vocab_popup_state(app: tauri::AppHandle) -> Result<VocabPopupState, String> {
    let cfg = read_vocab_section(&app);
    let snooze_until = cfg.get("snoozeUntil").and_then(|v| v.as_u64()).unwrap_or(0);
    let file_last = cfg.get("lastPopupAt").and_then(|v| v.as_u64()).unwrap_or(0);
    let live_last = *VOCAB_LAST_POPUP_AT.lock().unwrap();
    Ok(VocabPopupState {
        snooze_until,
        last_popup_at: file_last.max(live_last),
    })
}

fn in_quiet_hours(start: &str, end: &str) -> bool {
    if start.is_empty() || end.is_empty() {
        return false;
    }
    let parse = |s: &str| {
        let mut it = s.split(':');
        match (it.next()?.parse::<u32>().ok()?, it.next()?.parse::<u32>().ok()?) {
            (h, m) if h < 24 && m < 60 => Some(h * 60 + m),
            _ => None,
        }
    };
    let (s, e) = match (parse(start), parse(end)) {
        (Some(a), Some(b)) => (a, b),
        _ => return false,
    };
    if s == e {
        return false;
    }
    let now = {
        use chrono::Local;
        let t = Local::now();
        use chrono::Timelike;
        t.hour() * 60 + t.minute()
    };
    if s < e {
        now >= s && now < e
    } else {
        now >= s || now < e
    }
}

/// Scheduler tick (called from the main window every ~30s). Reads popup config
/// from the state file and decides: opens the popup or reports why not.
/// Returns one of: opened | disabled | snoozed | quiet-hours | too-soon |
/// already-open.
#[tauri::command]
async fn vocab_tick(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = read_vocab_section(&app);
    let enabled = cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
    if !enabled {
        return Ok("disabled".into());
    }
    let now = now_secs();
    let snooze_until = cfg.get("snoozeUntil").and_then(|v| v.as_u64()).unwrap_or(0);
    if snooze_until > now {
        return Ok("snoozed".into());
    }
    let qs = cfg.get("quietStart").and_then(|v| v.as_str()).unwrap_or("");
    let qe = cfg.get("quietEnd").and_then(|v| v.as_str()).unwrap_or("");
    if in_quiet_hours(qs, qe) {
        return Ok("quiet-hours".into());
    }
    let every_min = cfg.get("everyMin").and_then(|v| v.as_u64()).unwrap_or(30).max(1);
    // Seed the session cooldown from the persisted value once, so a restart
    // doesn't immediately re-fire a popup that just showed.
    let last = {
        let mut slot = VOCAB_LAST_POPUP_AT.lock().unwrap();
        if *slot == 0 {
            *slot = cfg.get("lastPopupAt").and_then(|v| v.as_u64()).unwrap_or(0);
        }
        *slot
    };
    if last > 0 && now < last + every_min * 60 {
        return Ok("too-soon".into());
    }
    let lang = cfg.get("lang").and_then(|v| v.as_str()).unwrap_or("es");
    let cats: Vec<String> = cfg
        .get("drillCats")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let position = cfg
        .get("popupPosition")
        .and_then(|v| v.as_str())
        .unwrap_or("bottom-right");
    let status = open_drill_window(&app, lang, &cats, position, false, false)?;
    if status == "opened" {
        *VOCAB_LAST_POPUP_AT.lock().unwrap() = now;
        let _ = write_vocab_keys(&app, &[("lastPopupAt", serde_json::Value::from(now))]);
    }
    Ok(status.into())
}

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
    // Preserve Rust-managed `vocab` keys (see `preserve_rust_vocab_keys`).
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let merged = preserve_rust_vocab_keys(&state_json, &existing);
    fs::write(&path, merged).map_err(|e| format!("Failed to save dashboard state: {e}"))
}

/// Merge Rust-managed `vocab` keys from the on-disk state into an incoming
/// full-state payload. SRS progress and popup timing are written by the drill
/// window and are not tracked by the main window's in-memory state, so a
/// full-state save must not regress them. Returns the payload unchanged when
/// either side can't be parsed.
fn preserve_rust_vocab_keys(state_json: &str, existing: &str) -> String {
    let mut v: serde_json::Value = match serde_json::from_str(state_json) {
        Ok(v) => v,
        Err(_) => return state_json.to_string(),
    };
    let old: serde_json::Value = match serde_json::from_str(existing) {
        Ok(v) => v,
        Err(_) => return state_json.to_string(),
    };
    if let Some(old_vocab) = old.get("vocab").and_then(|x| x.as_object()) {
        if let Some(obj) = v.as_object_mut() {
            let vocab = obj
                .entry("vocab")
                .or_insert(serde_json::Value::Object(serde_json::Map::new()));
            if let Some(vobj) = vocab.as_object_mut() {
                for k in ["srs", "srsEnabled", "snoozeUntil", "lastPopupAt"] {
                    if let Some(val) = old_vocab.get(k) {
                        vobj.insert(k.to_string(), val.clone());
                    }
                }
            }
        }
    }
    serde_json::to_string(&v).unwrap_or_else(|_| state_json.to_string())
}

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(STATE_FILE_NAME))
        .map_err(|e| format!("Failed to locate app-data directory: {e}"))
}

/// Export the current dashboard configuration to a user-chosen `.json` file.
/// Secrets are never in the state file (they live in each machine's OS secret
/// store), so the export contains no credentials by construction.
#[tauri::command]
async fn export_config(app: tauri::AppHandle, filename: String) -> Result<Option<String>, String> {
    let path = state_file_path(&app)?;
    if !path.exists() {
        return Err("No saved configuration to export yet".into());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read dashboard state: {e}"))?;
    let dest = rfd::AsyncFileDialog::new()
        .set_title("Export dashboard configuration")
        .set_file_name(&filename)
        .add_filter("JSON", &["json"])
        .save_file()
        .await;
    let dest = match dest {
        Some(d) => d,
        None => return Ok(None),
    };
    fs::write(dest.path(), contents)
        .map_err(|e| format!("Failed to write export file: {e}"))?;
    Ok(Some(dest.path().to_string_lossy().into_owned()))
}

/// Import a dashboard configuration file: validate it, back up the current
/// state to `.bak`, then replace it. An invalid file is rejected and the
/// current setup is left untouched. Returns the imported JSON so the frontend
/// can adopt it without re-reading the file.
#[tauri::command]
async fn import_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let src = rfd::AsyncFileDialog::new()
        .set_title("Import dashboard configuration")
        .add_filter("JSON", &["json"])
        .pick_file()
        .await;
    let src = match src {
        Some(f) => f,
        None => return Ok(None),
    };
    let bytes = fs::read(src.path())
        .map_err(|e| format!("Failed to read import file: {e}"))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| "Import file is not valid text".to_string())?;
    if !validate_state(&text) {
        return Err("Not a valid lost-board configuration file — current setup unchanged".into());
    }
    let path = state_file_path(&app)?;
    if path.exists() {
        let backup = path.with_extension("json.bak");
        fs::copy(&path, &backup)
            .map_err(|e| format!("Failed to back up current configuration: {e}"))?;
    } else if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app-data directory: {e}"))?;
    }
    fs::write(&path, &text)
        .map_err(|e| format!("Failed to save imported configuration: {e}"))?;
    Ok(Some(text))
}

#[cfg(test)]
mod srs_tests {
    use super::*;

    #[test]
    fn sm2_new_card_expands_intervals() {
        let now = 1_000_000u64;
        let e1 = sm2_next(SrsEntry::default(), 4, now);
        assert_eq!(e1.reps, 1);
        assert_eq!(e1.ivl, 1);
        assert_eq!(e1.due, now + 86_400);

        let e2 = sm2_next(e1, 4, now);
        assert_eq!(e2.reps, 2);
        assert_eq!(e2.ivl, 6);

        let e3 = sm2_next(e2, 4, now);
        assert!(e3.ivl > 6, "interval must expand past 6 days, got {}", e3.ivl);
        assert!(e3.due > now);
    }

    #[test]
    fn sm2_fail_relearns_soon_and_lowers_ease() {
        let now = 1_000_000u64;
        let seed = SrsEntry { reps: 3, ivl: 30, ease: 2.5, due: now, lapses: 0 };
        let e = sm2_next(seed, 2, now);
        assert_eq!(e.reps, 0);
        assert_eq!(e.ivl, 0);
        assert_eq!(e.lapses, 1);
        assert_eq!(e.due, now + 600);
        assert!(e.ease < 2.5);
    }

    #[test]
    fn sm2_interval_is_capped() {
        let now = 1_000_000u64;
        let seed = SrsEntry { reps: 10, ivl: 700, ease: 3.0, due: now, lapses: 0 };
        let e = sm2_next(seed, 5, now);
        assert!(e.ivl <= 730, "interval must be capped, got {}", e.ivl);
    }

    #[test]
    fn preserves_rust_vocab_keys_on_save() {
        // Main-window payload lacks srs/srsEnabled; the on-disk file has them.
        let payload = r#"{"columns":12,"compartments":[],"vocab":{"enabled":true,"everyMin":30}}"#;
        let existing = r#"{"columns":12,"compartments":[],"vocab":{"srs":{"a":{"due":5,"ivl":1,"ease":2.5,"reps":1,"lapses":0}},"srsEnabled":true,"snoozeUntil":99}}"#;
        let merged = preserve_rust_vocab_keys(payload, existing);
        let v: serde_json::Value = serde_json::from_str(&merged).unwrap();
        assert_eq!(v["vocab"]["srs"]["a"]["due"].as_u64(), Some(5));
        assert_eq!(v["vocab"]["srsEnabled"].as_bool(), Some(true));
        assert_eq!(v["vocab"]["snoozeUntil"].as_u64(), Some(99));
        assert_eq!(v["vocab"]["enabled"].as_bool(), Some(true)); // payload's own key kept
        assert_eq!(v["vocab"]["everyMin"].as_u64(), Some(30));
    }

    #[test]
    fn preserve_is_safe_without_existing_or_valid_json() {
        let payload = r#"{"columns":12,"compartments":[]}"#;
        // No on-disk file at all.
        let merged = preserve_rust_vocab_keys(payload, "");
        let v: serde_json::Value = serde_json::from_str(&merged).unwrap();
        assert!(v["vocab"].is_null(), "no vocab added when there was none");
        // Garbage existing content must fail open, not corrupt.
        assert_eq!(preserve_rust_vocab_keys(payload, "not json"), payload);
    }

    #[test]
    fn mastery_buckets_follow_interval_and_reps() {
        assert!(matches!(mastery_of(None), Mastery::New));
        let learning = SrsEntry { reps: 0, ivl: 0, ..Default::default() };
        assert!(matches!(mastery_of(Some(&learning)), Mastery::Learning));
        let young = SrsEntry { reps: 3, ivl: 6, ..Default::default() };
        assert!(matches!(mastery_of(Some(&young)), Mastery::Young));
        let mature = SrsEntry { reps: 4, ivl: MATURE_DAYS, ..Default::default() };
        assert!(matches!(mastery_of(Some(&mature)), Mastery::Mature));
        // A just-failed card (reps reset) is Learning again even if it had lapsed far.
        let relapsed = SrsEntry { reps: 0, ivl: 0, lapses: 4, ..Default::default() };
        assert!(matches!(mastery_of(Some(&relapsed)), Mastery::Learning));
    }

    #[test]
    fn uncategorized_cards_get_a_synthetic_bucket() {
        let mut c = VocabCard {
            id: "a".into(),
            en: "a".into(),
            es: String::new(),
            de: String::new(),
            cats: vec!["Food".into()],
        };
        assert_eq!(card_categories(&c), vec!["Food"]);
        c.cats.clear();
        assert_eq!(card_categories(&c), vec![UNCATEGORIZED]);
    }

    fn tcard(id: &str) -> VocabCard {
        VocabCard {
            id: id.into(),
            en: id.into(),
            es: String::new(),
            de: String::new(),
            cats: vec!["x".into()],
        }
    }

    #[test]
    fn due_batch_caps_and_only_returns_due_cards() {
        let a = tcard("a");
        let b = tcard("b");
        let c = tcard("c");
        let matching = vec![&a, &b, &c];
        let mut typed = std::collections::HashMap::new();
        typed.insert("a".to_string(), SrsEntry { due: 100, ..Default::default() });
        typed.insert("b".to_string(), SrsEntry { due: 100, ..Default::default() });
        typed.insert("c".to_string(), SrsEntry { due: 10_000, ..Default::default() }); // not due
        let out = pick_due_batch(&matching, &typed, 200, 5, false);
        assert_eq!(out.len(), 2, "only due cards are returned");
        assert!(out.iter().all(|d| d.due));
        assert_eq!(pick_due_batch(&matching, &typed, 200, 1, false).len(), 1, "cap respected");
    }

    #[test]
    fn due_batch_falls_back_to_exposure_card() {
        let a = tcard("a");
        let matching = vec![&a];
        let mut typed = std::collections::HashMap::new();
        typed.insert("a".to_string(), SrsEntry { due: 10_000, ..Default::default() });
        let out = pick_due_batch(&matching, &typed, 200, 0, false);
        assert_eq!(out.len(), 1);
        assert!(!out[0].due, "exposure card must not be graded");
    }

    #[test]
    fn due_batch_prefers_struggling_first() {
        let a = tcard("a");
        let b = tcard("b");
        let c = tcard("c");
        let matching = vec![&a, &b, &c];
        let mut typed = std::collections::HashMap::new();
        typed.insert("a".to_string(), SrsEntry { due: 100, ..Default::default() });
        typed.insert("b".to_string(), SrsEntry { due: 100, ..Default::default() });
        typed.insert(
            "c".to_string(),
            SrsEntry { due: 100, lapses: STRUGGLE_LAPSES, ..Default::default() },
        );
        // With cap 1 + struggling-first, the leech must always be the one picked.
        for _ in 0..25 {
            assert_eq!(pick_due_batch(&matching, &typed, 200, 1, true)[0].card.id, "c");
        }
    }

    #[test]
    fn practice_pool_is_not_due_and_struggling() {
        let a = tcard("a"); // not due + struggling -> include
        let b = tcard("b"); // due + struggling -> exclude (graded as a normal review)
        let c = tcard("c"); // not due, not struggling -> exclude
        let matching = vec![&a, &b, &c];
        let mut typed = std::collections::HashMap::new();
        typed.insert(
            "a".to_string(),
            SrsEntry { due: 10_000, lapses: STRUGGLE_LAPSES, ..Default::default() },
        );
        typed.insert(
            "b".to_string(),
            SrsEntry { due: 100, lapses: STRUGGLE_LAPSES, ..Default::default() },
        );
        typed.insert("c".to_string(), SrsEntry { due: 10_000, ..Default::default() });
        let ids: Vec<String> = pick_practice_batch(&matching, &typed, 200, 0)
            .into_iter()
            .map(|c| c.id.clone())
            .collect();
        assert_eq!(ids, vec!["a".to_string()]);
    }
}
