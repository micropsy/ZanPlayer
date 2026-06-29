import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleTrack, SubtitleCue } from "../types/subtitle";
import { TauriService } from "./tauri";

export type SubtitleDisplayMode = "original" | "translated" | "dual";
export type ProgressStep = "idle" | "saving" | "extracting" | "transcribing";

export interface SubtitleStyle {
    fontName: string;
    fontSize: number;
    primaryColor: string;
    outlineColor: string;
    backColor: string;
    bold: boolean;
    italic: boolean;
    alignment: "bottom" | "top";
}

interface AppState {
    currentVideo: File | null;
    setCurrentVideo: (video: File | null) => void;
    currentVideoUrl: string | null;
    setCurrentVideoUrl: (url: string | null) => void;
    currentVideoPath: string | null;
    setCurrentVideoPath: (path: string | null) => void;
    subtitleTracks: SubtitleTrack[];
    setSubtitleTracks: (tracks: SubtitleTrack[]) => void;
    activeSubtitleTrackId: string | null;
    setActiveSubtitleTrackId: (id: string | null) => void;
    activeTranslatedTrackId: string | null;
    setActiveTranslatedTrackId: (id: string | null) => void;
    subtitleDisplayMode: SubtitleDisplayMode;
    setSubtitleDisplayMode: (mode: SubtitleDisplayMode) => void;
    currentTime: number;
    setCurrentTime: (time: number) => void;
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    updateCue: (trackId: string, cueId: string, newText: string) => void;
    updateCueTiming: (trackId: string, cueId: string, startTime: number, endTime: number) => void;
    shiftAllCues: (trackId: string, offset: number) => void;
    deleteCue: (trackId: string, cueId: string) => void;
    addCue: (trackId: string, cue: SubtitleCue) => void;

    // Progress
    progressStep: ProgressStep;
    progressPercent: number;
    setProgress: (step: ProgressStep, percent: number) => void;

    // Seek
    seekTo: number | null;
    setSeekTo: (time: number | null) => void;

    // Settings
    theme: "dark" | "light";
    setTheme: (theme: "dark" | "light") => void;
    useLocalWhisper: boolean;
    setUseLocalWhisper: (use: boolean) => void;
    whisperModel: string;
    setWhisperModel: (model: string) => void;

    // Model management
    downloadedModels: string[];
    setDownloadedModels: (models: string[]) => void;
    downloadingModels: Set<string>;
    setDownloadingModels: (models: Set<string>) => void;
    loadDownloadedModels: () => Promise<void>;
    downloadModel: (modelName: string) => Promise<void>;
    deleteModel: (modelName: string) => Promise<void>;

    // Subtitle style
    subtitleStyle: SubtitleStyle;
    setSubtitleStyle: (style: Partial<SubtitleStyle>) => void;

