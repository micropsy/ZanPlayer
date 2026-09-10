import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleTrack, SubtitleCue } from "../types/subtitle";
import { TauriService } from "./tauri";

export type SubtitleDisplayMode = "original" | "translated" | "dual";
export type ProgressStep = "idle" | "saving" | "extracting" | "transcribing";
export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "uptodate";

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

// Title/language options shown in the CC menu and the Settings caption-language
// picker. "auto" is the untranslated Original track; every other entry is a
// target language for the offline NLLB translation model (whose input is the
// English transcript produced by Whisper).
export const SUBTITLE_LANGUAGES = [
    { code: "auto", name: "Original" },
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "my", name: "Burmese" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "zh", name: "Chinese (Simplified)" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "th", name: "Thai" },
    { code: "vi", name: "Vietnamese" },
    { code: "hi", name: "Hindi" },
    { code: "ar", name: "Arabic" },
] as const;

// Full display names -> whisper ISO-639-1 codes. whisper.cpp's `g_lang` table only
// resolves ISO codes ("en", "my") or its own full names ("english", "myanmar");
// any other string yields lang_id == -1 and then indexes `ailang_2_tok[-1]` out of
// bounds while building the prompt, silently breaking transcription. This is the
// single sanitization point before a language reaches the Rust backend.
const WHISPER_LANG_MAP: Record<string, string> = {
    auto: "auto",
    "auto-detect": "auto",
    autodetect: "auto",
    english: "en",
    en: "en",
    burmese: "my",
    myanmar: "my",
    my: "my",
    spanish: "es",
    espanol: "es",
    es: "es",
    french: "fr",
    fr: "fr",
    german: "de",
    deu: "de",
    de: "de",
    japanese: "ja",
    ja: "ja",
    korean: "ko",
    ko: "ko",
    chinese: "zh",
    "chinese (simplified)": "zh",
    zh: "zh",
    portuguese: "pt",
    pt: "pt",
    russian: "ru",
    ru: "ru",
    thai: "th",
    th: "th",
    vietnamese: "vi",
    vi: "vi",
    hindi: "hi",
    hi: "hi",
    arabic: "ar",
    ar: "ar",
};

