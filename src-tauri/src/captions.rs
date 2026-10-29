// Live caption engine: WASAPI loopback -> Vosk streaming ASR.
//
// One language per session. No language ID, no translation, no auto-download.
// The installed bundle must have libvosk.dll next to the executable (see build.rs
// and tauri.conf.json); models are downloaded on demand from Settings.

use std::collections::{HashMap, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use chrono::{Local, TimeZone};
use serde::Serialize;
use tauri::Manager;
use vosk::{DecodingState, Model, Recognizer};
use wasapi::{
    initialize_mta, Device, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
};

const MAX_LINES: usize = 500;
const SAMPLE_RATE: u32 = 16_000;
const CHUNK: usize = 1600; // 100 ms
const DEFAULT_FINALIZE_MS: u64 = 700;

#[derive(Clone, Serialize)]
pub struct CaptionLine {
    at: u64,
    text: String,
}

#[derive(Clone, Serialize, Default)]
pub struct CaptionStatus {
    status: String, // idle | loading | listening | error
    lang: String,
    model_id: String,
    model_name: String,
    device_id: String,
    device_name: String,
    partial: String,
    lines: Vec<CaptionLine>,
    error: String,
    session: u64,
}

#[derive(Clone, Serialize)]
pub struct CaptionDevice {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(Clone, Serialize)]
pub struct CaptionModelInfo {
    id: String,
    lang: String,
    name: String,
    size_mb: u64,
    license: String,
    installed: bool,
    downloading: bool,
    progress: f32,
    error: String,
}

#[derive(Clone, Copy)]
struct ModelSpec {
    id: &'static str,
    lang: &'static str,
    name: &'static str,
    dir: &'static str,
    url: &'static str,
    size_mb: u64,
    license: &'static str,
}

const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "de",
        lang: "de",
        name: "German (small)",
        dir: "vosk-model-small-de-0.15",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip",
        size_mb: 45,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "de-large",
        lang: "de",
        name: "German (large)",
        dir: "vosk-model-de-0.21",
        url: "https://alphacephei.com/vosk/models/vosk-model-de-0.21.zip",
        size_mb: 1938,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "en",
        lang: "en",
        name: "English (small)",
        dir: "vosk-model-small-en-us-0.15",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
        size_mb: 40,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "es",
        lang: "es",
        name: "Spanish (small)",
        dir: "vosk-model-small-es-0.42",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip",
        size_mb: 38,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "es-large",
        lang: "es",
        name: "Spanish (large)",
        dir: "vosk-model-es-0.42",
        url: "https://alphacephei.com/vosk/models/vosk-model-es-0.42.zip",
        size_mb: 1416,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "fr",
        lang: "fr",
        name: "French (small)",
        dir: "vosk-model-small-fr-0.22",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip",
        size_mb: 41,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "it",
        lang: "it",
        name: "Italian (small)",
        dir: "vosk-model-small-it-0.22",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-it-0.22.zip",
        size_mb: 48,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "pt",
        lang: "pt",
        name: "Portuguese (small)",
        dir: "vosk-model-small-pt-0.3",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip",
        size_mb: 31,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "nl",
        lang: "nl",
        name: "Dutch (small)",
        dir: "vosk-model-small-nl-0.22",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-nl-0.22.zip",
        size_mb: 40,
        license: "Apache-2.0",
    },
    ModelSpec {
        id: "ru",
        lang: "ru",
        name: "Russian (small)",
        dir: "vosk-model-small-ru-0.22",
        url: "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip",
        size_mb: 45,
        license: "Apache-2.0",
    },
];

#[derive(Default, Clone)]
struct DownloadState {
    downloading: bool,
    progress: f32,
    error: String,
}

