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
  Languages,
  Eye,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { cn } from "../utils/cn";

export const VideoPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const {
    currentVideoUrl,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    subtitleTracks,
    activeSubtitleTrackId,
    activeTranslatedTrackId,
    subtitleDisplayMode,
    seekTo,
    setSeekTo,
  } = useAppStore();

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  return (
    <div
      className="relative w-full h-full bg-black group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {currentVideoUrl ? (
        <>
          <video
            ref={videoRef}
            src={currentVideoUrl}
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

          {/* Subtitle Overlay */}
          {(currentOriginalCue || currentTranslatedCue) && (
            <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center px-4 pointer-events-none">
              {subtitleDisplayMode !== "translated" && currentOriginalCue && (
                <div
                  className={cn(
                    "bg-black/75 text-white px-6 py-2 rounded-lg text-lg font-medium max-w-3xl text-center",
                    subtitleDisplayMode === "dual" && "mb-2"
                  )}
                >
                  {currentOriginalCue.text}
                </div>
              )}
              {subtitleDisplayMode !== "original" && currentTranslatedCue && (
                <div
                  className={cn(
                    "bg-blue-900/75 text-white px-6 py-2 rounded-lg text-xl font-semibold max-w-3xl text-center",
                    subtitleDisplayMode === "dual" && "text-yellow-300"
                  )}
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
                <SubtitleModeSwitcher />
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
          <Eye className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">Select a video file to start</p>
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

interface SubtitleModeSwitcherProps {
  className?: string;
}

const SubtitleModeSwitcher = ({ className }: SubtitleModeSwitcherProps) => {
  const { subtitleDisplayMode, setSubtitleDisplayMode } = useAppStore();

  const modes: { mode: SubtitleDisplayMode; label: string; icon: React.ReactNode }[] = [
    {
      mode: "original",
      label: "Original",
      icon: <Captions className="w-4 h-4" />,
    },
    {
      mode: "translated",
      label: "Translated",
      icon: <Languages className="w-4 h-4" />,
    },
    {
      mode: "dual",
      label: "Dual",
      icon: (
        <div className="flex">
          <Captions className="w-4 h-4 -mr-1" />
          <Languages className="w-4 h-4" />
        </div>
      ),
    },
  ];

  return (
    <div className={cn("flex items-center bg-gray-800/80 backdrop-blur rounded-lg p-1", className)}>
      {modes.map(({ mode, label, icon }) => (
        <button
          key={mode}
          onClick={() => setSubtitleDisplayMode(mode)}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
            subtitleDisplayMode === mode
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white hover:bg-gray-700"
          )}
          title={label}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};
