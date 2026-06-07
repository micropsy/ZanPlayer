// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;
use directories_next::ProjectDirs;
use flate2::read::GzDecoder;
use tar::Archive;
use zip::read::ZipArchive;
#[cfg(feature = "whisper")]
use whisper_rs::{WhisperContext, FullParams, SamplingStrategy};
#[cfg(feature = "whisper")]
use hound;


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

fn get_app_dir() -> PathBuf {
    let proj_dirs = ProjectDirs::from("com", "micropsy", "SubPlayer").expect("Failed to get app dir");
    proj_dirs.data_local_dir().to_path_buf()
}

#[tauri::command]
async fn download_ffmpeg(app: AppHandle) -> Result<String, String> {
    let app_dir = get_app_dir();
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let (url, filename) = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            (
                "https://evermeet.cx/pub/ffmpeg/ffmpeg-7.1.1-arm64.zip",
                "ffmpeg-macos-arm64.zip",
            )
        } else {
            (
                "https://evermeet.cx/pub/ffmpeg/ffmpeg-7.1.1-intel.zip",
                "ffmpeg-macos-x64.zip",
            )
        }
    } else if cfg!(target_os = "windows") {
        (
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
            "ffmpeg-windows.zip",
        )
    } else if cfg!(target_os = "linux") {
        (
            "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
            "ffmpeg-linux.tar.xz",
        )
    } else {
        return Err("Unsupported platform".to_string());
    };

    let zip_path = app_dir.join(filename);
    let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;

    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = futures_util::stream::TryStreamExt::try_next(&mut stream)
        .await
        .map_err(|e| e.to_string())?
    {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
    }

    let ffmpeg_path = app_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    let file = File::open(&zip_path).map_err(|e| e.to_string())?;

    if zip_path.extension().and_then(|s| s.to_str()) == Some("zip") {
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            if let Some(name) = entry.name().split('/').last() {
                if name == "ffmpeg" || name == "ffmpeg.exe" {
                    let mut out = File::create(&ffmpeg_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
                    break;
                }
            }
        }
    } else {
        let tar = GzDecoder::new(file);
        let mut archive = Archive::new(tar);
        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            if let Some(path) = entry.path().ok().and_then(|p| p.file_name()) {
                if path == "ffmpeg" {
                    let mut out = File::create(&ffmpeg_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
                    break;
                }
            }
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&ffmpeg_path)
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&ffmpeg_path, perms).map_err(|e| e.to_string())?;
    }

    std::fs::remove_file(zip_path).ok();

    Ok(ffmpeg_path.to_string_lossy().to_string())
}

#[tauri::command]
#[cfg(feature = "whisper")]
async fn download_whisper_model(app: AppHandle, model_name: String) -> Result<String, String> {
    let app_dir = get_app_dir();
    let models_dir = app_dir.join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let model_filename = format!("ggml-{}.bin", model_name);
    let model_path = models_dir.join(&model_filename);

    if model_path.exists() {
        return Ok(model_path.to_string_lossy().to_string());
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}?download=true",
        model_filename
    );

    let mut file = File::create(&model_path).map_err(|e| e.to_string())?;
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = futures_util::stream::TryStreamExt::try_next(&mut stream)
        .await
        .map_err(|e| e.to_string())?
    {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok(model_path.to_string_lossy().to_string())
}

#[tauri::command]
#[cfg(feature = "whisper")]
async fn transcribe_audio_local(
    app: AppHandle,
    audio_path: String,
    model_name: String,
    language: Option<String>,
) -> Result<Vec<SubtitleCue>, String> {
    let app_dir = get_app_dir();
    let models_dir = app_dir.join("models");
    let model_path = models_dir.join(format!("ggml-{}.bin", model_name));

    if !model_path.exists() {
        download_whisper_model(app, model_name).await?;
    }

    let ctx = WhisperContext::new(&model_path.to_string_lossy())
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
    params.set_single_segment(true);
    params.set_translate(false);
    params.set_language(language.as_deref());
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    state.full(params, &samples_f32).map_err(|e| e.to_string())?;

    let num_segments = state.full_n_segments();
    let mut cues = Vec::new();

    for i in 0..num_segments {
        let start = state.full_get_segment_t0(i) as f64 / 100.0;
        let end = state.full_get_segment_t1(i) as f64 / 100.0;
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
    let file_path = tauri_plugin_dialog::DialogBuilder::new()
        .add_filter("Video Files", &["mp4", "webm", "mkv", "avi", "mov", "m4v"])
        .pick_file(&app)
        .await
        .map(|path| {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            VideoFile {
                path: path.to_string_lossy().to_string(),
                name,
            }
        });
    Ok(file_path)
}

#[tauri::command]
async fn open_subtitle_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = tauri_plugin_dialog::DialogBuilder::new()
        .add_filter(
            "Subtitle Files",
            &["srt", "vtt", "ass", "ssa", "sub"],
        )
        .pick_file(&app)
        .await
        .map(|path| path.to_string_lossy().to_string());
    Ok(file_path)
}

#[tauri::command]
async fn save_subtitle_dialog(app: AppHandle, default_name: String) -> Result<Option<String>, String> {
    let file_path = tauri_plugin_dialog::DialogBuilder::new()
        .add_filter("SRT Files", &["srt"])
        .add_filter("VTT Files", &["vtt"])
        .add_filter("ASS Files", &["ass"])
        .set_file_name(default_name)
        .save_file(&app)
        .await
        .map(|path| path.to_string_lossy().to_string());
    Ok(file_path)
}

#[tauri::command]
async fn read_subtitle_file(file_path: String) -> Result<Vec<SubtitleCue>, String> {
    let mut content = String::new();
    File::open(file_path)
        .map_err(|e| e.to_string())?
        .read_to_string(&mut content)
        .map_err(|e| e.to_string())?;

    let extension = Path::new(&file_path)
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase());

    let cues = match extension.as_deref() {
        Some("srt") => parse_srt(&content),
        Some("vtt") => parse_vtt(&content),
        Some("ass") | Some("ssa") => parse_ass(&content),
        _ => Err(format!("Unsupported subtitle format")),
    };

    Ok(cues)
}

fn parse_srt(text: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let blocks = text.trim().split(/\n\n+/);

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
                    // Remove ASS tags like {\...}
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
    let parts: Vec<&str> = s.split(&sep).collect();
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
async fn extract_audio(
    app: AppHandle,
    video_path: String,
    output_dir: String,
) -> Result<String, String> {
    let app_dir = get_app_dir();
    let ffmpeg_path = app_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });

    if !ffmpeg_path.exists() {
        download_ffmpeg(app.clone()).await?;
    }

    let output_path = PathBuf::from(output_dir).join(format!(
        "extracted_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));

    let shell = app.shell();
    let sidecar = if ffmpeg_path.exists() {
        std::fs::copy(&ffmpeg_path, std::env::temp_dir().join(ffmpeg_path.file_name().unwrap())).unwrap();
        shell.sidecar(std::env::temp_dir().join(ffmpeg_path.file_name().unwrap()).to_str().unwrap())
    } else {
        shell.sidecar("ffmpeg")
    }.map_err(|e| format!("Failed to get FFmpeg: {}", e))?;

    let output = sidecar
        .args([
            "-i",
            &video_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| format!("FFmpeg failed: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_path::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
        open_video_dialog,
        open_subtitle_dialog,
        save_subtitle_dialog,
        read_subtitle_file,
        write_subtitle_file,
        extract_audio,
        download_ffmpeg,
        #[cfg(feature = "whisper")]
        download_whisper_model,
        #[cfg(feature = "whisper")]
        transcribe_audio_local,
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
