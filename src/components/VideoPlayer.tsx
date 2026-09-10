import { useRef, useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, whisperLangCode, SUBTITLE_LANGUAGES, type SubtitleDisplayMode } from "../services/store";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  SkipBack,
  FileVideo,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "../utils/cn";
import { TauriService, isTauri } from "../services/tauri";
import { translationService } from "../services/translation";
import type { SubtitleTrack, SubtitleCue } from "../types/subtitle";

const SOURCE_LANGUAGES = [
  { code: "auto", name: "Auto-Detect" },
  { code: "my", name: "Burmese" },
  { code: "en", name: "English" },
];

export const VideoPlayer = ({ onEditSubtitles }: { onEditSubtitles?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [showCCMenu, setShowCCMenu] = useState(false);
  const [ccMenuView, setCcMenuView] = useState<"root" | "source" | "language" | "mode">("root");
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const {
    currentVideoUrl,
    currentVideoPath,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    subtitleTracks,
    activeSubtitleTrackId,
    activeTranslatedTrackId,
    subtitleDisplayMode,
    setSubtitleDisplayMode,
    translatedCues,
    showSubtitles,
    setShowSubtitles,
    seekTo,
    setSeekTo,
    subtitleStyle,
    targetLanguage,
    setTargetLanguage,
    sourceLanguage,
    setSourceLanguage,
    transcriptionMode,
    isTranscribing,
    setIsTranscribing,
    transcriptionProgress,
    setTranscriptionProgress,
    translationError,
    setTranslationError,
    translationModelLoading,
    translationLoadProgress,
  } = useAppStore();

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlayRef = useRef(false);
  const translateGenerationRef = useRef(0);
  const inTranslationIdsRef = useRef<Set<string>>(new Set());
  const autoPausedForTranscriptionRef = useRef(false);
  // Realtime streaming state (only used in "realtime" transcription mode)
  const streamingTrackIdRef = useRef<string | null>(null);
  const streamingTrackLabelRef = useRef<string>("Original");
  const streamingPathRef = useRef<string | null>(null);
  const realtimeStartedRef = useRef(false);
  const realtimeStreamingActiveRef = useRef(false);
  const streamingDoneRef = useRef(false);
  const pendingChunkCuesRef = useRef<SubtitleCue[]>([]);
  // Realtime translation queue: cues whose translation was deferred because the
  // NLLB model wasn't available yet. Redispatched the moment it becomes ready so
  // streamed subtitles are never silently skipped.
  const stalledRealtimeCuesRef = useRef<SubtitleCue[]>([]);
  const translationSpinnerShownRef = useRef(false);
  // Dedupes the visible translation-error notice: reset whenever a chunk
  // translation lands or a new translation session starts.
  const translationErrorShownRef = useRef(false);
  const startRealtimePlaybackRef = useRef<() => void>(() => {});

  const originalTrack = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
  const translatedTrack = subtitleTracks.find((t) => t.id === activeTranslatedTrackId);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setIsMuted(newVolume === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      const newTime = parseFloat(e.target.value);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skipForward = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.duration || Infinity,
        videoRef.current.currentTime + seconds
      );
    }
  };

  const skipBackward = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - seconds);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          skipBackward(5);
          break;
        case "ArrowRight":
          skipForward(5);
          break;
        case "ArrowUp":
          if (videoRef.current) {
            const newVolume = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = newVolume;
            setVolume(newVolume);
            if (newVolume > 0) setIsMuted(false);
          }
          break;
        case "ArrowDown":
          if (videoRef.current) {
            const newVolume = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = newVolume;
            setVolume(newVolume);
            if (newVolume === 0) setIsMuted(true);
          }
          break;
        case "KeyM":
          toggleMute();
          break;
        case "KeyF":
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isMuted]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Close CC menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showCCMenu && !target.closest('[data-cc-menu]')) {
        setShowCCMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCCMenu]);

  // Handle seeking from store
  useEffect(() => {
    if (seekTo !== null && videoRef.current) {
      videoRef.current.currentTime = seekTo;
      setSeekTo(null); // Reset after seeking
    }
  }, [seekTo, setSeekTo]);

  const getCurrentCue = (track: typeof originalTrack) => {
    if (!track || !videoRef.current) return null;
    return track.cues.find(
      (cue) =>
        videoRef.current!.currentTime >= cue.startTime &&
        videoRef.current!.currentTime <= cue.endTime
    );
  };

  const currentOriginalCue = getCurrentCue(originalTrack);
  const currentTranslatedCue = getCurrentCue(translatedTrack);
  // Live translated caption: prefer the streamed chunk result keyed by the
  // original cue id, falling back to a translated track (imported/older tracks).
  const currentTranslatedText = currentOriginalCue
    ? translatedCues[currentOriginalCue.id] ?? currentTranslatedCue?.text
    : currentTranslatedCue?.text;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Transcribe the current video via process_dropped_video (extract + whisper + cleanup)
  const transcribeVideo = async (videoPathOverride?: string) => {
    const s = useAppStore.getState();
    if (s.isTranscribing) return;
    const videoPath = videoPathOverride || s.currentVideoPath;
    if (!videoPath) {
      console.error("Auto-transcribe requires a video path");
      return;
    }
    setTranscriptionError(null);
    // Force Whisper to recognize in the explicitly selected spoken language; auto-detection otherwise.
    // Whisper always runs the `translate` task (see transcribe_audio_local), so the raw track
    // comes back in English and the offline NLLB model turns those English captions into the
    // user-selected target language. Normalize through `whisperLangCode` so only valid ISO codes
    // (or undefined for auto) reach Rust — a full display name like "Burmese" would otherwise be
    // indexed out of bounds by whisper.cpp.
    const sourceLangToUse = whisperLangCode(s.sourceLanguage);
    const label = !sourceLangToUse
      ? "Original"
      : SOURCE_LANGUAGES.find((l) => l.code === sourceLangToUse)?.name || sourceLangToUse;
    const mode = useAppStore.getState().transcriptionMode;
    setIsTranscribing(true);
    setTranscriptionProgress(0);
    // Drop any translation state from a previous track/video.
    useAppStore.getState().clearTranslatedCues();
    // Reset realtime-streaming state for this video.
    realtimeStreamingActiveRef.current = false;
    realtimeStartedRef.current = false;
    streamingDoneRef.current = false;
    pendingChunkCuesRef.current = [];
    stalledRealtimeCuesRef.current = [];
    translationSpinnerShownRef.current = false;
    streamingPathRef.current = videoPath;
    streamingTrackLabelRef.current = label;
    streamingTrackIdRef.current = mode === "realtime" ? `track-${Date.now()}` : null;
    try {
      const cues = await TauriService.processDroppedVideo(
        videoPath,
        s.whisperModel,
        sourceLangToUse
      );
      // Stale transcription guard: ignore results if the user switched videos mid-run
      if (useAppStore.getState().currentVideoPath !== videoPath) {
        return;
      }
      if (mode === "realtime" && streamingTrackIdRef.current) {
        // Realtime: the live streamed track already exists in the store. Stop future
        // chunk appends and reconcile it with the authoritative, complete cue list.
        const trackId = streamingTrackIdRef.current;
        streamingDoneRef.current = true;
        pendingChunkCuesRef.current = [];
        const st = useAppStore.getState();
        const exists = st.subtitleTracks.some((t) => t.id === trackId);
        // Whisper emits fresh UUIDs for the authoritative cue list, so carry over
        // any already-translated text (keyed by streamed-cue id) onto the reconciled
        // ids. Without this every translated caption would vanish at 100% and the
        // gap-fill below would re-translate the WHOLE video (duplicate NLLB work and
        // a long stretch with no translated captions while playing).
        const streamedCues = st.subtitleTracks.find((t) => t.id === trackId)?.cues;
        if (streamedCues && streamedCues.length > 0) {
          const carry: Record<string, string> = {};
          const translated = st.translatedCues;
          for (const authoritative of cues) {
            const hit = streamedCues.find(
              (c) =>
                Math.abs(c.startTime - authoritative.startTime) < 0.25 &&
                Math.abs(c.endTime - authoritative.endTime) < 0.25
            );
            if (hit && Object.prototype.hasOwnProperty.call(translated, hit.id)) {
              carry[authoritative.id] = translated[hit.id];
            }
          }
          if (Object.keys(carry).length > 0) {
            st.mergeTranslatedCues(carry);
          }
        }
        if (exists) {
          st.setTrackCues(trackId, cues);
        } else {
          st.setSubtitleTracks([
            ...st.subtitleTracks.filter((t) => !t.isTranslated),
            { id: trackId, name: `Auto-Generated (${label})`, language: label, cues, isGenerated: true },
          ]);
        }
        st.setActiveSubtitleTrackId(trackId);
        st.setShowSubtitles(true);
        // Fill translation gaps left by the live streaming (chunks that never got
        // dispatched) once the authoritative, complete cue list is published.
        void autoTranslateCuesRef.current(trackId, cues);
      } else {
        // Full (batch): only publish subtitles after 100% completion.
        const newTrack: SubtitleTrack = {
          id: `track-${Date.now()}`,
          name: `Auto-Generated (${label})`,
          language: label,
          cues,
          isGenerated: true,
        };
        const withoutTranslated = useAppStore.getState().subtitleTracks.filter(
          (t) => !t.isTranslated
        );
        useAppStore.getState().setSubtitleTracks([...withoutTranslated, newTrack]);
        useAppStore.getState().setActiveSubtitleTrackId(newTrack.id);
        useAppStore.getState().setActiveTranslatedTrackId(null);
        useAppStore.getState().setShowSubtitles(true);
        // Full (batch) mode: transcription is 100% done, so stream translation
        // chunk-by-chunk over the complete cue list.
        void autoTranslateCuesRef.current(newTrack.id, cues);
      }
    } catch (err) {
      if (useAppStore.getState().currentVideoPath === videoPath) {
        console.error("Auto-transcription error:", err);
        setTranscriptionError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (useAppStore.getState().currentVideoPath === videoPath) {
        useAppStore.getState().setIsTranscribing(false);
        streamingTrackIdRef.current = null;
        realtimeStreamingActiveRef.current = false;
      }
    }
  };

  const transcribeVideoRef = useRef<(videoPath?: string) => Promise<void>>(async () => {});
  transcribeVideoRef.current = transcribeVideo;

  // Realtime streaming: the moment the first chunk (or meaningful progress) arrives,
  // dismiss the blocking overlay and start playback while transcription continues
  // in the background. A no-op once started, so follow-up chunks never fight playback.
  const startRealtimePlayback = useCallback(() => {
    if (realtimeStartedRef.current) return;
    realtimeStartedRef.current = true;
    realtimeStreamingActiveRef.current = true;
    const node = videoRef.current;
    if (node && node.readyState >= 2) {
      node.play().catch(() => setIsPlaying(false));
      autoPausedForTranscriptionRef.current = false;
    } else {
      pendingPlayRef.current = true;
    }
  }, []);
  startRealtimePlaybackRef.current = startRealtimePlayback;

  // Translate a single cue through the worker via "translate-chunk" and stream
  // the result into translatedCues the moment "chunk-translated" arrives. Errors
  // are rethrown so callers decide whether to surface them.
  const translateSingleCue = async (cue: SubtitleCue): Promise<void> => {
    const s = useAppStore.getState();
    const lang = s.targetLanguage;
    if (!lang || lang === "auto" || lang === "original") return;
    if (!s.translationModelAvailable) return;
    const text = cue.text?.trim();
    if (!text) return;
    if (Object.prototype.hasOwnProperty.call(s.translatedCues, cue.id)) return;
    if (inTranslationIdsRef.current.has(cue.id)) return;
    inTranslationIdsRef.current.add(cue.id);
    const gen = translateGenerationRef.current;
    try {
      // Whisper always produces English transcripts, so the auto-generated
      // track is translated FROM English regardless of the spoken audio. For
      // imported SRT tracks the worker falls back to script detection instead.
      const activeTrack = s.subtitleTracks.find((t) => t.id === s.activeSubtitleTrackId);
      const srcLang = activeTrack?.isGenerated ? "en" : undefined;
      const result = await translationService.translateChunk(text, lang, srcLang);
      if (translateGenerationRef.current !== gen) return;
      useAppStore.getState().appendTranslatedCue({ id: cue.id, text: result });
      // Realtime mode: the very first streamed chunk landing means the live
      // "Translating..." state can drop; everything after fills in transparently.
      if (realtimeStreamingActiveRef.current || realtimeStartedRef.current) {
        setIsTranslating(false);
      }
    } finally {
      inTranslationIdsRef.current.delete(cue.id);
    }
  };
  const translateSingleCueRef = useRef<(cue: SubtitleCue) => Promise<void>>(async () => {});
  translateSingleCueRef.current = translateSingleCue;

  // Dispatch a batch of cues to the chunk translator (fire-and-forget; realtime
  // flows want zero backpressure on the queue). Failures are logged and surfaced
  // once in the UI so a broken NLLB session is never invisible.
  const dispatchCuesToTranslate = (cues: SubtitleCue[]) => {
    for (const cue of cues) {
      void translateSingleCueRef.current(cue)
        .then(() => {
          if (inTranslationIdsRef.current.size === 0) {
            translationErrorShownRef.current = false;
          }
        })
        .catch((err) => {
          if (!translationErrorShownRef.current) {
            translationErrorShownRef.current = true;
            const message = err instanceof Error ? err.message : String(err);
            useAppStore.getState().setTranslationError(`Translation failed: ${message}`);
          }
          console.error("Realtime chunk translation failed:", err);
        });
    }
  };
  const dispatchCuesToTranslateRef = useRef(dispatchCuesToTranslate);
  dispatchCuesToTranslateRef.current = dispatchCuesToTranslate;

  // Re-dispatch cues that were stalled waiting for the NLLB model to become
  // available. Called from the store-subscription effect below.
  const flushRealtimeDispatches = () => {
    const queued = stalledRealtimeCuesRef.current;
    stalledRealtimeCuesRef.current = [];
    if (queued.length > 0) {
      dispatchCuesToTranslateRef.current(queued);
    }
  };
  const flushRealtimeDispatchesRef = useRef(flushRealtimeDispatches);
  flushRealtimeDispatchesRef.current = flushRealtimeDispatches;

  const shouldAutoTranslate = (): boolean => {
    const s = useAppStore.getState();
    const lang = s.targetLanguage;
    return (
      !!lang &&
      lang !== "auto" &&
      lang !== "original" &&
      s.translationModelAvailable &&
      !!s.activeSubtitleTrackId
    );
  };
  const shouldAutoTranslateRef = useRef(shouldAutoTranslate);
  shouldAutoTranslateRef.current = shouldAutoTranslate;

  // Translate a full cue list chunk-by-chunk (full mode: after 100% completes;
  // realtime: fills any gaps once the authoritative track is reconciled).
  const autoTranslateCues = async (_trackId: string, cues: SubtitleCue[]) => {
    if (!shouldAutoTranslate()) return;
    const gen = translateGenerationRef.current;
    setIsTranslating(true);
    try {
      for (let i = 0; i < cues.length; i++) {
        if (translateGenerationRef.current !== gen) return;
        const cue = cues[i];
        const currentMap = useAppStore.getState().translatedCues;
        if (Object.prototype.hasOwnProperty.call(currentMap, cue.id)) continue;
        try {
          await translateSingleCueRef.current(cue);
        } catch (err) {
          if (translateGenerationRef.current !== gen) return;
          const message = err instanceof Error ? err.message : String(err);
          console.error("Chunk translation error:", err);
          setTranslationError(message);
          break;
        }
      }
    } finally {
      if (translateGenerationRef.current === gen) {
        setIsTranslating(false);
      }
    }
  };
  const autoTranslateCuesRef = useRef<
    (trackId: string, cues: SubtitleCue[]) => Promise<void>
  >(async () => {});
  autoTranslateCuesRef.current = autoTranslateCues;

  // Translate the active subtitle track into the given language using the local
  // NLLB-200 model. Translation now streams chunk-by-chunk (one "translate-chunk"
  // request per cue) so the UI never hangs on a monolithic batch. The spinner is
  // dismissed as soon as the first chunk lands, while the rest fill in live.
  const translateSubtitles = async (code: string) => {
    const generation = ++translateGenerationRef.current;
    setTranslationError(null);

    if (code === "auto" || code === "original") {
      const s = useAppStore.getState();
      s.clearTranslatedCues();
      s.setSubtitleDisplayMode("original");
      return;
    }

    const s = useAppStore.getState();
    const original = s.subtitleTracks.find((t) => t.id === s.activeSubtitleTrackId);
    if (!original) {
      return;
    }

    if (!s.translationModelAvailable) {
      // Never fail instantly: picking a language while the model is mid-load
      // (background warm-up or an in-progress download) must not dead-end the
      // translation — wait for the load to finish instead.
      if (!(await translationService.isModelAvailable())) {
        setTranslationError(
          "Translation model not installed. Open Settings → Translation Model to download it."
        );
        return;
      }
      if (!s.translationModelLoading) {
        await translationService.autoLoadIfInstalled().catch(() => {});
      }
      const deadline = Date.now() + 90_000;
      while (
        !useAppStore.getState().translationModelAvailable &&
        useAppStore.getState().translationModelLoading &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!useAppStore.getState().translationModelAvailable) {
        // Preserve a more specific error (e.g. a failed load surfaced by
        // autoLoadIfInstalled) instead of overwriting it with a generic one.
        if (!useAppStore.getState().translationError) {
          setTranslationError("Translation model is still loading. Try again in a moment.");
        }
        return;
      }
    }

    if (original.cues.length === 0) {
      // No subtitles yet (e.g. streaming just started): remember the target and
      // let the realtime chunk flow translate as cues arrive.
      return;
    }

    const langName = SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name || code;
    const current = useAppStore.getState();
    current.clearTranslatedCues();
    const withoutTranslated = current.subtitleTracks.filter((t) => !t.isTranslated);
    const translatedTrack: SubtitleTrack = {
      id: `track-translated-${Date.now()}`,
      name: `Translated (${langName})`,
      language: langName,
      cues: [],
      isTranslated: true,
      sourceTrackId: original.id,
    };
    current.setSubtitleTracks([...withoutTranslated, translatedTrack]);
    current.setActiveTranslatedTrackId(translatedTrack.id);
    // Switching to a target language auto-shows dual captions so the translation
    // is visible immediately without a separate trip into the Caption Mode menu.
    current.setSubtitleDisplayMode("dual");
    current.setShowSubtitles(true);

    setIsTranslating(true);
    for (let i = 0; i < original.cues.length; i++) {
      if (translateGenerationRef.current !== generation) return;
      try {
        await translateSingleCueRef.current(original.cues[i]);
        if (i === 0 && translateGenerationRef.current === generation) {
          // First chunk translated: subtitles stream in, drop the spinner.
          setIsTranslating(false);
        }
      } catch (err) {
        if (translateGenerationRef.current !== generation) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error("Translation error:", err);
        // Surface it on the video but keep the subtitles/display mode intact so
        // the failure is visible without resetting the user's caption choices.
        setTranslationError(message);
        break;
      }
    }
    if (translateGenerationRef.current === generation) {
      setIsTranslating(false);
    }
  };
  const translateSubtitlesRef = useRef<(code: string) => Promise<void>>(async () => {});
  translateSubtitlesRef.current = translateSubtitles;

  // Keep the player in sync whenever the caption language changes — from the CC
  // Language menu or the Caption Language picker in Settings. Re-translates the
  // active track to the new target (or returns to "Original" for auto). A fresh
  // session has no active track yet, so this is a no-op until subtitles exist.
  useEffect(() => {
    const s = useAppStore.getState();
    if (!s.activeSubtitleTrackId) return;
    void translateSubtitlesRef.current(s.targetLanguage);
  }, [targetLanguage]);

  // Cancel any in-flight translation when the player unmounts
  useEffect(() => {
    return () => {
      translateGenerationRef.current += 1;
    };
  }, []);

  const currentLanguageLabel =
    SUBTITLE_LANGUAGES.find((l) => l.code === targetLanguage)?.name ||
    targetLanguage ||
    "Original";

  const currentSourceLanguageLabel =
    SOURCE_LANGUAGES.find((l) => l.code === sourceLanguage)?.name || sourceLanguage || "Auto-Detect";

  // Playback blocking applies ONLY in "full" (batch) transcription mode, where
  // subtitles are published after 100% completion. In "realtime" mode the video
  // starts playing immediately (standard HTML5 autoplay once the source loads)
  // and subtitles stream in as chunks are decoded — no overlay, no forced pause.
  const isInitialTranscribing = isTranscribing && transcriptionMode === "full";
  useEffect(() => {
    if (isInitialTranscribing) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        autoPausedForTranscriptionRef.current = true;
      }
    } else if (!isTranscribing && autoPausedForTranscriptionRef.current && subtitleTracks.length > 0) {
      autoPausedForTranscriptionRef.current = false;
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [isInitialTranscribing, isTranscribing, subtitleTracks.length, transcriptionMode, setIsPlaying]);

  const handleToggleSubtitles = () => {
    const turningOn = !showSubtitles;
    setShowSubtitles(turningOn);
    if (turningOn && subtitleTracks.length === 0 && !isTranscribing) {
      transcribeVideoRef.current();
    }
  };

  // Handle video source management
  useEffect(() => {
    if (currentVideoUrl) {
      setVideoSource(currentVideoUrl);
    }
  }, [currentVideoUrl]);

  useEffect(() => {
    if (currentVideoPath && isTauri()) {
      // If we have a video path in Tauri environment, convert it to a blob URL
      let isMounted = true;
      
      const loadVideo = async () => {
        try {
          const blobUrl = await TauriService.getVideoBlobUrl(currentVideoPath);
          if (isMounted) {
            setVideoSource(blobUrl);
          }
        } catch (error) {
          console.error("Failed to load video from path:", error);
          if (isMounted) {
            setVideoSource(null);
          }
        }
      };

      loadVideo();
      
      return () => {
        isMounted = false;
        if (videoSource?.startsWith("blob:")) {
          URL.revokeObjectURL(videoSource);
        }
      };
    } else if (!currentVideoPath && !currentVideoUrl) {
      setVideoSource(null);
    }
  }, [currentVideoPath, currentVideoUrl]);

  // Auto-transcribe a newly loaded video when captions are enabled and no subtitles exist yet
  useEffect(() => {
    if (currentVideoPath && showSubtitles && subtitleTracks.length === 0) {
      transcribeVideoRef.current(currentVideoPath);
    }
  }, [currentVideoPath, showSubtitles, subtitleTracks.length]);

  // Listen for real-time transcription progress from the Rust backend
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    const setupProgressListener = async () => {
      unlisten = await listen<{ percentage: number }>(
        "transcription-progress",
        (event) => {
          setTranscriptionProgress(event.payload.percentage);
          // Realtime fallback: even if no chunk has arrived yet (e.g., long silent
          // intro), unblock playback once decoding is clearly under way.
          const s = useAppStore.getState();
          if (
            s.transcriptionMode === "realtime" &&
            s.isTranscribing &&
            event.payload.percentage > 2
          ) {
            startRealtimePlaybackRef.current();
          }
        }
      );
    };
    setupProgressListener();
    return () => {
      unlisten?.();
    };
  }, [setTranscriptionProgress]);

  // Listen for streamed transcription chunks from the Rust backend.
  // In "realtime" mode, cues are appended dynamically to a growing live track so
  // watch-and-play can start immediately. Chunks are batched (150ms flush) so the
  // store isn't hammered with a set() per cue, avoiding playback stutter.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;

    const flushChunks = () => {
      const s = useAppStore.getState();
      const trackId = streamingTrackIdRef.current;
      const active =
        trackId &&
        !streamingDoneRef.current &&
        s.transcriptionMode === "realtime" &&
        s.currentVideoPath === streamingPathRef.current;
      if (!active) {
        pendingChunkCuesRef.current = [];
        return;
      }
      const cues = pendingChunkCuesRef.current.splice(0);
      if (cues.length === 0) return;
      s.appendStreamedCues(
        trackId!,
        {
          name: `Auto-Generated (${streamingTrackLabelRef.current})`,
          language: streamingTrackLabelRef.current,
        },
        cues
      );
      // Realtime: dispatch each appended cue to the worker chunk-by-chunk so
      // translated captions arrive as they're streamed. Errors are silent here —
      // only the manual/full flows surface translation problems.
      if (shouldAutoTranslateRef.current()) {
        if (!translationSpinnerShownRef.current) {
          translationSpinnerShownRef.current = true;
          setIsTranslating(true);
        }
        dispatchCuesToTranslateRef.current(cues);
      } else {
        // Model not ready yet: keep the cues so they're translated the moment
        // it becomes available instead of being dropped forever.
        stalledRealtimeCuesRef.current.push(...cues);
      }
    };

    const setupChunkListener = async () => {
      unlisten = await listen<{ id: string; start_time: number; end_time: number; text: string }>(
        "transcription-chunk",
        (event) => {
          const s = useAppStore.getState();
          if (s.transcriptionMode !== "realtime") return;
          if (!streamingTrackIdRef.current || streamingDoneRef.current) return;
          if (s.currentVideoPath !== streamingPathRef.current) {
            pendingChunkCuesRef.current = [];
            return;
          }
          const p = event.payload;
          if (!p || typeof p.start_time !== "number") return;
          pendingChunkCuesRef.current.push({
            id: p.id,
            startTime: p.start_time,
            endTime: p.end_time,
            text: p.text,
          });
          // First real content: dismiss the blocking overlay and start playback.
          startRealtimePlaybackRef.current();
          flushChunks();
        }
      );
    };

    void setupChunkListener();
    const flushTimer = window.setInterval(flushChunks, 150);
    return () => {
      unlisten?.();
      window.clearInterval(flushTimer);
    };
  }, []);

  // Realtime: cues that streamed while the NLLB model wasn't available yet are
  // held in `stalledRealtimeCuesRef`; the moment the model flips to available,
  // dispatch them all so translated captions follow the stream instead of
  // waiting for the end-of-video gap-fill. Also covers batch/full mode and any
  // late warm-up of the model (e.g. background load finishing after a video was
  // already transcribed): re-translate the active track so translations appear
  // without requiring the user to revisit the CC menu.
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.translationModelAvailable && !prevState.translationModelAvailable) {
        flushRealtimeDispatchesRef.current();
        const s = useAppStore.getState();
        const track = s.subtitleTracks.find((t) => t.id === s.activeSubtitleTrackId);
        const lang = s.targetLanguage;
        const wantsTranslation = track && !!lang && lang !== "auto" && lang !== "original";
        // While a realtime stream is live, the flush above already translates the
        // stalled cues; a full re-translate would just wipe/rebuild the same map.
        // Only re-translate when streaming is finished (batch/full mode or a video
        // that reconciled before the model finished warming up).
        const stillStreaming =
          streamingTrackIdRef.current !== null && !streamingDoneRef.current;
        if (wantsTranslation && track!.cues.length > 0 && !stillStreaming) {
          void translateSubtitlesRef.current(lang);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let unlisten: () => void;
    const setupDropListener = async () => {
      if (!isTauri()) return;
      unlisten = await listen("zanplayer:video-dropped", () => {
        pendingPlayRef.current = true;
      });
    };
    setupDropListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div
      className="relative w-full h-full bg-black group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
    >
      {videoSource ? (
        <>
          <video
            ref={videoRef}
            src={videoSource}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.volume = volume;
                videoRef.current.muted = isMuted;
                // Autoplay the moment media is ready unless we're in "full" batch
                // transcription mode (which holds playback until subtitles exist).
                // Realtime mode always starts playing immediately here.
                if (pendingPlayRef.current && !isInitialTranscribing) {
                  pendingPlayRef.current = false;
                  videoRef.current.play().catch(() => setIsPlaying(false));
                  autoPausedForTranscriptionRef.current = false;
                } else if (pendingPlayRef.current) {
                  pendingPlayRef.current = false;
                  autoPausedForTranscriptionRef.current = true;
                }
              }
            }}
            onLoadedData={() => {
              // Strict enforcement for "full" mode: once frame data is actually
              // available, if the initial batch transcription is still running,
              // force the video to stay paused. Never fires in realtime mode.
              if (videoRef.current && isInitialTranscribing) {
                videoRef.current.pause();
                autoPausedForTranscriptionRef.current = true;
              }
            }}
          />
          
          {/* Audio-only visualizer placeholder */}
          {videoRef.current && videoRef.current.videoWidth === 0 && videoRef.current.videoHeight === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zan-deep to-zan-black">
              <div className="flex flex-col items-center gap-6">
                <div className="w-32 h-32 bg-gradient-to-br from-zan-blue to-zan-deep rounded-3xl shadow-2xl flex items-center justify-center">
                  <FileVideo className="w-16 h-16 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-white text-xl font-semibold">Now Playing</p>
                  <p className="text-gray-400 text-sm">Audio File</p>
                </div>
              </div>
            </div>
          )}

          {/* Translation status pills: always visible on the video, never hidden
              inside the CC menu, so a stuck/failed translation can't go unnoticed. */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-20 pointer-events-none">
            {translationError && (
              <div className="max-w-xs px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500/50 text-red-300 text-xs shadow-lg">
                {translationError}
              </div>
            )}
            {!translationError && translationModelLoading && (
              <div className="px-3 py-1.5 rounded-lg bg-zan-blue/30 border border-zan-blue/50 text-zan-cyan text-xs shadow-lg flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading Translator
                {translationLoadProgress > 0 && ` ${Math.round(translationLoadProgress)}%`}
              </div>
            )}
            {!translationError && !translationModelLoading && isTranslating && (
              <div className="px-3 py-1.5 rounded-lg bg-zan-blue/30 border border-zan-blue/50 text-zan-cyan text-xs shadow-lg flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Translating
              </div>
            )}
          </div>

          {/* Subtitle Overlay */}
          {showSubtitles &&
            (subtitleDisplayMode !== "translated" ? currentOriginalCue : currentTranslatedText) && (
              <div
                className={cn(
                  "absolute left-0 right-0 flex flex-col items-center px-4 pointer-events-none",
                  subtitleStyle.alignment === "bottom" ? "bottom-24" : "top-24"
                )}
              >
                {subtitleDisplayMode !== "original" && currentTranslatedText && (
                  <div
                    className={cn(
                      "px-6 py-2 rounded-lg text-center max-w-3xl",
                      subtitleDisplayMode === "dual" && "mb-1"
                    )}
                    style={{
                      fontFamily: subtitleStyle.fontName,
                      fontSize: `${subtitleStyle.fontSize}px`,
                      color: "#FFD700",
                      backgroundColor: subtitleStyle.backColor,
                      textShadow: `2px 2px 4px ${subtitleStyle.outlineColor}`,
                      fontWeight: subtitleStyle.bold ? "bold" : "normal",
                      fontStyle: subtitleStyle.italic ? "italic" : "normal",
                    }}
                  >
                    {currentTranslatedText}
                  </div>
                )}
                {subtitleDisplayMode !== "translated" && currentOriginalCue && (
                  <div
                    className="px-6 py-2 rounded-lg text-center max-w-3xl"
                    style={{
                      fontFamily: subtitleStyle.fontName,
                      // Dual captions: translated headline on top, original below
                      // rendered smaller and more subtle.
                      fontSize: `${subtitleStyle.fontSize * (subtitleDisplayMode === "dual" ? 0.72 : 1)}px`,
                      color: subtitleStyle.primaryColor,
                      backgroundColor: subtitleStyle.backColor,
                      opacity: subtitleDisplayMode === "dual" ? 0.85 : 1,
                      textShadow: `2px 2px 4px ${subtitleStyle.outlineColor}`,
                      fontWeight: subtitleStyle.bold ? "bold" : "normal",
                      fontStyle: subtitleStyle.italic ? "italic" : "normal",
                    }}
                  >
                    {currentOriginalCue.text}
                  </div>
                )}
              </div>
            )}

          {/* Initial Transcription Overlay */}
          {isInitialTranscribing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm pointer-events-none">
              <Loader2 className="w-10 h-10 animate-spin text-zan-cyan" />
              <p className="text-white text-lg font-semibold">
                Transcribing Audio... {Math.round(transcriptionProgress)}%
              </p>
              <p className="text-gray-300 text-sm">
                {transcriptionProgress < 100 ? "Please wait" : "Finalizing subtitles..."}
              </p>
            </div>
          )}

          {/* Play/Pause Overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            onClick={togglePlay}
          >
            {!isPlaying && (
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Play className="w-10 h-10 text-white ml-1" />
              </div>
            )}
          </div>

          {/* Transcribing Indicator */}
          {/* Top-right corner so it never overlaps the bottom-center subtitle overlay.
              Hidden while the full initial-transcription overlay is showing, once progress
              reaches 100%, or when realtime streaming is done. */}
          {isTranscribing &&
            !isInitialTranscribing &&
            transcriptionProgress < 100 && (
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur rounded-full border border-gray-700 shadow-xl pointer-events-none">
                <Loader2 className="w-4 h-4 animate-spin text-zan-cyan" />
                <span className="text-sm text-white">
                  Transcribing... {Math.round(transcriptionProgress)}%
                </span>
              </div>
            )}

          {/* Controls Bar */}
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 py-4 transition-opacity duration-300",
              showControls ? "opacity-100" : "opacity-0"
            )}
          >
            {/* Progress Bar */}
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max={videoRef.current?.duration || 100}
                value={videoRef.current?.currentTime || 0}
                onChange={handleSeek}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-zan-cyan"
              />
              <div className="flex justify-between text-xs text-gray-300 mt-1">
                <span>{formatTime(videoRef.current?.currentTime || 0)}</span>
                <span>{formatTime(videoRef.current?.duration || 0)}</span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-zan-cyan transition-colors"
                >
                  {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => skipBackward(5)}
                    className="text-white hover:text-zan-cyan transition-colors"
                    title="Back 5 seconds"
                  >
                    <SkipBack className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => skipForward(5)}
                    className="text-white hover:text-zan-cyan transition-colors"
                    title="Forward 5 seconds"
                  >
                    <SkipForward className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={toggleMute} className="text-white hover:text-zan-cyan transition-colors">
                    {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-zan-cyan"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {translationModelLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-zan-cyan bg-zan-black/70 border border-zan-cyan/20 px-2.5 py-1 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading Translator... {Math.round(translationLoadProgress)}%
                  </div>
                )}
                <div className="relative" data-cc-menu>
                  <button
                    onClick={() => {
                      setShowCCMenu(!showCCMenu);
                      if (showCCMenu) setCcMenuView("root");
                    }}
                    className={cn(
                      "flex items-center justify-center py-0.5 px-1 rounded-[4px] border transition-colors",
                      showSubtitles
                        ? "text-zan-cyan border-zan-cyan/70 hover:bg-zan-cyan/10"
                        : "text-white/80 border-white/70 hover:text-zan-cyan hover:border-zan-cyan/70"
                    )}
                    title={showSubtitles ? "Subtitle Settings" : "Show Subtitles"}
                  >
                    <span className="text-[11px] font-bold tracking-widest leading-none">CC</span>
                  </button>
                  
                  {showCCMenu && (
                    <div className="absolute bottom-full right-0 mb-3 bg-zan-black/95 backdrop-blur rounded-xl shadow-2xl border border-gray-700 min-w-[220px] overflow-hidden">
                      {ccMenuView === "source" ? (
                        <>
                          <div className="flex items-center px-2 py-2 border-b border-gray-700">
                            <button
                              onClick={() => setCcMenuView("root")}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-semibold text-white px-2">Spoken Audio (Source)</span>
                          </div>
                          <p className="px-3 py-2 text-[11px] leading-relaxed text-gray-400 border-b border-gray-700/60">
                            Whisper transcribes the speech here and always outputs it in{" "}
                            <span className="text-zan-cyan font-medium">English</span>.
                          </p>
                          <div className="max-h-64 overflow-y-auto p-1">
                            {SOURCE_LANGUAGES.map((lang) => (
                              <button
                                key={lang.code}
                                onClick={() => {
                                  setSourceLanguage(lang.code);
                                  setCcMenuView("root");
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                                  sourceLanguage === lang.code
                                    ? "text-zan-cyan bg-zan-blue/25"
                                    : "text-gray-300 hover:bg-zan-blue/15"
                                )}
                              >
                                {lang.name}
                                {sourceLanguage === lang.code && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : ccMenuView === "language" ? (
                        <>
                          <div className="flex items-center px-2 py-2 border-b border-gray-700">
                            <button
                              onClick={() => setCcMenuView("root")}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-semibold text-white px-2">Language</span>
                          </div>
                          <div className="max-h-64 overflow-y-auto p-1">
                            {SUBTITLE_LANGUAGES.map((lang) => (
                              <button
                                key={lang.code}
                                onClick={() => {
                                  setTargetLanguage(lang.code);
                                  if (lang.code === "auto") {
                                    // Back to the untranslated track.
                                    setSubtitleDisplayMode("original");
                                  } else {
                                    // Selecting a target language instantly switches captions
                                    // to Dual so translated text appears right away; the
                                    // targetLanguage watcher kicks off the actual translation.
                                    setSubtitleDisplayMode("dual");
                                  }
                                  if (lang.code !== "auto" && subtitleTracks.length === 0 && !isTranscribing) {
                                    transcribeVideoRef.current();
                                  }
                                  setCcMenuView("root");
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                                  targetLanguage === lang.code
                                    ? "text-zan-cyan bg-zan-blue/25"
                                    : "text-gray-300 hover:bg-zan-blue/15"
                                )}
                              >
                                {lang.name}
                                {targetLanguage === lang.code && <CheckCircle2 className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : ccMenuView === "mode" ? (
                        <>
                          <div className="flex items-center px-2 py-2 border-b border-gray-700">
                            <button
                              onClick={() => setCcMenuView("root")}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-semibold text-white px-2">Caption Mode</span>
                          </div>
                          <div className="p-1">
                            {[
                              { mode: "original", label: "Original Only" },
                              { mode: "translated", label: "Translated Only" },
                              { mode: "dual", label: "Dual Subtitles" },
                            ].map(({ mode, label }) => (
                              <button
                                key={mode}
                                onClick={() => {
                                  setSubtitleDisplayMode(mode as SubtitleDisplayMode);
                                  setShowCCMenu(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                                  subtitleDisplayMode === mode
                                    ? "text-zan-cyan bg-zan-blue/25"
                                    : "text-gray-300 hover:bg-zan-blue/15"
                                )}
                              >
                                {label}
                                {subtitleDisplayMode === mode && (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                            <span className="text-sm font-semibold text-white">Captions</span>
                            {isTranscribing && (
                              <span className="flex items-center gap-1.5 text-xs text-zan-cyan">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Transcribing
                              </span>
                            )}
                            {isTranslating && (
                              <span className="flex items-center gap-1.5 text-xs text-zan-cyan">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Translating
                              </span>
                            )}
                          </div>
                          <div className="p-1">
                            <button
                              onClick={handleToggleSubtitles}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-white hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <span>Subtitles</span>
                              <span
                                className={cn(
                                  "relative w-9 h-5 rounded-full transition-colors",
                                  showSubtitles ? "bg-zan-cyan" : "bg-gray-600"
                                )}
                              >
                                <span
                                  className={cn(
                                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                                    showSubtitles ? "left-[18px]" : "left-0.5"
                                  )}
                                />
                              </span>
                            </button>
                            <button
                              onClick={() => setCcMenuView("source")}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <span>Spoken Audio (Source)</span>
                              <span className="flex items-center gap-1 text-gray-400">
                                <span className="text-xs">{currentSourceLanguageLabel}</span>
                                <ChevronRight className="w-4 h-4" />
                              </span>
                            </button>
                            <button
                              onClick={() => setCcMenuView("language")}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <span>Language</span>
                              <span className="flex items-center gap-1 text-gray-400">
                                <span className="text-xs">{currentLanguageLabel}</span>
                                <ChevronRight className="w-4 h-4" />
                              </span>
                            </button>
                            <button
                              onClick={() => setCcMenuView("mode")}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-zan-blue/15 rounded-lg transition-colors"
                            >
                              <span>Caption Mode</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setShowCCMenu(false);
                                onEditSubtitles?.();
                              }}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-zan-blue/15 rounded-lg transition-colors border-t border-gray-700/70 mt-1 pt-2"
                            >
                              <span className="flex items-center gap-2">
                                <span className="text-sm">✏️</span>
                                Edit Subtitles
                              </span>
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            </button>
                            {transcriptionError && (
                              <p className="px-3 py-2 text-xs text-red-400 break-all">{transcriptionError}</p>
                            )}
                            {translationError && (
                              <p className="px-3 py-2 text-xs text-red-400 break-all">{translationError}</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-zan-cyan transition-colors"
                >
                  {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full text-gray-500">
          <FileVideo className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">Select a video or audio file to start</p>
          <div className="mt-6 text-sm text-gray-600 max-w-md text-center">
            <p className="mb-2">Keyboard shortcuts:</p>
            <div className="grid grid-cols-2 gap-2">
              <span><kbd className="bg-zan-black px-2 py-1 rounded">Space</kbd> Play/Pause</span>
              <span><kbd className="bg-zan-black px-2 py-1 rounded">←/→</kbd> Seek</span>
              <span><kbd className="bg-zan-black px-2 py-1 rounded">↑/↓</kbd> Volume</span>
              <span><kbd className="bg-zan-black px-2 py-1 rounded">M</kbd> Mute</span>
              <span><kbd className="bg-zan-black px-2 py-1 rounded">F</kbd> Fullscreen</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
