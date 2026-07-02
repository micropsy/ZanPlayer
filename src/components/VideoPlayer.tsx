import { useRef, useState, useEffect } from "react";
import { useAppStore, type SubtitleDisplayMode } from "../services/store";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Captions,
  CaptionsOff,
  SkipForward,
  SkipBack,
  FileVideo,
  CheckCircle2,
} from "lucide-react";
import { cn } from "../utils/cn";
import { TauriService, isTauri } from "../services/tauri";

export const VideoPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [showCCMenu, setShowCCMenu] = useState(false);
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
    showSubtitles,
    setShowSubtitles,
    seekTo,
    setSeekTo,
    subtitleStyle,
  } = useAppStore();

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

  return (
    <div
      className="relative w-full h-full bg-black group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
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
              }
            }}
          />
          
          {/* Audio-only visualizer placeholder */}
          {videoRef.current && videoRef.current.videoWidth === 0 && videoRef.current.videoHeight === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
              <div className="flex flex-col items-center gap-6">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl shadow-2xl flex items-center justify-center">
                  <FileVideo className="w-16 h-16 text-white" />
                </div>
                <div className="text-center">
                  <p className="text-white text-xl font-semibold">Now Playing</p>
                  <p className="text-gray-400 text-sm">Audio File</p>
                </div>
              </div>
            </div>
          )}

          {/* Subtitle Overlay */}
          {showSubtitles && (currentOriginalCue || currentTranslatedCue) && (
            <div
              className={cn(
                "absolute left-0 right-0 flex flex-col items-center px-4 pointer-events-none",
                subtitleStyle.alignment === "bottom" ? "bottom-24" : "top-24"
              )}
            >
              {subtitleDisplayMode !== "translated" && currentOriginalCue && (
                <div
                  className={cn(
                    "px-6 py-2 rounded-lg text-center max-w-3xl",
                    subtitleDisplayMode === "dual" && "mb-2"
                  )}
                  style={{
                    fontFamily: subtitleStyle.fontName,
                    fontSize: `${subtitleStyle.fontSize}px`,
                    color: subtitleStyle.primaryColor,
                    backgroundColor: subtitleStyle.backColor,
                    textShadow: `2px 2px 4px ${subtitleStyle.outlineColor}`,
                    fontWeight: subtitleStyle.bold ? "bold" : "normal",
                    fontStyle: subtitleStyle.italic ? "italic" : "normal",
                  }}
                >
                  {currentOriginalCue.text}
                </div>
              )}
              {subtitleDisplayMode !== "original" && currentTranslatedCue && (
                <div
                  className="px-6 py-2 rounded-lg text-center max-w-3xl"
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
                  {currentTranslatedCue.text}
                </div>
              )}
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
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
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
                  className="text-white hover:text-blue-400 transition-colors"
                >
                  {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => skipBackward(5)}
                    className="text-white hover:text-blue-400 transition-colors"
                    title="Back 5 seconds"
                  >
                    <SkipBack className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => skipForward(5)}
                    className="text-white hover:text-blue-400 transition-colors"
                    title="Forward 5 seconds"
                  >
                    <SkipForward className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors">
                    {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative" data-cc-menu>
                  <button
                    onClick={() => setShowCCMenu(!showCCMenu)}
                    className="text-white hover:text-blue-400 transition-colors"
                    title={showSubtitles ? "Subtitle Settings" : "Show Subtitles"}
                  >
                    {showSubtitles ? <Captions className="w-6 h-6" /> : <CaptionsOff className="w-6 h-6" />}
                  </button>
                  
                  {showCCMenu && (
                    <div className="absolute bottom-full right-0 mb-3 bg-gray-900/95 backdrop-blur rounded-xl shadow-2xl border border-gray-700 min-w-[200px] overflow-hidden">
                      <div className="p-3 border-b border-gray-700">
                        <button
                          onClick={() => setShowSubtitles(!showSubtitles)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center",
                            showSubtitles ? "bg-blue-600 border-blue-600" : "border-gray-500"
                          )}>
                            {showSubtitles && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          Show Subtitles
                        </button>
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-gray-400 px-2 py-1">Caption Mode</p>
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
                                ? "text-blue-400 bg-blue-900/30" 
                                : "text-gray-300 hover:bg-gray-800"
                            )}
                          >
                            {label}
                            {subtitleDisplayMode === mode && (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-blue-400 transition-colors"
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
              <span><kbd className="bg-gray-800 px-2 py-1 rounded">Space</kbd> Play/Pause</span>
              <span><kbd className="bg-gray-800 px-2 py-1 rounded">←/→</kbd> Seek</span>
              <span><kbd className="bg-gray-800 px-2 py-1 rounded">↑/↓</kbd> Volume</span>
              <span><kbd className="bg-gray-800 px-2 py-1 rounded">M</kbd> Mute</span>
              <span><kbd className="bg-gray-800 px-2 py-1 rounded">F</kbd> Fullscreen</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