struct EngineState {
    status: String,
    lang: String,
    model_id: String,
    device_id: String,
    device_name: String,
    partial: String,
    lines: Vec<CaptionLine>,
    error: String,
    session: u64,
    stop: Option<Arc<AtomicBool>>,
    handle: Option<JoinHandle<()>>,
    auto_save: bool,
    save_dir: PathBuf,
    file_path: Option<PathBuf>,
    finalize_ms: u64,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            status: "idle".into(),
            lang: "de".into(),
            model_id: "de".into(),
            device_id: String::new(),
            device_name: String::new(),
            partial: String::new(),
            lines: Vec::new(),
            error: String::new(),
            session: 0,
            stop: None,
            handle: None,
            auto_save: true,
            save_dir: PathBuf::new(),
            file_path: None,
            finalize_ms: DEFAULT_FINALIZE_MS,
        }
    }
}

static ENGINE: OnceLock<Mutex<EngineState>> = OnceLock::new();
static DOWNLOADS: OnceLock<Mutex<HashMap<String, DownloadState>>> = OnceLock::new();

fn engine() -> &'static Mutex<EngineState> {
    ENGINE.get_or_init(|| Mutex::new(EngineState::default()))
}

fn downloads() -> &'static Mutex<HashMap<String, DownloadState>> {
    DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn captions_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("captions")
}

fn models_root(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("models/vosk")
}

fn spec_for(model_id: &str) -> Option<&'static ModelSpec> {
    MODELS.iter().find(|m| m.id.eq_ignore_ascii_case(model_id))
}

fn model_path(app: &tauri::AppHandle, spec: &ModelSpec) -> PathBuf {
    models_root(app).join(spec.dir)
}

fn model_installed(path: &Path) -> bool {
    path.join("conf").is_dir() || path.join("am").is_dir()
}

fn snapshot() -> CaptionStatus {
    let e = engine().lock().unwrap();
    CaptionStatus {
        status: e.status.clone(),
        lang: e.lang.clone(),
        model_id: e.model_id.clone(),
        model_name: spec_for(&e.model_id)
            .map(|s| s.name.to_string())
            .unwrap_or_default(),
        device_id: e.device_id.clone(),
        device_name: e.device_name.clone(),
        partial: e.partial.clone(),
        lines: e.lines.clone(),
        error: e.error.clone(),
        session: e.session,
    }
}

fn is_running() -> bool {
    let e = engine().lock().unwrap();
    e.handle.is_some() && matches!(e.status.as_str(), "loading" | "listening")
}

fn stop_engine() {
    let (stop, handle) = {
        let mut e = engine().lock().unwrap();
        (e.stop.take(), e.handle.take())
    };
    if let Some(stop) = stop {
        stop.store(true, Ordering::SeqCst);
    }
    if let Some(handle) = handle {
        let _ = handle.join();
    }
}

fn set_idle() {
    let mut e = engine().lock().unwrap();
    e.status = "idle".into();
    e.partial.clear();
}

fn set_error(message: &str) {
    let mut e = engine().lock().unwrap();
    e.status = "error".into();
    e.error = message.to_string();
    e.partial.clear();
}

fn start_capture(
    app: tauri::AppHandle,
    model_id: String,
    device_id: String,
    auto_save: bool,
    save_dir: String,
    finalize_ms: u64,
    preserve: bool,
) -> Result<(), String> {
    let finalize_ms = finalize_ms.clamp(300, 5000);
    let spec = spec_for(&model_id).ok_or_else(|| format!("Unsupported model: {model_id}"))?;
    let path = model_path(&app, spec);
    if !model_installed(&path) {
        return Err(format!(
            "{} is not installed. Download it in Settings > Captions.",
            spec.name
        ));
    }

    stop_engine();

    let dir = if save_dir.trim().is_empty() {
        captions_dir(&app)
    } else {
        PathBuf::from(save_dir)
    };
    {
        let mut e = engine().lock().unwrap();
        if !preserve {
            e.lines.clear();
            e.partial.clear();
            e.session = now_secs();
            e.file_path = None;
        }
        e.status = "loading".into();
        e.lang = spec.lang.to_string();
        e.model_id = spec.id.to_string();
        e.device_id = device_id.clone();
        e.device_name.clear();
        e.partial.clear();
        e.error.clear();
        e.auto_save = auto_save;
        e.save_dir = dir;
        e.finalize_ms = finalize_ms;
    }

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let thread_app = app.clone();
    let thread_device = device_id.clone();
    let handle = thread::spawn(move || {
        if let Err(err) = capture_loop(&thread_app, &thread_device, &path, &stop_thread, finalize_ms) {
            if !stop_thread.load(Ordering::SeqCst) {
                set_error(&err);
            }
        }
        let mut e = engine().lock().unwrap();
        if e.status == "listening" || e.status == "loading" {
            e.status = "idle".into();
        }
        e.partial.clear();
    });

    let mut e = engine().lock().unwrap();
    e.stop = Some(stop);
    e.handle = Some(handle);
    Ok(())
}

