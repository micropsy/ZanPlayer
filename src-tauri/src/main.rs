// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

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

#[derive(serde::Deserialize, serde::Serialize)]
struct TranscriptionProgress {
    step: String,
    percent: u32,
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
        _ => Err(format!("Unsupported subtitle format"))?,
    };

    Ok(cues)
}

fn parse_srt(content: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let mut lines = content.lines().peekable();

    while let Some(line) = lines.next() {
        if line.trim().is_empty() {
            continue;
        }

        // Skip index number
        if line.parse::<u32>().is_err() {
            continue;
        }

        let time_line = lines.next().ok_or("Missing time line")?;
        let times = parse_srt_time(time_line)?;

        let mut text = String::new();
        while let Some(&l) = lines.peek() {
            if l.trim().is_empty() {
                break;
            }
            if l.parse::<u32>().is_ok() {
                let next_l = lines.next().unwrap_or("");
                if next_l.contains("-->") {
                    continue;
                }
                text.push_str(&format!("{}\n", next_l));
            } else {
                text.push_str(&format!("{}\n", lines.next().unwrap()));
            }
        }

        cues.push(SubtitleCue {
            id: uuid::Uuid::new_v4().to_string(),
            start_time: times.0,
            end_time: times.1,
            text: text.trim().to_string(),
        });
    }

    Ok(cues)
}

fn parse_srt_time(line: &str) -> Result<(f64, f64), String> {
    let parts: Vec<&str> = line.split("-->").map(|s| s.trim()).collect();
    if parts.len() != 2 {
        return Err(format!("Invalid time line: {}", line));
    }

    let start = parse_time_str(parts[0], true)?;
    let end = parse_time_str(parts[1], true)?;
    Ok((start, end))
}

fn parse_vtt(content: &str) -> Result<Vec<SubtitleCue>, String> {
    let mut cues = Vec::new();
    let mut lines = content.lines().skip_while(|l| !l.trim().is_empty()).peekable();

    while let Some(line) = lines.next() {
        if line.trim().is_empty() {
            continue;
        }

        if line.contains("-->") {
            let times = parse_srt_time(line)?;

            let mut text = String::new();
            while let Some(&l) = lines.peek() {
                if l.trim().is_empty() || l.contains("-->") {
                    break;
                }
                text.push_str(&format!("{}\n", lines.next().unwrap()));
            }

            cues.push(SubtitleCue {
                id: uuid::Uuid::new_v4().to_string(),
                start_time: times.0,
                end_time: times.1,
                text: text.trim().to_string(),
            });
        }
    }

    Ok(cues)
}

fn parse_time_str(time_str: &str, is_srt: bool) -> Result<f64, String> {
    let time_str = time_str.replace(',", ".");
    let parts: Vec<&str> = time_str.split(':').collect();
    match parts.as_slice() {
        [h, m, s] => {
            let hours = h.parse::<f64>().map_err(|e| e.to_string())?;
            let minutes = m.parse::<f64>().map_err(|e| e.to_string())?;
            let seconds = s.parse::<f64>().map_err(|e| e.to_string())?;
            Ok(hours * 3600.0 + minutes * 60.0 + seconds)
        }
        [m, s] => {
            let minutes = m.parse::<f64>().map_err(|e| e.to_string())?;
            let seconds = s.parse::<f64>().map_err(|e| e.to_string())?;
            Ok(minutes * 60.0 + seconds)
        }
        _ => Err(format!("Invalid time format: {}", time_str)),
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
    let output_path = PathBuf::from(output_dir).join(format!(
        "extracted_{}.wav",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));

    let shell = app.shell();
    let sidecar = shell
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to get FFmpeg: {}", e))?;

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
            output_path.to_str().ok_or("Invalid path")?,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
