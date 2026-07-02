import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import type { SubtitleCue } from "../types/subtitle";

interface VideoFile {
  path: string;
  name: string;
}

// Check if we're running in a Tauri environment
export const isTauri = () => {
  return true;
};

export class TauriService {
  static async openVideoDialog(): Promise<VideoFile | null> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    return await invoke<VideoFile | null>("open_video_dialog");
  }

  static async openSubtitleDialog(): Promise<string | null> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    return await invoke<string | null>("open_subtitle_dialog");
  }

  static async saveSubtitleDialog(defaultName: string): Promise<string | null> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    return await invoke<string | null>("save_subtitle_dialog", {
      defaultName,
    });
  }

  static async readSubtitleFile(filePath: string): Promise<SubtitleCue[]> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const cues = await invoke<Array<{ id: string; start_time: number; end_time: number; text: string }>>("read_subtitle_file", {
      filePath,
    });
    return cues.map((c) => ({
      id: c.id,
      startTime: c.start_time,
      endTime: c.end_time,
      text: c.text,
    }));
  }

  static async writeSubtitleFile(
    filePath: string,
    cues: SubtitleCue[],
    format: string
  ): Promise<void> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const backendCues = cues.map((c) => ({
      id: c.id,
      start_time: c.startTime,
      end_time: c.endTime,
      text: c.text,
    }));
    await invoke("write_subtitle_file", {
      filePath,
      cues: backendCues,
      format,
    });
  }

  static async writeFile(
    fileName: string,
    fileData: Uint8Array
  ): Promise<string> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const home = await homeDir();
    return await invoke<string>("write_file", {
      fileName,
      fileData: Array.from(fileData),
      outputDir: home,
    });
  }

  static async extractAudio(videoPath: string): Promise<string> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const home = await homeDir();
    return await invoke<string>("extract_audio", {
      videoPath,
      outputDir: home,
    });
  }

  static async readFileAsBlob(filePath: string): Promise<Blob> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const binaryData = await readFile(filePath);
    return new Blob([binaryData], { type: "audio/wav" });
  }

  static async transcribeAudioLocal(
    audioPath: string,
    modelName: string,
    language?: string,
    targetLanguage?: string
  ): Promise<SubtitleCue[]> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const cues = await invoke<
      Array<{ id: string; start_time: number; end_time: number; text: string }>
    >("transcribe_audio_local", {
      audioPath,
      modelName,
      language,
      targetLanguage,
    });
    return cues.map((c) => ({
      id: c.id,
      startTime: c.start_time,
      endTime: c.end_time,
      text: c.text,
    }));
  }

  static async downloadWhisperModel(
    modelName: string,
    onProgress?: (percent: number, speedMBps: number, etaSeconds: number) => void
  ): Promise<string> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }

    let unlisten: (() => void) | null = null;
    if (onProgress) {
      unlisten = await listen<{
            modelName: string;
            percent: number;
            speedMBps: number;
            etaSeconds: number;
        }>("model-download-progress", (event: { payload: {
            modelName: string;
            percent: number;
            speedMBps: number;
            etaSeconds: number;
        } }) => {
        if (event.payload.modelName === modelName && onProgress) {
          onProgress(
            event.payload.percent,
            event.payload.speedMBps,
            event.payload.etaSeconds
          );
        }
      });
    }

    try {
      return await invoke<string>("download_whisper_model", { modelName });
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }

  static async deleteWhisperModel(modelName: string): Promise<void> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    await invoke<void>("delete_whisper_model", { modelName });
  }

  static async listDownloadedModels(): Promise<string[]> {
    if (!isTauri()) {
      return [];
    }
    return await invoke<string[]>("list_downloaded_models");
  }

  static async checkModelDownloaded(modelName: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    return await invoke<boolean>("checkModelDownloaded", { modelName });
  }

  static async getVideoBlobUrl(filePath: string): Promise<string> {
    if (!isTauri()) {
      throw new Error("This feature requires the Tauri app");
    }
    const fileData = await readFile(filePath);
    const blob = new Blob([fileData], { type: "video/mp4" });
    return URL.createObjectURL(blob);
  }
}
