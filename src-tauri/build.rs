use std::path::PathBuf;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        setup_vosk();
    }
    tauri_build::build()
}

/// Unpack the bundled Vosk Windows SDK, point the linker at its import library,
/// and copy the runtime DLLs next to the built binaries for `cargo run`/`tauri dev`.
/// The extracted folder is generated (gitignored); the 14 MB zip is committed so
/// builds do not depend on GitHub being reachable.
fn setup_vosk() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sdk_zip = manifest.join("resources/vosk/vosk-win64-0.3.45.zip");
    let extracted = manifest.join("resources/vosk/extracted");
    let sdk_dir = extracted.join("vosk-win64-0.3.45");
    println!("cargo:rerun-if-changed={}", sdk_zip.display());

    if !sdk_dir.join("libvosk.lib").exists() {
        let file = std::fs::File::open(&sdk_zip).expect("missing Vosk SDK zip");
        let mut archive = zip::ZipArchive::new(file).expect("invalid Vosk SDK zip");
        archive.extract(&extracted).expect("failed to extract Vosk SDK");
    }
    // vosk-sys links `vosk`; the SDK ships `libvosk.lib`.
    let _ = std::fs::copy(sdk_dir.join("libvosk.lib"), sdk_dir.join("vosk.lib"));

    println!("cargo:rustc-link-search=native={}", sdk_dir.display());
    println!("cargo:rustc-link-lib=dylib=vosk");

    let dlls = [
        "libvosk.dll",
        "libgcc_s_seh-1.dll",
        "libstdc++-6.dll",
        "libwinpthread-1.dll",
    ];
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        // target/<profile>/build/<pkg-hash>/out -> target/<profile>
        if let Some(profile_dir) = PathBuf::from(out_dir).ancestors().nth(3) {
            for dll in dlls {
                let _ = std::fs::copy(sdk_dir.join(dll), profile_dir.join(dll));
                // `cargo test` binaries live in `<profile>/deps`.
                let _ = std::fs::copy(sdk_dir.join(dll), profile_dir.join("deps").join(dll));
            }
        }
    }
}
