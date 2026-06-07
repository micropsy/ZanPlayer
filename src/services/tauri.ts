import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { readBinaryFile } from "@tauri-apps/plugin-fs";
import type { SubtitleCue } from "../types/subtitle";

interface VideoFile {
  path: string;
  name: string;
}

export class TauriService {
  static async openVideoDialog(): Promise<VideoFile | null> {
    return await invoke<VideoFile | null>("open_video_dialog");
  }

  static async openSubtitleDialog(): Promise<string | null> {
    return await invoke<string | null>("open_subtitle_dialog");
  }

  static async saveSubtitleDialog(defaultName: string): Promise<string | null> {
    return await invoke<string | null>("save_subtitle_dialog", {
      defaultName,
    });
  }

  static async readSubtitleFile(filePath: string): Promise<SubtitleCue[]> {
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

  static async extractAudio(videoPath: string): Promise<string> {
    const home = await homeDir();
    return await invoke<string>("extract_audio", {
      videoPath,
      outputDir: home,
    });
  }

  static async readFileAsBlob(filePath: string): Promise<Blob> {
    const binaryData = await readBinaryFile(filePath);
    return new Blob([binaryData], { type: "audio/wav" });
  }
}
