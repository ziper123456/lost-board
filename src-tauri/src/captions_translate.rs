// Captions translation: LibreTranslate client + app-managed Docker lifecycle.
//
// The translator is optional and only used while the Captions split view is on.
// Nothing is started at app launch; the frontend asks for a status/start.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const CONTAINER: &str = "lost-board-libretranslate";
const IMAGE: &str = "libretranslate/libretranslate:latest";
const CONTAINER_PORT: &str = "5000/tcp";
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:5000";
const CACHE_MAX: usize = 2000;

#[derive(Deserialize)]
pub struct CaptionTranslateLine {
    pub seq: u64,
    pub text: String,
}

#[derive(Serialize)]
pub struct CaptionTranslateOut {
    pub seq: u64,
    pub text: String,
    pub error: String,
}

#[derive(Serialize)]
pub struct CaptionTranslateResult {
    pub provider: String,
    pub translations: Vec<CaptionTranslateOut>,
    pub error: String,
}

#[derive(Serialize, Clone, Default)]
pub struct TranslatorStatus {
    pub docker_installed: bool,
    pub daemon_running: bool,
    pub image_present: bool,
    pub container_exists: bool,
    pub running: bool,
    pub endpoint: String,
    pub state: String, // offline | starting | ready | error
    pub error: String,
}

static TRANSLATE_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static KEEP_RUNNING: AtomicBool = AtomicBool::new(false);
static STARTING: AtomicBool = AtomicBool::new(false);

struct StartGuard;
impl Drop for StartGuard {
    fn drop(&mut self) {
        STARTING.store(false, Ordering::SeqCst);
    }
}

fn cache() -> &'static Mutex<HashMap<String, String>> {
    TRANSLATE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_key(provider: &str, source: &str, target: &str, text: &str) -> String {
    format!("{provider}|{source}|{target}|{text}")
}

fn endpoint_or_default(endpoint: &str) -> String {
    let e = endpoint.trim().trim_end_matches('/');
    if e.is_empty() {
        DEFAULT_ENDPOINT.to_string()
    } else {
        e.to_string()
    }
}

async fn libre_translate_batch(
    endpoint: &str,
    lines: &[String],
    source: &str,
    target: &str,
) -> Result<Vec<String>, String> {
    if lines.is_empty() {
        return Ok(Vec::new());
    }
    let url = format!("{}/translate", endpoint);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "q": lines,
        "source": source,
        "target": target,
        "format": "text"
    });
    let resp = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LibreTranslate request failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("LibreTranslate HTTP {status}: {text}"));
    }
    let parsed: Value =
        serde_json::from_str(&text).map_err(|e| format!("LibreTranslate parse failed: {e}"))?;
    let translated = parsed
        .get("translatedText")
        .ok_or_else(|| "LibreTranslate returned no translatedText".to_string())?;
    if let Some(arr) = translated.as_array() {
        let out: Vec<String> = arr
            .iter()
            .map(|v| v.as_str().unwrap_or("").to_string())
            .collect();
        if out.len() != lines.len() {
            return Err("LibreTranslate returned a mismatched line count".into());
        }
        Ok(out)
    } else if let Some(s) = translated.as_str() {
        if lines.len() != 1 {
            return Err("LibreTranslate returned one string for a batch".into());
        }
        Ok(vec![s.to_string()])
    } else {
        Err("LibreTranslate returned an invalid translatedText".into())
    }
}