// Normalize a spoken-audio language value ("auto", "Burmese", "en", ...) into an
// ISO-639-1 code Whisper understands, or `undefined` for auto-detection so the
// backend never receives an unresolvable string.
export function whisperLangCode(lang: string | undefined | null): string | undefined {
    if (!lang) return undefined;
    const key = lang.trim().toLowerCase();
    const mapped = WHISPER_LANG_MAP[key];
    if (mapped === "auto") return undefined;
    if (mapped) return mapped;
    // A clean lowercase 2-letter ISO code passes through; anything else falls
    // back to auto-detection rather than breaking whisper.cpp's tokenizer.
    return /^[a-z]{2}$/.test(key) ? key : undefined;
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
    resetSubtitles: () => void;
    appendStreamedCues: (trackId: string, meta: { name: string; language: string }, cues: SubtitleCue[]) => void;
    setTrackCues: (trackId: string, cues: SubtitleCue[]) => void;
    activeSubtitleTrackId: string | null;
    setActiveSubtitleTrackId: (id: string | null) => void;
    activeTranslatedTrackId: string | null;
    setActiveTranslatedTrackId: (id: string | null) => void;
    subtitleDisplayMode: SubtitleDisplayMode;
    setSubtitleDisplayMode: (mode: SubtitleDisplayMode) => void;
    translatedCues: Record<string, string>;
    appendTranslatedCue: (cue: { id: string; text: string }) => void;
    mergeTranslatedCues: (map: Record<string, string>) => void;
    clearTranslatedCues: () => void;
    showSubtitles: boolean;
    setShowSubtitles: (show: boolean) => void;
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
    targetLanguage: string;
    setTargetLanguage: (lang: string) => void;
    sourceLanguage: string;
    setSourceLanguage: (lang: string) => void;
    autoCheckUpdates: boolean;
    setAutoCheckUpdates: (check: boolean) => void;
    isTranscribing: boolean;
    setIsTranscribing: (val: boolean) => void;
    transcriptionProgress: number;
    setTranscriptionProgress: (progress: number) => void;
    transcriptionMode: "realtime" | "full";
    setTranscriptionMode: (mode: "realtime" | "full") => void;

    // Offline translation
    translationModelAvailable: boolean;
    setTranslationModelAvailable: (available: boolean) => void;
    translationModelLoading: boolean;
    setTranslationModelLoading: (loading: boolean) => void;
    translationLoadProgress: number;
    setTranslationLoadProgress: (progress: number) => void;
    translationError: string | null;
    setTranslationError: (error: string | null) => void;

    // Model management
    downloadedModels: string[];
    setDownloadedModels: (models: string[]) => void;
    downloadingModels: Set<string>;
    setDownloadingModels: (models: Set<string>) => void;
    modelDownloadProgress: Record<string, { percent: number; speedMBps: number; etaSeconds: number; error: boolean; message?: string }>;
    setModelDownloadProgress: (modelName: string, progress: { percent: number; speedMBps: number; etaSeconds: number; error: boolean; message?: string }) => void;
    loadDownloadedModels: () => Promise<void>;
    downloadModel: (modelName: string) => Promise<void>;
    deleteModel: (modelName: string) => Promise<void>;

    // Subtitle style
    subtitleStyle: SubtitleStyle;
    setSubtitleStyle: (style: Partial<SubtitleStyle>) => void;

    // Sidebar
    sidebarVisible: boolean;
    setSidebarVisible: (visible: boolean) => void;

    // Updater (global UpdateModal; shared by manual Settings flow + background startup check)
    updateModalOpen: boolean;
    setUpdateModalOpen: (open: boolean) => void;
    updateStatus: UpdateStatus;
    setUpdateStatus: (status: UpdateStatus) => void;
    downloadProgress: number;
    setDownloadProgress: (progress: number) => void;
    updateVersion: string | null;
    setUpdateVersion: (version: string | null) => void;
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
            resetSubtitles: () =>
                set({
                    subtitleTracks: [],
                    activeSubtitleTrackId: null,
                    activeTranslatedTrackId: null,
                    translatedCues: {},
                    isTranscribing: false,
                    transcriptionProgress: 0,
                }),
            appendStreamedCues: (trackId, meta, cues) =>
                set((state) => {
                    const exists = state.subtitleTracks.some((t) => t.id === trackId);
                    const tracks = exists
                        ? state.subtitleTracks
                        : [
                              ...state.subtitleTracks.filter((t) => !t.isGenerated),
                              {
                                  id: trackId,
                                  name: meta.name,
                                  language: meta.language,
                                  cues: [],
                                  isGenerated: true,
                              },
                          ];
                    return {
                        subtitleTracks: tracks.map((t) =>
                            t.id === trackId ? { ...t, cues: [...t.cues, ...cues] } : t
                        ),
                        ...(exists ? {} : { activeSubtitleTrackId: trackId }),
                    };
                }),
            setTrackCues: (trackId, cues) =>
                set((state) => ({
                    subtitleTracks: state.subtitleTracks.map((t) =>
                        t.id === trackId ? { ...t, cues } : t
                    ),
                })),
            activeSubtitleTrackId: null,
            setActiveSubtitleTrackId: (id: string | null) => set({ activeSubtitleTrackId: id }),
            activeTranslatedTrackId: null,
            setActiveTranslatedTrackId: (id: string | null) => set({ activeTranslatedTrackId: id }),
            subtitleDisplayMode: "dual",
            setSubtitleDisplayMode: (mode: SubtitleDisplayMode) => set({ subtitleDisplayMode: mode }),
            translatedCues: {},
            appendTranslatedCue: (cue: { id: string; text: string }) =>
                set((state: AppState) => {
                    // Keep the translated track (if one is active) in sync so the
                    // sidebar/editor/export still see a concrete translated track,
                    // while the overlay reads the raw map for live chunk updates.
                    const original = state.subtitleTracks.find(
                        (t) => t.id === state.activeSubtitleTrackId
                    );
                    const source = original?.cues.find((c) => c.id === cue.id);
                    const subtitleTracks =
                        source && state.activeTranslatedTrackId
                            ? state.subtitleTracks.map((track: SubtitleTrack) => {
                                  if (track.id !== state.activeTranslatedTrackId) return track;
                                  const exists = track.cues.some((c) => c.id === cue.id);
                                  return exists
                                      ? {
                                            ...track,
                                            cues: track.cues.map((c) =>
                                                c.id === cue.id ? { ...c, text: cue.text } : c
                                            ),
                                        }
                                      : { ...track, cues: [...track.cues, { ...source, text: cue.text }] };
                              })
                            : state.subtitleTracks;
                    return {
                        subtitleTracks,
                        translatedCues: { ...state.translatedCues, [cue.id]: cue.text },
                    };
                }),
            clearTranslatedCues: () =>
                set((state: AppState) => ({
                    translatedCues: {},
                    subtitleTracks: state.subtitleTracks.filter((t) => !t.isTranslated),
                    activeTranslatedTrackId: null,
                })),
            mergeTranslatedCues: (map: Record<string, string>) =>
                set((state: AppState) => ({
                    translatedCues: { ...state.translatedCues, ...map },
                })),
            showSubtitles: true,
            setShowSubtitles: (show: boolean) => set({ showSubtitles: show }),
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
            targetLanguage: "en",
            setTargetLanguage: (lang: string) => set({ targetLanguage: lang }),
            sourceLanguage: "auto",
            setSourceLanguage: (lang: string) => set({ sourceLanguage: lang }),
            autoCheckUpdates: true,
            setAutoCheckUpdates: (check: boolean) => set({ autoCheckUpdates: check }),
            isTranscribing: false,
            setIsTranscribing: (val: boolean) => set({ isTranscribing: val }),
            transcriptionProgress: 0,
            setTranscriptionProgress: (progress: number) => set({ transcriptionProgress: progress }),
            transcriptionMode: "realtime" as const,
            setTranscriptionMode: (mode: "realtime" | "full") => set({ transcriptionMode: mode }),

            // Offline translation
            translationModelAvailable: false,
            setTranslationModelAvailable: (available: boolean) => set({ translationModelAvailable: available }),
            translationModelLoading: false,
            setTranslationModelLoading: (loading: boolean) => set({ translationModelLoading: loading }),
            translationLoadProgress: 0,
            setTranslationLoadProgress: (progress: number) =>
                set({ translationLoadProgress: Math.min(100, Math.max(0, Math.round(progress))) }),
            translationError: null,
            setTranslationError: (error: string | null) => set({ translationError: error }),

            // Model management
            downloadedModels: [],
            setDownloadedModels: (models: string[]) => set({ downloadedModels: models }),
            downloadingModels: new Set(),
            setDownloadingModels: (models: Set<string>) => set({ downloadingModels: models }),
            modelDownloadProgress: {},
            setModelDownloadProgress: (modelName: string, progress) =>
                set((state) => ({
                    modelDownloadProgress: {
                        ...state.modelDownloadProgress,
                        [modelName]: progress,
                    },
                })),
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
                if (state.downloadingModels.has(modelName) && !state.modelDownloadProgress[modelName]?.error) return;
                
                const newDownloading = new Set(state.downloadingModels);
                newDownloading.add(modelName);
                set({ 
                    downloadingModels: newDownloading,
                    modelDownloadProgress: {
                        ...state.modelDownloadProgress,
                        [modelName]: { percent: 0, speedMBps: 0, etaSeconds: 0, error: false }
                    }
                });

                try {
                    await TauriService.downloadWhisperModel(modelName, (percent, speedMBps, etaSeconds) => {
                        set((s) => ({
                            modelDownloadProgress: {
                                ...s.modelDownloadProgress,
                                [modelName]: { percent, speedMBps, etaSeconds, error: false }
                            }
                        }));
                    });
                    await state.loadDownloadedModels();
                    // Clear progress after successful download
                    set((s) => {
                        const newProgress = { ...s.modelDownloadProgress };
                        delete newProgress[modelName];
                        return { modelDownloadProgress: newProgress };
                    });
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`Failed to download model ${modelName}:`, err);
                    set((s) => ({
                        modelDownloadProgress: {
                            ...s.modelDownloadProgress,
                            [modelName]: { 
                                ...(s.modelDownloadProgress[modelName] || { percent: 0, speedMBps: 0, etaSeconds: 0 }),
                                error: true,
                                message
                            }
                        }
                    }));
                } finally {
                    const updatedDownloading = new Set(get().downloadingModels);
                    if (!get().modelDownloadProgress[modelName]?.error) {
                        updatedDownloading.delete(modelName);
                    }
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

            // Updater
            updateModalOpen: false,
            setUpdateModalOpen: (open: boolean) => set({ updateModalOpen: open }),
            updateStatus: "idle",
            setUpdateStatus: (status: UpdateStatus) => set({ updateStatus: status }),
            downloadProgress: 0,
            setDownloadProgress: (progress: number) => set({ downloadProgress: progress }),
            updateVersion: null,
            setUpdateVersion: (version: string | null) => set({ updateVersion: version }),
        }),
        {
            name: "zanplayer-storage",
            partialize: (state: AppState) => ({
                theme: state.theme,
                useLocalWhisper: state.useLocalWhisper,
                whisperModel: state.whisperModel,
                subtitleStyle: state.subtitleStyle,
                targetLanguage: state.targetLanguage,
                sourceLanguage: state.sourceLanguage,
                transcriptionMode: state.transcriptionMode,
                subtitleDisplayMode: state.subtitleDisplayMode,
                autoCheckUpdates: state.autoCheckUpdates,
            }),
        }
    )
);
