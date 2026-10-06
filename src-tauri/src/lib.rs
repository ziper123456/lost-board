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
    Ok(())
}

/// Get a valid access token, refreshing via refresh_token when needed.
async fn spotify_access_token() -> Result<String, String> {
    if let Ok(t) = spot_get(SPOTIFY_ACCESS) {
        return Ok(t);
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
    Ok(access)
}

#[derive(serde::Serialize)]
struct SpotifyDevice {
    id: String,
    name: String,
    is_active: bool,
    is_restricted: bool,
}

/// List devices the user can play on (Spotify Connect targets).
#[tauri::command]
async fn spotify_devices() -> Result<Vec<SpotifyDevice>, String> {
    let token = spotify_access_token().await?;
    let resp = reqwest::Client::new()
        .get("https://api.spotify.com/v1/me/player/devices")
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("devices request: {e}"))?;
    let body = resp.text().await.map_err(|e| format!("devices read: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("devices parse: {e}, body: {body}"))?;
    Ok(v.get("devices")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .map(|d| SpotifyDevice {
                    id: d.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    name: d.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    is_active: d.get("is_active").and_then(|x| x.as_bool()).unwrap_or(false),
                    is_restricted: d.get("is_restricted").and_then(|x| x.as_bool()).unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default())
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
}

/// Fetch the currently playing track.
#[tauri::command]
async fn spotify_now_playing() -> Result<Option<SpotifyTrack>, String> {
    let token = spotify_access_token().await?;
    let resp = reqwest::Client::new()
        .get("https://api.spotify.com/v1/me/player/currently-playing")
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
    let item = v.get("item").ok_or("no item")?;
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
    Ok(Some(SpotifyTrack {
        title,
        artist,
        album,
        art,
        playing,
        progress_ms,
        duration_ms,
    }))
}

/// Play (or pause) on the active device.
#[tauri::command]
async fn spotify_play(play: bool) -> Result<(), String> {
    let token = spotify_access_token().await?;
    let url = if play { "https://api.spotify.com/v1/me/player/play" } else { "https://api.spotify.com/v1/me/player/pause" };
    let method = if play { reqwest::Method::PUT } else { reqwest::Method::PUT };
    let resp = reqwest::Client::new()
        .request(method, url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("play request: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Spotify HTTP {}", resp.status()));
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
        .send()
        .await
        .map_err(|e| format!("skip request: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Spotify HTTP {}", resp.status()));
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
        .send()
        .await
        .map_err(|e| format!("volume request: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Spotify HTTP {}", resp.status()));
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct SpotifyQueueItem {
    title: String,
    artist: String,
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
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            pick_folder,
            pick_solution,
            pick_icon,
            classify_path,
            open_folder,
            open_solution,
            open_url,
            fetch_rss,
            cache_favicon,
            set_deepl_key,
            deepl_key_status,
            clear_deepl_key,
            deepl_translate,
            load_tile_icon,
            pick_image,
            load_frame_image,
            set_spotify_client_id,
            spotify_connected,
            spotify_begin,
            spotify_capture,
            spotify_devices,
            spotify_now_playing,
            spotify_play,
            spotify_skip,
            spotify_volume,
            spotify_queue,
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