async fn health_ok(endpoint: &str, timeout: Duration) -> bool {
    let Ok(client) = reqwest::Client::builder().timeout(timeout).build() else {
        return false;
    };
    client
        .get(format!("{endpoint}/health"))
        .send()
        .await
        .map(|resp| resp.status().is_success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn caption_translate_health(endpoint: String) -> Result<bool, String> {
    let endpoint = endpoint_or_default(&endpoint);
    Ok(health_ok(&endpoint, Duration::from_secs(5)).await)
}

#[tauri::command]
pub async fn caption_translate_batch(
    lines: Vec<CaptionTranslateLine>,
    source: String,
    target: String,
    provider: String,
    endpoint: String,
    allow_cloud_fallback: bool,
) -> Result<CaptionTranslateResult, String> {
    if lines.is_empty() {
        return Ok(CaptionTranslateResult {
            provider,
            translations: Vec::new(),
            error: String::new(),
        });
    }
    let provider_key = provider.to_ascii_lowercase();
    let source_key = source.to_ascii_lowercase();
    let target_key = target.to_ascii_lowercase();

    let mut missing = Vec::new();
    let mut missing_texts = Vec::new();
    let mut cached: HashMap<u64, String> = HashMap::new();
    for line in &lines {
        let key = cache_key(&provider_key, &source_key, &target_key, &line.text);
        if let Some(text) = cache().lock().unwrap().get(&key).cloned() {
            cached.insert(line.seq, text);
        } else {
            missing.push(line.seq);
            missing_texts.push(line.text.clone());
        }
    }

    let mut result_provider = provider_key.clone();
    let mut translated: Vec<String> = Vec::new();
    if !missing_texts.is_empty() {
        let endpoint = endpoint_or_default(&endpoint);
        let local = if provider_key == "libretranslate" {
            libre_translate_batch(&endpoint, &missing_texts, &source_key, &target_key).await
        } else {
            Err(format!("Unsupported translation provider: {provider}"))
        };

        match local {
            Ok(out) => translated = out,
            Err(local_err) if allow_cloud_fallback => {
                // Explicit opt-in only. DeepL is the only cloud fallback wired
                // here; opencode remains the manual per-line cleanup action.
                let target_upper = target_key.to_ascii_uppercase();
                match crate::deepl_translate_batch(&missing_texts, &source_key, &target_upper).await
                {
                    Ok(out) => {
                        result_provider = "deepl".to_string();
                        translated = out;
                    }
                    Err(cloud_err) => {
                        return Err(format!(
                            "Local translator failed ({local_err}); cloud fallback failed: {cloud_err}"
                        ));
                    }
                }
            }
            Err(err) => return Err(err),
        }
    }

    let mut translations = Vec::with_capacity(lines.len());
    for line in lines {
        let text = cached
            .remove(&line.seq)
            .or_else(|| {
                let index = missing.iter().position(|seq| *seq == line.seq)?;
                translated.get(index).cloned()
            })
            .unwrap_or_default();
        if !text.is_empty() {
            let key = cache_key(&result_provider, &source_key, &target_key, &line.text);
            let mut c = cache().lock().unwrap();
            if c.len() >= CACHE_MAX {
                c.clear();
            }
            c.insert(key, text.clone());
        }
        translations.push(CaptionTranslateOut {
            seq: line.seq,
            text,
            error: String::new(),
        });
    }

    Ok(CaptionTranslateResult {
        provider: result_provider,
        translations,
        error: String::new(),
    })
}

async fn run_docker(args: &[String], timeout: Duration) -> Result<std::process::Output, String> {
    let mut cmd = tokio::process::Command::new("docker");
    cmd.args(args);
    cmd.kill_on_drop(true);
    match tokio::time::timeout(timeout, cmd.output()).await {
        Ok(Ok(out)) => Ok(out),
        Ok(Err(e)) => Err(format!("Docker is not available: {e}")),
        Err(_) => Err("Docker command timed out".into()),
    }
}

fn out_text(out: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !stdout.is_empty() {
        stdout
    } else {
        String::from_utf8_lossy(&out.stderr).trim().to_string()
    }
}

async fn docker_ok(args: &[String], timeout: Duration) -> bool {
    run_docker(args, timeout)
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

async fn mapped_endpoint() -> String {
    let args = vec![
        "port".to_string(),
        CONTAINER.to_string(),
        CONTAINER_PORT.to_string(),
    ];
    let Ok(out) = run_docker(&args, Duration::from_secs(5)).await else {
        return String::new();
    };
    if !out.status.success() {
        return String::new();
    }
    out_text(&out)
        .lines()
        .next()
        .and_then(|line| line.rsplit(':').next())
        .and_then(|port| port.trim().parse::<u16>().ok())
        .map(|port| format!("http://127.0.0.1:{port}"))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn caption_polish_line(
    source: String,
    draft: String,
    context: String,
) -> Result<String, String> {
    if source.trim().is_empty() {
        return Err("Nothing to polish.".into());
    }
    crate::llm_polish_line(&source, &draft, &context)
        .await
        .ok_or_else(|| "opencode cleanup is unavailable.".to_string())
}

#[tauri::command]
pub async fn caption_translator_status() -> Result<TranslatorStatus, String> {
    let mut status = TranslatorStatus {
        state: "offline".into(),
        ..Default::default()
    };
    let version_args = vec![
        "version".to_string(),
        "--format".to_string(),
        "{{.Server.Version}}".to_string(),
    ];
    match run_docker(&version_args, Duration::from_secs(5)).await {
        Ok(out) if out.status.success() => {
            status.docker_installed = true;
            status.daemon_running = true;
        }
        Ok(_) => {
            status.docker_installed = true;
            status.error = "Docker daemon is not running. Start Docker Desktop and retry.".into();
        }
        Err(err) => {
            status.error = err;
        }
    }
    if !status.daemon_running {
        return Ok(status);
    }

    let image_args = vec![
        "image".to_string(),
        "inspect".to_string(),
        IMAGE.to_string(),
    ];
    status.image_present = docker_ok(&image_args, Duration::from_secs(8)).await;

    let inspect_args = vec![
        "inspect".to_string(),
        "--format".to_string(),
        "{{.State.Running}}".to_string(),
        CONTAINER.to_string(),
    ];
    if let Ok(out) = run_docker(&inspect_args, Duration::from_secs(5)).await {
        if out.status.success() {
            status.container_exists = true;
            status.running = out_text(&out).eq_ignore_ascii_case("true");
        }
    }
    if status.running {
        status.endpoint = mapped_endpoint().await;
        status.state = if status.endpoint.is_empty() {
            "starting".into()
        } else if health_ok(&status.endpoint, Duration::from_secs(3)).await {
            "ready".into()
        } else {
            "starting".into()
        };
    }
    Ok(status)
}

#[tauri::command]
pub async fn caption_translator_start() -> Result<TranslatorStatus, String> {
    if STARTING.swap(true, Ordering::SeqCst) {
        return Err("Translator is already starting. Please wait.".into());
    }
    let _guard = StartGuard;
    let mut status = caption_translator_status().await?;
    if !status.docker_installed {
        return Err(
            "Docker is not installed. Install Docker Desktop to use the local translator.".into(),
        );
    }
    if !status.daemon_running {
        return Err("Docker Desktop is not running. Start it, then retry.".into());
    }

    if !status.image_present {
        let args = vec!["pull".to_string(), IMAGE.to_string()];
        let out = run_docker(&args, Duration::from_secs(30 * 60)).await?;
        if !out.status.success() {
            return Err(format!(
                "Could not pull the LibreTranslate image: {}",
                out_text(&out)
            ));
        }
        status.image_present = true;
    }

    if status.container_exists {
        if !status.running {
            let args = vec!["start".to_string(), CONTAINER.to_string()];
            let out = run_docker(&args, Duration::from_secs(60)).await?;
            if !out.status.success() {
                return Err(format!(
                    "Could not start the translator container: {}",
                    out_text(&out)
                ));
            }
        }
    } else {
        let args = vec![
            "run".to_string(),
            "-d".to_string(),
            "--name".to_string(),
            CONTAINER.to_string(),
            "--restart".to_string(),
            "unless-stopped".to_string(),
            "-p".to_string(),
            "127.0.0.1::5000".to_string(),
            "-e".to_string(),
            "LT_LOAD_ONLY=en,de,es,fr,it,pt,nl,ru".to_string(),
            "-v".to_string(),
            "lost-board-lt-models:/home/libretranslate/.local".to_string(),
            IMAGE.to_string(),
        ];
        let out = run_docker(&args, Duration::from_secs(120)).await?;
        if !out.status.success() {
            return Err(format!(
                "Could not start the translator container: {}",
                out_text(&out)
            ));
        }
    }

    for _ in 0..60 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let endpoint = mapped_endpoint().await;
        if !endpoint.is_empty() && health_ok(&endpoint, Duration::from_secs(3)).await {
            return Ok(TranslatorStatus {
                docker_installed: true,
                daemon_running: true,
                image_present: true,
                container_exists: true,
                running: true,
                endpoint,
                state: "ready".into(),
                error: String::new(),
            });
        }
    }
    Err("LibreTranslate did not become healthy within 60 seconds. Check Docker Desktop and the container logs.".into())
}

#[tauri::command]
pub async fn caption_translator_stop() -> Result<(), String> {
    let args = vec![
        "stop".to_string(),
        "--time".to_string(),
        "3".to_string(),
        CONTAINER.to_string(),
    ];
    let out = run_docker(&args, Duration::from_secs(20)).await?;
    if !out.status.success() {
        let text = out_text(&out);
        if text.contains("No such container") {
            return Ok(());
        }
        return Err(format!("Could not stop the translator container: {text}"));
    }
    Ok(())
}

#[tauri::command]
pub fn caption_translator_set_keep_running(keep: bool) {
    KEEP_RUNNING.store(keep, Ordering::SeqCst);
}

/// Called from the Tauri exit event; leaves the container running when the user
/// opted in to that.
pub fn stop_on_exit() {
    if KEEP_RUNNING.load(Ordering::SeqCst) {
        return;
    }
    let _ = std::process::Command::new("docker")
        .args(["stop", "--time", "2", CONTAINER])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_defaults_and_trims() {
        assert_eq!(endpoint_or_default(""), DEFAULT_ENDPOINT);
        assert_eq!(
            endpoint_or_default(" http://127.0.0.1:5001/ "),
            "http://127.0.0.1:5001"
        );
    }

    #[test]
    fn translation_cache_keys_are_provider_scoped() {
        assert_ne!(
            cache_key("libretranslate", "de", "en", "Hallo"),
            cache_key("deepl", "de", "en", "Hallo")
        );
    }

    #[tokio::test]
    async fn libre_batch_parses_an_array_response() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = socket.read(&mut buf);
            let body = r#"{"translatedText":["Hello","World"]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = socket.write_all(response.as_bytes());
        });

        let out = libre_translate_batch(
            &format!("http://{addr}"),
            &["Hallo".to_string(), "Welt".to_string()],
            "de",
            "en",
        )
        .await
        .unwrap();
        assert_eq!(out, vec!["Hello", "World"]);
    }
}
