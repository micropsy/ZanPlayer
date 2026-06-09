import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleTrack, SubtitleCue } from "../types/subtitle";
import { TauriService } from "./tauri";

export type SubtitleDisplayMode = "original" | "translated" | "dual";
export type ProgressStep = "idle" | "saving" | "extracting" | "transcribing" | "translating";

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
    apiKey: string;
    setApiKey: (key: string) => void;
    defaultTargetLanguage: string;
    setDefaultTargetLanguage: (lang: string) => void;
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
        (set, get) => ({
            currentVideo: null,
            setCurrentVideo: (video) => set({ currentVideo: video }),
            currentVideoUrl: null,
            setCurrentVideoUrl: (url) => set({ currentVideoUrl: url }),
            currentVideoPath: null,
            setCurrentVideoPath: (path) => set({ currentVideoPath: path }),
            subtitleTracks: [],
            setSubtitleTracks: (tracks) => set({ subtitleTracks: tracks }),
            activeSubtitleTrackId: null,
            setActiveSubtitleTrackId: (id) => set({ activeSubtitleTrackId: id }),
            activeTranslatedTrackId: null,
            setActiveTranslatedTrackId: (id) => set({ activeTranslatedTrackId: id }),
            subtitleDisplayMode: "dual",
            setSubtitleDisplayMode: (mode) => set({ subtitleDisplayMode: mode }),
            currentTime: 0,
            setCurrentTime: (time) => set({ currentTime: time }),
            isPlaying: false,
            setIsPlaying: (playing) => set({ isPlaying: playing }),
            updateCue: (trackId, cueId, newText) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((track) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue) =>
                                      cue.id === cueId ? { ...cue, text: newText } : cue
                                  ),
                              }
                            : track
                    ),
                })),
            updateCueTiming: (trackId, cueId, startTime, endTime) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((track) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue) =>
                                      cue.id === cueId ? { ...cue, startTime, endTime } : cue
                                  ),
                              }
                            : track
                    ),
                })),
            shiftAllCues: (trackId, offset) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((track) =>
                        track.id === trackId
                            ? {
                                  ...track,
                                  cues: track.cues.map((cue) => ({
                                      ...cue,
                                      startTime: Math.max(0, cue.startTime + offset),
                                      endTime: Math.max(0, cue.endTime + offset),
                                  })),
                              }
                            : track
                    ),
                })),
            deleteCue: (trackId, cueId) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((track) =>
                        track.id === trackId
                            ? { ...track, cues: track.cues.filter((cue) => cue.id !== cueId) }
                            : track
                    ),
                })),
            addCue: (trackId, cue) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((track) =>
                        track.id === trackId
                            ? { ...track, cues: [...track.cues, cue] }
                            : track
                    ),
                })),

            // Progress
            progressStep: "idle",
            progressPercent: 0,
            setProgress: (step, percent) =>
                set({ progressStep: step, progressPercent: percent }),

            // Seek
            seekTo: null,
            setSeekTo: (time) => set({ seekTo: time }),

            // Settings
            apiKey: "",
            setApiKey: (key) => set({ apiKey: key }),
            defaultTargetLanguage: "Burmese",
            setDefaultTargetLanguage: (lang) =>
                set({ defaultTargetLanguage: lang }),
            theme: "dark",
            setTheme: (theme) => set({ theme }),
            useLocalWhisper: false,
            setUseLocalWhisper: (use) => set({ useLocalWhisper: use }),
            whisperModel: "tiny",
            setWhisperModel: (model) => set({ whisperModel: model }),

            // Model management
            downloadedModels: [],
            setDownloadedModels: (models) => set({ downloadedModels: models }),
            downloadingModels: new Set(),
            setDownloadingModels: (models) => set({ downloadingModels: models }),
            loadDownloadedModels: async () => {
                try {
                    const models = await TauriService.listDownloadedModels();
                    set({ downloadedModels: models });
                } catch (err) {
                    console.error("Failed to load downloaded models:", err);
                }
            },
            downloadModel: async (modelName) => {
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
            deleteModel: async (modelName) => {
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
            setSubtitleStyle: (style) =>
                set((state) => ({
                    subtitleStyle: { ...state.subtitleStyle, ...style },
                })),
            
            // Sidebar
            sidebarVisible: true,
            setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
        }),
        {
            name: "subplayer-storage",
            partialize: (state) => ({
                apiKey: state.apiKey,
                defaultTargetLanguage: state.defaultTargetLanguage,
                theme: state.theme,
                useLocalWhisper: state.useLocalWhisper,
                whisperModel: state.whisperModel,
                subtitleStyle: state.subtitleStyle,
            }),
        }
    )
);
