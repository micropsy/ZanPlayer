// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use directories_next::ProjectDirs;
#[cfg(feature = "whisper")]
use whisper_rs::{WhisperContext, FullParams, SamplingStrategy, WhisperContextParameters, SegmentCallbackData};
#[cfg(feature = "whisper")]
use hound;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

#[derive(serde::Deserialize, serde::Serialize)]
struct VideoFile {
    path: String,
    name: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct SubtitleCue {
    id: String,
    start_time: f64,
    end_time: f64,
    text: String,
}

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    #[serde(rename = "modelName")]
    model_name: String,
    percent: f64,
    #[serde(rename = "speedMBps")]
    speed_mb_per_sec: f64,
    #[serde(rename = "etaSeconds")]
    eta_seconds: u64,
}

fn get_app_dir() -> PathBuf {
    let proj_dirs = ProjectDirs::from("com", "micropsy", "ZanPlayer").expect("Failed to get app dir");
    proj_dirs.data_local_dir().to_path_buf()
}

// whisper.cpp ships the large model as `large-v3`, not plain `large`
fn model_filename(model_name: &str) -> String {
    let lower = model_name.to_lowercase();
    if lower == "large" {
        "ggml-large-v3.bin".to_string()
    } else {
        format!("ggml-{}.bin", lower)
    }
}

#[tauri::command]
async fn download_whisper_model(app: AppHandle, model_name: String) -> Result<String, String> {
    #[cfg(feature = "whisper")]
    {
        let app_dir = get_app_dir();
        let models_dir = app_dir.join("models");
        std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

        let lower_name = model_name.to_lowercase();
        let model_filename = model_filename(&lower_name);
        let model_path = models_dir.join(&model_filename);
        let part_path = models_dir.join(format!("{}.part", model_filename));

        if model_path.exists() {
            return Ok(model_path.to_string_lossy().to_string());
        }

        let url = format!(
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}?download=true",
            model_filename
        );

        let client = reqwest::Client::builder()
            .user_agent("ZanPlayer/1.0 (macOS)")
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;

        let result = download_and_save(&client, &url, &part_path, &model_path, &app, &lower_name).await;
        if result.is_err() {
            std::fs::remove_file(&part_path).ok();
        }
        result
    }
    #[cfg(not(feature = "whisper"))]
    Err("Whisper feature is not enabled".to_string())
}