#[tauri::command]
pub fn caption_poll() -> CaptionStatus {
    snapshot()
}

#[tauri::command]
pub fn caption_start(
    app: tauri::AppHandle,
    model_id: String,
    device_id: String,
    auto_save: bool,
    save_dir: String,
    finalize_ms: u64,
) -> Result<(), String> {
    start_capture(app, model_id, device_id, auto_save, save_dir, finalize_ms, false)
}

#[tauri::command]
pub fn caption_stop() {
    stop_engine();
    set_idle();
}

#[tauri::command]
pub fn caption_set_device(app: tauri::AppHandle, device_id: String) -> Result<(), String> {
    let running = is_running();
    let (model_id, auto_save, save_dir, finalize_ms) = {
        let e = engine().lock().unwrap();
        (
            e.model_id.clone(),
            e.auto_save,
            e.save_dir.to_string_lossy().to_string(),
            e.finalize_ms,
        )
    };
    if !running {
        let mut e = engine().lock().unwrap();
        e.device_id = device_id;
        return Ok(());
    }
    start_capture(app, model_id, device_id, auto_save, save_dir, finalize_ms, true)
}

#[tauri::command]
pub fn caption_clear() -> Result<(), String> {
    if is_running() {
        return Err("Stop listening before clearing the transcript.".into());
    }
    let mut e = engine().lock().unwrap();
    e.lines.clear();
    e.partial.clear();
    e.session = 0;
    e.file_path = None;
    e.error.clear();
    e.status = "idle".into();
    Ok(())
}

#[tauri::command]
pub fn caption_devices() -> Result<Vec<CaptionDevice>, String> {
    let _ = initialize_mta(); // RPC_E_CHANGED_MODE is fine: COM is already initialized (STA).
    let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
    let default_id = enumerator
        .get_default_device(&Direction::Render)
        .ok()
        .and_then(|d| d.get_id().ok())
        .unwrap_or_default();
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(|e| e.to_string())?;
    let count = collection.get_nbr_devices().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for i in 0..count {
        let Ok(device) = collection.get_device_at_index(i) else {
            continue;
        };
        let (Ok(id), Ok(name)) = (device.get_id(), device.get_friendlyname()) else {
            continue;
        };
        out.push(CaptionDevice {
            is_default: id == default_id,
            id,
            name,
        });
    }
    out.sort_by(|a, b| b.is_default.cmp(&a.is_default).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}

#[tauri::command]
pub fn caption_models(app: tauri::AppHandle) -> Result<Vec<CaptionModelInfo>, String> {
    let jobs = downloads().lock().unwrap().clone();
    Ok(MODELS
        .iter()
        .map(|spec| {
            let job = jobs.get(spec.id).cloned().unwrap_or_default();
            CaptionModelInfo {
                id: spec.id.to_string(),
                lang: spec.lang.to_string(),
                name: spec.name.to_string(),
                size_mb: spec.size_mb,
                license: spec.license.to_string(),
                installed: model_installed(&model_path(&app, spec)),
                downloading: job.downloading,
                progress: job.progress,
                error: job.error,
            }
        })
        .collect())
}

#[tauri::command]
pub fn caption_download_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let spec = spec_for(&model_id).ok_or_else(|| format!("Unsupported model: {model_id}"))?;
    if model_installed(&model_path(&app, spec)) {
        return Ok(());
    }
    {
        let jobs = downloads().lock().unwrap();
        if jobs.get(spec.id).map(|j| j.downloading).unwrap_or(false) {
            return Ok(());
        }
    }
    downloads().lock().unwrap().insert(
        spec.id.to_string(),
        DownloadState { downloading: true, progress: 0.0, error: String::new() },
    );

    let root = models_root(&app);
    let spec = *spec;
    thread::spawn(move || {
        if let Err(err) = download_and_install(&root, &spec) {
            let mut jobs = downloads().lock().unwrap();
            if let Some(job) = jobs.get_mut(spec.id) {
                job.downloading = false;
                job.error = err;
            }
            return;
        }
        let mut jobs = downloads().lock().unwrap();
        jobs.insert(
            spec.id.to_string(),
            DownloadState { downloading: false, progress: 1.0, error: String::new() },
        );
    });
    Ok(())
}