    // Sidebar
    sidebarVisible: boolean;
    setSidebarVisible: (visible: boolean) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void, get: () => AppState) => ({
            currentVideo: null,
            setCurrentVideo: (video: File | null) => set({ currentVideo: video }),
            currentVideoUrl: null,
            setCurrentVideoUrl: (url: string | null) => set({ currentVideoUrl: url }),
            currentVideoPath: null,
            setCurrentVideoPath: (path: string | null) => set({ currentVideoPath: path }),
            subtitleTracks: [],
            setSubtitleTracks: (tracks: SubtitleTrack[]) => set({ subtitleTracks: tracks }),
            activeSubtitleTrackId: null,
            setActiveSubtitleTrackId: (id: string | null) => set({ activeSubtitleTrackId: id }),
            activeTranslatedTrackId: null,
            setActiveTranslatedTrackId: (id: string | null) => set({ activeTranslatedTrackId: id }),
            subtitleDisplayMode: "dual",
            setSubtitleDisplayMode: (mode: SubtitleDisplayMode) => set({ subtitleDisplayMode: mode }),
            currentTime: 0,
            setCurrentTime: (time: number) => set({ currentTime: time }),
            isPlaying: false,
            setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
            updateCue: (trackId: string, cueId: string, newText: string) =>
                set((state: AppState) => ({
                    subtitleTracks: state.subtitleTracks.map((track: SubtitleTrack) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue: SubtitleCue) =>
                                      cue.id === cueId ? { ...cue, text: newText } : cue
                                  ),
                              }
                            : track
                    ),
                })),
            updateCueTiming: (trackId: string, cueId: string, startTime: number, endTime: number) =>
                set((state: AppState) => ({
                    subtitleTracks: state.subtitleTracks.map((track: SubtitleTrack) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue: SubtitleCue) =>
                                      cue.id === cueId ? { ...cue, startTime, endTime } : cue
                                  ),
                              }
                            : track
                    ),
                })),
            shiftAllCues: (trackId: string, offset: number) =>
                set((state: AppState) => ({
                    subtitleTracks: state.subtitleTracks.map((track: SubtitleTrack) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue: SubtitleCue) => ({
                                      ...cue,
                                      startTime: Math.max(0, cue.startTime + offset),
                                      endTime: Math.max(0, cue.endTime + offset),
                                  })),
                              }
                            : track
                    ),
                })),
            deleteCue: (trackId: string, cueId: string) =>
                set((state: AppState) => ({
                    subtitleTracks: state.subtitleTracks.map((track: SubtitleTrack) =>
                        track.id === trackId
                            ? { ...track, cues: track.cues.filter((cue: SubtitleCue) => cue.id !== cueId) }
                            : track
                    ),
                })),
            addCue: (trackId: string, cue: SubtitleCue) =>
                set((state: AppState) => ({
                    subtitleTracks: state.subtitleTracks.map((track: SubtitleTrack) =>
                        track.id === trackId
                            ? { ...track, cues: [...track.cues, cue] }
                            : track
                    ),
                })),

            // Progress
            progressStep: "idle",
            progressPercent: 0,
            setProgress: (step: ProgressStep, percent: number) =>
                set({ progressStep: step, progressPercent: percent }),

            // Seek
            seekTo: null,
            setSeekTo: (time: number | null) => set({ seekTo: time }),

            // Settings
            theme: "dark",
            setTheme: (theme: "dark" | "light") => set({ theme }),
            useLocalWhisper: true,
            setUseLocalWhisper: (use: boolean) => set({ useLocalWhisper: use }),
            whisperModel: "tiny",
            setWhisperModel: (model: string) => set({ whisperModel: model }),

            // Model management
            downloadedModels: [],
            setDownloadedModels: (models: string[]) => set({ downloadedModels: models }),
            downloadingModels: new Set(),
            setDownloadingModels: (models: Set<string>) => set({ downloadingModels: models }),
            loadDownloadedModels: async () => {
                try {
                    const models = await TauriService.listDownloadedModels();
                    set({ downloadedModels: models });
                } catch (err) {
                    console.error("Failed to load downloaded models:", err);
                }
            },
            downloadModel: async (modelName: string) => {
                const state = get();
                if (state.downloadingModels.has(modelName)) return;
                
                const newDownloading = new Set(state.downloadingModels);
                newDownloading.add(modelName);
                set({ downloadingModels: newDownloading });

                try {
                    await TauriService.downloadWhisperModel(modelName);
                    await state.loadDownloadedModels();
                } catch (err) {
                    console.error(`Failed to download model ${modelName}:`, err);
                } finally {
                    const updatedDownloading = new Set(get().downloadingModels);
                    updatedDownloading.delete(modelName);
                    set({ downloadingModels: updatedDownloading });
                }
            },
            deleteModel: async (modelName: string) => {
                try {
                    await TauriService.deleteWhisperModel(modelName);
                    await get().loadDownloadedModels();
                } catch (err) {
                    console.error(`Failed to delete model ${modelName}:`, err);
                }
            },

            // Subtitle style
            subtitleStyle: {
                fontName: "Arial",
                fontSize: 24,
                primaryColor: "#FFFFFF",
                outlineColor: "#000000",
                backColor: "#00000080",
                bold: false,
                italic: false,
                alignment: "bottom",
            },
            setSubtitleStyle: (style: Partial<SubtitleStyle>) =>
                set((state: AppState) => ({
                    subtitleStyle: { ...state.subtitleStyle, ...style },
                })),
            
            // Sidebar
            sidebarVisible: true,
            setSidebarVisible: (visible: boolean) => set({ sidebarVisible: visible }),
        }),
        {
            name: "subplayer-storage",
            partialize: (state: AppState) => ({
                theme: state.theme,
                useLocalWhisper: state.useLocalWhisper,
                whisperModel: state.whisperModel,
                subtitleStyle: state.subtitleStyle,
            }),
        }
    )
);
