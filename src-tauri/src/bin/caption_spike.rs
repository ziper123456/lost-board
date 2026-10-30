// Phase-0 spike: capture system audio (WASAPI loopback) and stream it through
// Vosk. Temporary developer binary; not shipped.
//
// cargo run --manifest-path src-tauri/Cargo.toml --bin caption_spike -- <model-dir> [seconds]

use std::collections::VecDeque;
use std::error::Error;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use vosk::{Model, Recognizer};
use wasapi::*;

type Res<T> = Result<T, Box<dyn Error>>;

fn main() -> Res<()> {
    let args: Vec<String> = std::env::args().collect();
    let model_dir = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| "vosk-model-small-de-0.15".to_string());
    let seconds: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(6);

    initialize_mta().ok()?;
    println!("Loading Vosk model: {model_dir}");
    let model = Model::new(model_dir.clone()).ok_or("failed to load Vosk model")?;
    let mut recognizer = Recognizer::new(&model, 16000.0).ok_or("failed to create recognizer")?;
    println!("Model loaded; capturing {seconds}s of system audio...");

    let (tx, rx) = mpsc::sync_channel::<Vec<i16>>(16);
    let capture = thread::spawn(move || {
        if let Err(e) = capture_loop(tx, seconds) {
            eprintln!("capture failed: {e}");
        }
    });

    let mut total = 0usize;
    let started = Instant::now();
    while let Ok(chunk) = rx.recv() {
        total += chunk.len();
        match recognizer.accept_waveform(&chunk) {
            Ok(_) => {
                let partial = recognizer.partial_result().partial.to_string();
                if !partial.trim().is_empty() {
                    println!("partial: {partial}");
                }
            }
            Err(e) => eprintln!("accept_waveform: {e}"),
        }
        if started.elapsed() > Duration::from_secs(seconds + 2) {
            break;
        }
    }
    capture.join().ok();

    let final_text = recognizer
        .final_result()
        .single()
        .map(|s| s.text.to_string())
        .unwrap_or_default();
    let secs = total as f64 / 16000.0;
    println!("captured {secs:.1}s of 16k mono samples");
    println!("FINAL: {final_text}");
    Ok(())
}

fn capture_loop(tx: mpsc::SyncSender<Vec<i16>>, seconds: u64) -> Res<()> {
    let enumerator = DeviceEnumerator::new()?;
    let device = enumerator.get_default_device(&Direction::Render)?;
    println!("Default output: {}", device.get_friendlyname()?);
    let mut audio_client = device.get_iaudioclient()?;

    // Ask WASAPI to convert the shared-mode mix to what Vosk wants.
    let desired = WaveFormat::new(16, 16, &SampleType::Int, 16000, 1, None);
    let (_, min_time) = audio_client.get_device_period()?;
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };
    audio_client.initialize_client(&desired, &Direction::Capture, &mode)?;

    let event = audio_client.set_get_eventhandle()?;
    let capture = audio_client.get_audiocaptureclient()?;
    let mut queue: VecDeque<u8> = VecDeque::with_capacity(16000 * 2 * 2);
    let mut samples: Vec<i16> = Vec::with_capacity(1600);

    audio_client.start_stream()?;
    let deadline = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < deadline {
        capture.read_from_device_to_deque(&mut queue)?;
        while queue.len() >= 2 {
            let lo = queue.pop_front().unwrap();
            let hi = queue.pop_front().unwrap();
            samples.push(i16::from_le_bytes([lo, hi]));
        }
        // ~100 ms chunks keep partials responsive.
        if samples.len() >= 1600 {
            let _ = tx.send(samples.clone());
            samples.clear();
        }
        if event.wait_for_event(100).is_err() {
            // Timeout is normal when nothing is playing; keep waiting until deadline.
        }
    }
    let _ = audio_client.stop_stream();
    if !samples.is_empty() {
        let _ = tx.send(samples);
    }
    Ok(())
}