#[tauri::command]
pub fn caption_remove_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let spec = spec_for(&model_id).ok_or_else(|| format!("Unsupported model: {model_id}"))?;
    {
        let e = engine().lock().unwrap();
        if e.handle.is_some() && e.model_id.eq_ignore_ascii_case(spec.id) {
            return Err("Stop listening before removing this model.".into());
        }
    }
    let path = model_path(&app, spec);
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove model: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn caption_save() -> Result<Option<String>, String> {
    let (model_id, lines) = {
        let e = engine().lock().unwrap();
        (e.model_id.clone(), e.lines.clone())
    };
    if lines.is_empty() {
        return Err("Nothing to save yet.".into());
    }
    let default = format!("captions-{}.md", Local::now().format("%Y-%m-%d_%H-%M"));
    let dest = rfd::AsyncFileDialog::new()
        .set_title("Save captions")
        .set_file_name(&default)
        .add_filter("Markdown", &["md"])
        .add_filter("Text", &["txt"])
        .save_file()
        .await;
    let Some(dest) = dest else { return Ok(None) };
    let text = format_markdown(&model_id, &lines);
    fs::write(dest.path(), text).map_err(|e| format!("Failed to write captions: {e}"))?;
    Ok(Some(dest.path().to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn caption_open_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = {
        let e = engine().lock().unwrap();
        if e.save_dir.as_os_str().is_empty() {
            captions_dir(&app)
        } else {
            e.save_dir.clone()
        }
    };
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create captions folder: {e}"))?;
    crate::open_folder(dir.to_string_lossy().into_owned())
}

fn format_markdown(model_id: &str, lines: &[CaptionLine]) -> String {
    let mut out = format!(
        "# Captions\n\nModel: {}\n\n",
        spec_for(model_id).map(|s| s.name).unwrap_or(model_id)
    );
    for line in lines {
        let time = Local
            .timestamp_opt(line.at as i64, 0)
            .single()
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_default();
        out.push_str(&format!("- [{time}] {}\n", line.text));
    }
    out
}

fn capture_loop(
    app: &tauri::AppHandle,
    device_id: &str,
    model_path: &Path,
    stop: &AtomicBool,
    finalize_ms: u64,
) -> Result<(), String> {
    let finalize_after = Duration::from_millis(finalize_ms);
    let _ = initialize_mta(); // RPC_E_CHANGED_MODE is fine: COM is already initialized (STA).

    let model = Model::new(model_path.to_string_lossy().into_owned())
        .ok_or_else(|| "Failed to load the speech model.".to_string())?;
    let mut recognizer = Recognizer::new(&model, SAMPLE_RATE as f32)
        .ok_or_else(|| "Failed to create the speech recognizer.".to_string())?;
    if stop.load(Ordering::SeqCst) {
        return Ok(());
    }

    let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
    let device = resolve_device(&enumerator, device_id)?;
    let resolved_id = device.get_id().unwrap_or_default();
    let friendly = device.get_friendlyname().unwrap_or_else(|_| "Output device".into());
    {
        let mut e = engine().lock().unwrap();
        e.device_id = resolved_id;
        e.device_name = friendly;
    }

    let mut audio_client = device.get_iaudioclient().map_err(|e| e.to_string())?;
    let desired = WaveFormat::new(16, 16, &SampleType::Int, SAMPLE_RATE as usize, 1, None);
    let (_, min_time) = audio_client.get_device_period().map_err(|e| e.to_string())?;
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };
    audio_client
        .initialize_client(&desired, &Direction::Capture, &mode)
        .map_err(|e| format!("Failed to open system audio: {e}"))?;
    let event = audio_client.set_get_eventhandle().map_err(|e| e.to_string())?;
    let capture = audio_client
        .get_audiocaptureclient()
        .map_err(|e| e.to_string())?;
    let mut queue: VecDeque<u8> = VecDeque::with_capacity(SAMPLE_RATE as usize * 2);
    let mut samples: Vec<i16> = Vec::with_capacity(CHUNK);
    let mut last_partial = String::new();
    let mut last_change = Instant::now();

    audio_client.start_stream().map_err(|e| e.to_string())?;
    {
        let mut e = engine().lock().unwrap();
        e.status = "listening".into();
        e.error.clear();
        e.partial.clear();
    }

    let mut failure: Option<String> = None;
    while !stop.load(Ordering::SeqCst) {
        if let Err(e) = capture.read_from_device_to_deque(&mut queue) {
            failure = Some(format!("Audio capture failed: {e}"));
            break;
        }
        while queue.len() >= 2 {
            let lo = queue.pop_front().unwrap();
            let hi = queue.pop_front().unwrap();
            samples.push(i16::from_le_bytes([lo, hi]));
        }

        while samples.len() >= CHUNK {
            let chunk: Vec<i16> = samples.drain(..CHUNK).collect();
            let state = match recognizer.accept_waveform(&chunk) {
                Ok(state) => state,
                Err(e) => {
                    failure = Some(format!("Speech recognition failed: {e}"));
                    break;
                }
            };
            // Vosk's own silence endpoint is the authoritative sentence
            // boundary. Without this, rapid turn-taking can accumulate into a
            // single long utterance.
            if matches!(state, DecodingState::Finalized) {
                finalize(app, &mut recognizer);
                last_partial.clear();
                last_change = Instant::now();
                set_partial("");
                continue;
            }
            let partial = recognizer.partial_result().partial.to_string();
            if !partial.trim().is_empty() {
                if partial != last_partial {
                    last_partial = partial;
                    last_change = Instant::now();
                } else if last_change.elapsed() >= finalize_after {
                    finalize(app, &mut recognizer);
                    last_partial.clear();
                    last_change = Instant::now();
                }
                set_partial(&last_partial);
            } else if !last_partial.trim().is_empty() {
                finalize(app, &mut recognizer);
                last_partial.clear();
                last_change = Instant::now();
            } else {
                set_partial("");
            }
        }
        if failure.is_some() {
            break;
        }
        let _ = event.wait_for_event(50);
    }

    if !samples.is_empty() && failure.is_none() {
        let _ = recognizer.accept_waveform(&samples);
    }
    if failure.is_none() {
        finalize(app, &mut recognizer);
    }
    let _ = audio_client.stop_stream();
    let mut e = engine().lock().unwrap();
    e.partial.clear();
    if let Some(err) = failure {
        return Err(err);
    }
    Ok(())
}

fn resolve_device(enumerator: &DeviceEnumerator, device_id: &str) -> Result<Device, String> {
    if !device_id.is_empty() {
        let collection = enumerator
            .get_device_collection(&Direction::Render)
            .map_err(|e| e.to_string())?;
        let count = collection.get_nbr_devices().map_err(|e| e.to_string())?;
        for i in 0..count {
            let Ok(device) = collection.get_device_at_index(i) else {
                continue;
            };
            if device.get_id().map(|id| id == device_id).unwrap_or(false) {
                return Ok(device);
            }
        }
        return Err("The selected output device is no longer available.".into());
    }
    enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("No default output device: {e}"))
}