#[cfg(feature = "whisper")]
async fn download_and_save(
    client: &reqwest::Client,
    url: &str,
    part_path: &Path,
    model_path: &Path,
    app: &AppHandle,
    model_name: &str,
) -> Result<String, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }
    let content_length = response.content_length().unwrap_or(0);

    let mut file = File::create(part_path).map_err(|e| format!("Failed to create model file: {}", e))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_update = std::time::Instant::now();
    let mut last_downloaded = 0;

    while let Some(chunk) = futures_util::TryStreamExt::try_next(&mut stream).await.map_err(|e| format!("Failed to read model chunk: {}", e))? {
        file.write_all(&chunk).map_err(|e| format!("Failed to write model chunk: {}", e))?;
        downloaded += chunk.len() as u64;

        // Update progress every 100ms
        let now = std::time::Instant::now();
        if now.duration_since(last_update) >= std::time::Duration::from_millis(100) {
            let time_since_last = now.duration_since(last_update).as_secs_f64();
            let downloaded_since_last = downloaded - last_downloaded;
            let speed_bytes_per_sec = if time_since_last > 0.0 { downloaded_since_last as f64 / time_since_last } else { 0.0 };
            let speed_mb_per_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
            let percent = if content_length > 0 {
                (downloaded as f64 / content_length as f64) * 100.0
            } else {
                0.0
            };
            let eta_seconds = if speed_bytes_per_sec > 0.0 && content_length > 0 {
                ((content_length - downloaded) as f64 / speed_bytes_per_sec) as u64
            } else {
                0
            };

            app.emit("model-download-progress", ProgressPayload {
                model_name: model_name.to_string(),
                percent,
                speed_mb_per_sec,
                eta_seconds,
            }).ok();

            last_update = now;
            last_downloaded = downloaded;
        }
    }

    // Verify download size
    if content_length > 0 && downloaded != content_length {
        return Err(format!("Model download incomplete: expected {} bytes, got {}", content_length, downloaded));
    }

    drop(file); // Close file to ensure it's flushed
    std::fs::rename(part_path, model_path).map_err(|e| format!("Failed to finalize model file: {}", e))?;

    Ok(model_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_whisper_model(model_name: String) -> Result<(), String> {
    #[cfg(feature = "whisper")]
    {
        let app_dir = get_app_dir();
        let models_dir = app_dir.join("models");
        let model_filename = model_filename(&model_name);
        let model_path = models_dir.join(&model_filename);

        if model_path.exists() {
            std::fs::remove_file(model_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn list_downloaded_models() -> Result<Vec<String>, String> {
    #[cfg(feature = "whisper")]
    {
        let app_dir = get_app_dir();
        let models_dir = app_dir.join("models");
        let mut models = Vec::new();

        if models_dir.exists() {
            for entry in std::fs::read_dir(models_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext == "bin" {
                        if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                            if filename.starts_with("ggml-") && filename.ends_with(".bin") {
                                let mut model_name = filename.strip_prefix("ggml-").unwrap_or(filename).strip_suffix(".bin").unwrap_or(filename).to_string();
                                if model_name == "large-v3" {
                                    model_name = "large".to_string();
                                }
                                models.push(model_name);
                            }
                        }
                    }
                }
            }
        }

        Ok(models)
    }
    #[cfg(not(feature = "whisper"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
async fn check_model_downloaded(model_name: String) -> Result<bool, String> {
    #[cfg(feature = "whisper")]
    {
        let app_dir = get_app_dir();
        let models_dir = app_dir.join("models");
        let model_filename = model_filename(&model_name);
        let model_path = models_dir.join(&model_filename);
        Ok(model_path.exists())
    }
    #[cfg(not(feature = "whisper"))]
    {
        Ok(false)
    }
}

const NLLB_FILES: &[(&str, &str)] = &[
    ("config.json", "config.json"),
    ("generation_config.json", "generation_config.json"),
    ("tokenizer.json", "tokenizer.json"),
    ("tokenizer_config.json", "tokenizer_config.json"),
    ("special_tokens_map.json", "special_tokens_map.json"),
    ("onnx/encoder_model_quantized.onnx", "onnx/encoder_model_quantized.onnx"),
    ("onnx/decoder_model_merged_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"),
];

const NLLB_BASE_URL: &str =
    "https://huggingface.co/Xenova/nllb-200-distilled-600M/resolve/main";

#[derive(Clone, serde::Serialize)]
struct NllbProgressPayload {
    file: String,
    percent: f64,
    #[serde(rename = "speedMBps")]
    speed_mb_per_sec: f64,
    #[serde(rename = "etaSeconds")]
    eta_seconds: u64,
    #[serde(rename = "fileBytes")]
    file_bytes: u64,
    #[serde(rename = "fileDone")]
    file_done: u64,
}

#[derive(Clone, serde::Serialize)]
struct TranscriptionProgress {
    percentage: f64,
}

#[derive(Clone, serde::Serialize)]
struct TranscriptionChunk {
    id: String,
    #[serde(rename = "start_time")]
    start_time: f64,
    #[serde(rename = "end_time")]
    end_time: f64,
    text: String,
}

// NLLB model lives in Tauri's *scoped* app data dir so that the frontend's
// plugin-fs `readFile` (used to warm the translation Cache API) is allowed.
// Resolving with `app.path()` keeps this in sync with the `$APPDATA`/`$APPLOCALDATA`
// scope that `fs:default` + `fs:allow-app-*-recursive` grant to the webview.
fn nllb_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(base.join("nllb-200"))
}

fn nllb_model_ready(dir: &Path) -> bool {
    NLLB_FILES.iter().all(|(rel, _)| dir.join(rel).exists())
}

#[tauri::command]
async fn is_translation_model_downloaded(app: AppHandle) -> Result<bool, String> {
    let dir = nllb_model_dir(&app)?;
    Ok(nllb_model_ready(&dir))
}

#[tauri::command]
async fn get_translation_model_path(app: AppHandle) -> Result<String, String> {
    let dir = nllb_model_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_nllb_model(app: AppHandle) -> Result<String, String> {
    let dir = nllb_model_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    if nllb_model_ready(&dir) {
        return Ok(dir.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("ZanPlayer/1.0 (macOS)")
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    for (rel_path, url_path) in NLLB_FILES {
        let final_path = dir.join(rel_path);
        if final_path.exists() {
            continue;
        }
        if let Some(parent) = final_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let part_path = dir.join(format!("{}.part", rel_path.replace('/', "__")));
        let url = format!("{}/{}", NLLB_BASE_URL, url_path);

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to download translation model: {}", e))?;
        if !response.status().is_success() {
            return Err(format!("Download failed: HTTP {}", response.status()));
        }
        let content_length = response.content_length().unwrap_or(0);
        let file_name = rel_path.to_string();

        let mut file = File::create(&part_path)
            .map_err(|e| format!("Failed to create model file: {}", e))?;
        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_update = std::time::Instant::now();
        let mut last_downloaded = 0;

        while let Some(chunk) = futures_util::TryStreamExt::try_next(&mut stream)
            .await
            .map_err(|e| format!("Failed to read model chunk: {}", e))?
        {
            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write model chunk: {}", e))?;
            downloaded += chunk.len() as u64;

            let now = std::time::Instant::now();
            if now.duration_since(last_update) >= std::time::Duration::from_millis(100) {
                let elapsed = now.duration_since(last_update).as_secs_f64();
                let speed_bytes_per_sec =
                    if elapsed > 0.0 { (downloaded - last_downloaded) as f64 / elapsed } else { 0.0 };
                let percent = if content_length > 0 {
                    (downloaded as f64 / content_length as f64) * 100.0
                } else {
                    0.0
                };
                let eta_seconds = if speed_bytes_per_sec > 0.0 && content_length > 0 {
                    ((content_length - downloaded) as f64 / speed_bytes_per_sec) as u64
                } else {
                    0
                };
                app.emit(
                    "nllb-download-progress",
                    NllbProgressPayload {
                        file: file_name.clone(),
                        percent,
                        speed_mb_per_sec: speed_bytes_per_sec / (1024.0 * 1024.0),
                        eta_seconds,
                        file_bytes: content_length,
                        file_done: downloaded,
                    },
                )
                .ok();
                last_update = now;
                last_downloaded = downloaded;
            }
        }

        if content_length > 0 && downloaded != content_length {
            std::fs::remove_file(&part_path).ok();
            return Err(format!(
                "Model download incomplete: expected {} bytes, got {}",
                content_length, downloaded
            ));
        }

        drop(file);
        std::fs::rename(&part_path, &final_path)
            .map_err(|e| format!("Failed to finalize model file: {}", e))?;
    }

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_translation_model(app: AppHandle) -> Result<(), String> {
    let dir = nllb_model_dir(&app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(feature = "whisper")]
async fn transcribe_audio_local(
    app: AppHandle,
    audio_path: String,
    model_name: String,
    language: Option<String>,
    target_language: Option<String>,
) -> Result<Vec<SubtitleCue>, String> {
    let app_dir = get_app_dir();
    let models_dir = app_dir.join("models");
    let model_path = models_dir.join(model_filename(&model_name));

    if !model_path.exists() {
        download_whisper_model(app.clone(), model_name).await?;
    }

    // Serialize all Whisper decoding sessions (whisper.cpp/ggml is not safe for two
    // concurrent `whisper_full_with_state` calls). Dropping a new video while a previous
    // transcription is still finalizing would otherwise start a second session in parallel,
    // and the callback user_data pointers (leaked boxes, stable for the whole process)
    // must never be dereferenced while two sessions are live. The guard is acquired after
    // the only `.await` in this function and held across purely synchronous Whisper calls,
    // so it never blocks a tokio runtime thread mid-poll.
    static TRANSCRIPTION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _transcription_guard = TRANSCRIPTION_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(&model_path.to_string_lossy(), params)
        .map_err(|e| format!("Failed to load Whisper model: {}", e))?;

    let mut reader = hound::WavReader::open(audio_path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;

    let spec = reader.spec();
    if spec.sample_rate != 16000 || spec.channels != 1 || spec.bits_per_sample != 16 {
        return Err("Audio file must be 16kHz, mono, 16-bit PCM WAV".to_string());
    }

    let samples: Vec<i16> = reader.samples().map(|s| s.unwrap()).collect();
    let samples_f32: Vec<f32> = samples.iter().map(|&x| x as f32 / i16::MAX as f32).collect();

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_single_segment(false);
    // Set translate to true if target_language is "en" (Whisper only supports translating to English)
    params.set_translate(target_language.as_deref() == Some("en"));
    params.set_language(language.as_deref());
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // The callbacks below are attached LAST, immediately before `state.full(...)`.
    // Once attached, `params` must NOT be moved/reassigned: whisper.cpp copies the
    // callback `user_data` raw pointers out of this struct, so every closure they
    // reference must live in a stable (heap) location for the duration of decoding.

    // Progress callback. NOTE: whisper-rs 0.12's `set_progress_callback_safe` stores
    // a pointer to a *stack local* closure and then moves that closure into a heap Box,
    // leaving the registered `user_data` pointer dangling once the setter returns. When
    // whisper.cpp fires the trampoline during `whisper_full_with_state`, the callback
    // reads garbage stack memory and crashes (EXC_ARM_DA_ALIGN / pointer-auth failure on
    // Apple Silicon). We therefore register the C callback manually with a leaked heap
    // Box whose address stays valid for the whole process, mirroring how whisper-rs's
    // own `set_segment_callback_safe` keeps its closure alive via `Box::into_raw`.
    let app_progress = app.clone();
    let progress_closure: Box<dyn FnMut(i32) + Send + 'static> = Box::new(move |percent: i32| {
        let _ = app_progress.emit(
            "transcription-progress",
            TranscriptionProgress {
                percentage: f64::from(percent.clamp(0, 100)),
            },
        );
    });
    let progress_user_data = Box::into_raw(progress_closure) as *mut std::ffi::c_void;

    unsafe extern "C" fn progress_trampoline(
        _ctx: *mut whisper_rs::WhisperSysContext,
        _state: *mut whisper_rs::WhisperSysState,
        progress: std::os::raw::c_int,
        user_data: *mut std::ffi::c_void,
    ) {
        let closure: &mut Box<dyn FnMut(i32) + Send + 'static> =
            &mut *(user_data as *mut _);
        closure(progress);
    }

    // Streaming: whisper.cpp invokes this as each decoded segment is finalized
    // DURING decoding, so the frontend can append cues and unblock playback
    // without waiting for the full transcription to finish.
    let app_segment = app.clone();
    params.set_segment_callback_safe(move |seg: SegmentCallbackData| {
        if seg.text.trim().is_empty() {
            return;
        }
        let _ = app_segment.emit(
            "transcription-chunk",
            TranscriptionChunk {
                id: uuid::Uuid::new_v4().to_string(),
                start_time: seg.start_timestamp as f64 / 100.0,
                end_time: seg.end_timestamp as f64 / 100.0,
                text: seg.text,
            },
        );
    });

    // Attach the progress callback right before running the model, never later
    // (the struct must not be reallotted once these raw pointers are in place).
    unsafe {
        params.set_progress_callback(Some(progress_trampoline));
        params.set_progress_callback_user_data(progress_user_data);
    }

    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    state.full(params, &samples_f32).map_err(|e| e.to_string())?;

    // Guarantee the overlay snaps to completion once decoding finishes.
    let _ = app.emit(
        "transcription-progress",
        TranscriptionProgress { percentage: 100.0 },
    );

    let num_segments = state.full_n_segments().map_err(|e| e.to_string())?;
    let mut cues = Vec::new();
    for i in 0..num_segments {
        let start = state.full_get_segment_t0(i).map_err(|e| e.to_string())? as f64 / 100.0;
        let end = state.full_get_segment_t1(i).map_err(|e| e.to_string())? as f64 / 100.0;
        let text = state.full_get_segment_text(i).map_err(|e| e.to_string())?;

        if text.trim().is_empty() {
            continue;
        }

        cues.push(SubtitleCue {
            id: uuid::Uuid::new_v4().to_string(),
            start_time: start,
            end_time: end,
            text,
        });
    }

    Ok(cues)
}

#[tauri::command]
async fn open_video_dialog(app: AppHandle) -> Result<Option<VideoFile>, String> {
    let file_path = app.dialog().file()
        .add_filter("Video Files", &["mp4", "webm", "mkv", "avi", "mov", "m4v"])
        .blocking_pick_file();

    let video_file = file_path.map(|p| {
        let path_buf = p.into_path().unwrap();
        let name = path_buf
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        VideoFile {
            path: path_buf.to_string_lossy().to_string(),
            name,
        }
    });

    Ok(video_file)
}

#[tauri::command]
async fn open_subtitle_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = app.dialog().file()
        .add_filter("Subtitle Files", &["srt", "vtt", "ass", "ssa", "sub"])
        .blocking_pick_file();

    let file_str = file_path.map(|p| p.into_path().unwrap().to_string_lossy().to_string());
    Ok(file_str)
}

#[tauri::command]
async fn save_subtitle_dialog(app: AppHandle, default_name: String) -> Result<Option<String>, String> {
    let file_path = app.dialog().file()
        .add_filter("SRT Files", &["srt"])
        .add_filter("VTT Files", &["vtt"])
        .add_filter("ASS Files", &["ass"])
        .set_file_name(default_name)
        .blocking_save_file();

    let file_str = file_path.map(|p| p.into_path().unwrap().to_string_lossy().to_string());
    Ok(file_str)
}

#[tauri::command]
async fn read_subtitle_file(file_path: String) -> Result<Vec<SubtitleCue>, String> {
    let mut content = String::new();
    File::open(&file_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;

    let extension = Path::new(&file_path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase());

    let cues = match extension.as_deref() {
        Some("srt") => parse_srt(&content)?,
        Some("vtt") => parse_vtt(&content)?,
        Some("ass") | Some("ssa") => parse_ass(&content)?,
        _ => Err(format!("Unsupported subtitle format"))?,
    };

    Ok(cues)
}

fn parse_srt(text: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let blocks: Vec<&str> = text.trim().split("\n\n").collect();

    for block in blocks {
        let lines: Vec<&str> = block.lines().collect();
        if lines.len() >= 3 {
            let time_line = lines[1];
            if let Some((start, end)) = parse_time_line(time_line, ',') {
                let text = lines[2..].join("\n");
                cues.push(SubtitleCue {
                    id: uuid::Uuid::new_v4().to_string(),
                    start_time: start,
                    end_time: end,
                    text,
                });
            }
        }
    }

    Ok(cues)
}

fn parse_vtt(text: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let lines: Vec<&str> = text.lines().collect();
    let mut i = 0;

    while i < lines.len() && !lines[i].contains("-->") {
        i += 1;
    }

    while i < lines.len() {
        if lines[i].contains("-->") {
            if let Some((start, end)) = parse_time_line(lines[i], '.') {
                i += 1;
                let mut text = String::new();
                while i < lines.len() && !lines[i].is_empty() && !lines[i].contains("-->") {
                    text += &format!("\n{}", lines[i]);
                    i += 1;
                }
                cues.push(SubtitleCue {
                    id: uuid::Uuid::new_v4().to_string(),
                    start_time: start,
                    end_time: end,
                    text: text.trim_start().to_string(),
                });
            }
        }
        i += 1;
    }

    Ok(cues)
}

fn parse_ass(text: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let mut format = None;

    for line in text.lines() {
        if let Some(line) = line.strip_prefix("Format:") {
            format = Some(
                line.split(',')
                    .map(|s| s.trim().to_string())
                    .collect::<Vec<_>>(),
            );
        } else if let Some(line) = line.strip_prefix("Dialogue:") {
            if let Some(fmt) = &format {
                let parts: Vec<&str> = line.splitn(fmt.len(), ',').collect();
                let start_idx = fmt.iter().position(|s| s == "Start");
                let end_idx = fmt.iter().position(|s| s == "End");
                let text_idx = fmt.iter().position(|s| s == "Text");

                if let (Some(si), Some(ei), Some(ti)) = (start_idx, end_idx, text_idx) {
                    let start = parse_ass_time(parts.get(si).unwrap_or(&""))?;
                    let end = parse_ass_time(parts.get(ei).unwrap_or(&""))?;
                    let mut text = parts.get(ti).unwrap_or(&"").to_string();
                    text = text.replace(r"\N", "\n");
                    text = regex::Regex::new(r"\{.*?\}")
                        .unwrap_or_else(|_| regex::Regex::new(r"").unwrap())
                        .replace_all(&text, "")
                        .to_string();

                    cues.push(SubtitleCue {
                        id: uuid::Uuid::new_v4().to_string(),
                        start_time: start,
                        end_time: end,
                        text,
                    });
                }
            }
        }
    }

    Ok(cues)
}

fn parse_ass_time(s: &str) -> Result<f64, String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() >= 3 {
        let h = parts[0].parse::<f64>().map_err(|e| e.to_string())?;
        let m = parts[1].parse::<f64>().map_err(|e| e.to_string())?;
        let s = parts[2].parse::<f64>().map_err(|e| e.to_string())?;
        Ok(h * 3600.0 + m * 60.0 + s)
    } else {
        Err("Invalid ASS time format".to_string())
    }
}

fn parse_time_line(line: &str, sep: char) -> Option<(f64, f64)> {
    let parts: Vec<&str> = line.split("-->").collect();
    if parts.len() == 2 {
        if let (Ok(start), Ok(end)) = (parse_time_str(parts[0].trim(), sep), parse_time_str(parts[1].trim(), sep)) {
            return Some((start, end));
        }
    }
    None
}

fn parse_time_str(s: &str, sep: char) -> Result<f64, String> {
    let parts: Vec<&str> = s.split(sep).collect();
    if parts.len() >= 2 {
        let time_part = parts[0];
        let frac_part = parts[1].chars().take(3).collect::<String>();
        let frac = frac_part.parse::<f64>().unwrap_or(0.0) / 1000.0;
        let hms: Vec<&str> = time_part.split(':').collect();
        let mut total = 0.0;
        if hms.len() == 3 {
            total += hms[0].parse::<f64>().map_err(|e| e.to_string())? * 3600.0;
            total += hms[1].parse::<f64>().map_err(|e| e.to_string())? * 60.0;
            total += hms[2].parse::<f64>().map_err(|e| e.to_string())?;
        } else if hms.len() == 2 {
            total += hms[0].parse::<f64>().map_err(|e| e.to_string())? * 60.0;
            total += hms[1].parse::<f64>().map_err(|e| e.to_string())?;
        }
        Ok(total + frac)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
async fn write_subtitle_file(
    file_path: String,
    cues: Vec<SubtitleCue>,
    format: String,
) -> Result<(), String> {
    let content = match format.to_lowercase().as_str() {
        "srt" => export_srt(cues),
        "vtt" => export_vtt(cues),
        "ass" => export_ass(cues),
        _ => Err(format!("Unsupported format: {}", format))?,
    };

    let mut file = File::create(file_path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn export_srt(cues: Vec<SubtitleCue>) -> String {
    let mut content = String::new();
    for (i, cue) in cues.iter().enumerate() {
        content.push_str(&format!("{}\n", i + 1));
        content.push_str(&format_time(cue.start_time, true));
        content.push_str(" --> ");
        content.push_str(&format_time(cue.end_time, true));
        content.push('\n');
        content.push_str(&cue.text);
        content.push_str("\n\n");
    }
    content
}

fn export_vtt(cues: Vec<SubtitleCue>) -> String {
    let mut content = "WEBVTT\n\n".to_string();
    for cue in cues {
        content.push_str(&format_time(cue.start_time, false));
        content.push_str(" --> ");
        content.push_str(&format_time(cue.end_time, false));
        content.push('\n');
        content.push_str(&cue.text);
        content.push_str("\n\n");
    }
    content
}

fn export_ass(cues: Vec<SubtitleCue>) -> String {
    let mut content = "[Script Info]
Title: Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
".to_string();

    for cue in cues {
        let start = format_ass_time(cue.start_time);
        let end = format_ass_time(cue.end_time);
        let text = cue.text.replace('\n', r"\N");
        content.push_str(&format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,{}\n",
            start, end, text
        ));
    }

    content
}

fn format_ass_time(seconds: f64) -> String {
    let h = (seconds / 3600.0) as i32;
    let m = ((seconds % 3600.0) / 60.0) as i32;
    let s = seconds % 60.0;
    format!("{}:{:02}:{:05.2}", h, m, s)
}

fn format_time(seconds: f64, is_srt: bool) -> String {
    let hours = (seconds / 3600.0) as u32;
    let minutes = ((seconds % 3600.0) / 60.0) as u32;
    let secs = (seconds % 60.0) as u32;
    let ms = ((seconds % 1.0) * 1000.0) as u32;
    if is_srt {
        format!(
            "{:02}:{:02}:{:02},{:03}",
            hours, minutes, secs, ms
        )
    } else {
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            hours, minutes, secs, ms
        )
    }
}

#[tauri::command]
async fn write_file(
    _app: AppHandle,
    file_name: String,
    file_data: Vec<u8>,
    output_dir: String,
) -> Result<String, String> {
    let output_path = PathBuf::from(output_dir).join(format!(
        "{}_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        file_name
    ));

    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    file.write_all(&file_data).map_err(|e| e.to_string())?;

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn extract_audio(
    app: AppHandle,
    video_path: String,
    output_dir: String,
) -> Result<String, String> {
    let output_path = std::path::PathBuf::from(output_dir).join(format!(
        "extracted_{}.wav",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()
    ));
    let sidecar_command = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?;
    let output = sidecar_command
        .args(["-i", &video_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y", output_path.to_str().unwrap()])
        .output().await.map_err(|e| format!("FFmpeg execution failed: {}", e))?;
    if !output.status.success() {
        return Err(format!("FFmpeg error: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
#[cfg(feature = "whisper")]
async fn process_dropped_video(
    app: AppHandle,
    video_path: String,
    model_name: String,
    language: Option<String>,
    target_language: Option<String>,
) -> Result<Vec<SubtitleCue>, String> {
    let temp_dir = std::env::temp_dir();

    // Step 1: extract 16kHz mono WAV via the bundled FFmpeg sidecar
    let wav_path = extract_audio(
        app.clone(),
        video_path,
        temp_dir.to_string_lossy().to_string(),
    )
    .await?;

    // Step 2: transcribe the extracted WAV
    let result = transcribe_audio_local(
        app,
        wav_path.clone(),
        model_name,
        language,
        target_language,
    )
    .await;

    // Step 3: clean up the temporary WAV file
    std::fs::remove_file(&wav_path).ok();

    result
}

#[tauri::command]
fn relaunch_app(app: AppHandle) {
    tauri::process::restart(&app.env());
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_video_dialog,
            open_subtitle_dialog,
            save_subtitle_dialog,
            read_subtitle_file,
            write_subtitle_file,
            write_file,
            extract_audio,
            process_dropped_video,
            download_whisper_model,
            transcribe_audio_local,
            delete_whisper_model,
            list_downloaded_models,
            check_model_downloaded,
            download_nllb_model,
            is_translation_model_downloaded,
            get_translation_model_path,
            delete_translation_model,
            relaunch_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