fn set_partial(text: &str) {
    let mut e = engine().lock().unwrap();
    e.partial = text.to_string();
}

fn finalize(app: &tauri::AppHandle, recognizer: &mut Recognizer) {
    let text = recognizer
        .final_result()
        .single()
        .map(|r| r.text.trim().to_string())
        .unwrap_or_default();
    if text.is_empty() {
        return;
    }
    add_line(app, text);
}

fn add_line(_app: &tauri::AppHandle, text: String) {
    let line = CaptionLine { at: now_secs(), text };
    let (auto_save, save_dir, model_id, file_path) = {
        let mut e = engine().lock().unwrap();
        e.lines.push(line.clone());
        if e.lines.len() > MAX_LINES {
            let drop = e.lines.len() - MAX_LINES;
            e.lines.drain(0..drop);
        }
        e.partial.clear();
        (e.auto_save, e.save_dir.clone(), e.model_id.clone(), e.file_path.clone())
    };
    if !auto_save {
        return;
    }
    let path = match file_path {
        Some(path) => path,
        None => {
            let _ = fs::create_dir_all(&save_dir);
            let name = format!("captions-{}.md", Local::now().format("%Y-%m-%d_%H-%M-%S"));
            let path = save_dir.join(name);
            let header = format!(
                "# Captions\n\nModel: {}\n\n",
                spec_for(&model_id).map(|s| s.name).unwrap_or(&model_id)
            );
            if fs::write(&path, header).is_err() {
                return;
            }
            let mut e = engine().lock().unwrap();
            e.file_path = Some(path.clone());
            path
        }
    };
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let time = Local
            .timestamp_opt(line.at as i64, 0)
            .single()
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_default();
        let _ = writeln!(file, "- [{time}] {}", line.text);
    }
}

fn download_and_install(root: &Path, spec: &ModelSpec) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| format!("Failed to create model folder: {e}"))?;
    let zip_path = root.join(format!(".{}.zip", spec.id));
    let extract_dir = root.join(format!(".extract-{}", spec.id));
    let final_dir = root.join(spec.dir);

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(6 * 3600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(spec.url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Download failed: {e}"))?;
    let total = response.content_length().unwrap_or(0);
    let mut file = File::create(&zip_path).map_err(|e| format!("Failed to create model file: {e}"))?;
    let mut downloaded = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = response.read(&mut buf).map_err(|e| format!("Download failed: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| format!("Failed to write model: {e}"))?;
        downloaded += n as u64;
        if total > 0 {
            let progress = downloaded as f32 / total as f32;
            if let Some(job) = downloads().lock().unwrap().get_mut(spec.id) {
                job.progress = progress.min(0.99);
            }
        }
    }
    drop(file);

    let _ = fs::remove_dir_all(&extract_dir);
    let file = File::open(&zip_path).map_err(|e| format!("Failed to read model archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid model archive: {e}"))?;
    archive
        .extract(&extract_dir)
        .map_err(|e| format!("Failed to extract model: {e}"))?;
    let src = extract_dir.join(spec.dir);
    if !model_installed(&src) {
        let _ = fs::remove_dir_all(&extract_dir);
        let _ = fs::remove_file(&zip_path);
        return Err("The downloaded archive did not contain a Vosk model.".into());
    }
    if final_dir.exists() {
        fs::remove_dir_all(&final_dir).map_err(|e| format!("Failed to replace model: {e}"))?;
    }
    fs::rename(&src, &final_dir).map_err(|e| format!("Failed to install model: {e}"))?;
    let _ = fs::remove_dir_all(&extract_dir);
    let _ = fs::remove_file(&zip_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_unique_and_include_large_packs() {
        let mut seen = std::collections::HashSet::new();
        for spec in MODELS {
            assert!(seen.insert(spec.id), "duplicate model id: {}", spec.id);
        }
        let de = spec_for("de-large").expect("German large pack");
        assert_eq!(de.lang, "de");
        assert!(de.size_mb > 1000);
        let es = spec_for("es-large").expect("Spanish large pack");
        assert_eq!(es.lang, "es");
        assert!(es.size_mb > 1000);
    }
}
