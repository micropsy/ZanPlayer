import React, { useState, useCallback, useRef } from "react";
import { useAppStore } from "../services/store";
import {
  Languages,
  Upload,
  AlertCircle,
  CheckCircle2,
  Download,
  Settings as SettingsIcon,
  Trash2,
  List,
  FileText,
  Plus,
  FileVideo,
  Menu,
} from "lucide-react";

import { TauriService } from "../services/tauri";
import { SettingsComponent } from "./Settings";
import { cn } from "../utils/cn";
import type { SubtitleTrack } from "../types/subtitle";

type Tab = "main" | "settings" | "editor";

export const Sidebar = () => {
  const {
    setCurrentVideoUrl,
    subtitleTracks,
    setSubtitleTracks,
    activeSubtitleTrackId,
    setActiveSubtitleTrackId,
    activeTranslatedTrackId,
    setActiveTranslatedTrackId,
    currentVideo,
    setCurrentVideo,
    currentVideoPath,
    setCurrentVideoPath,
    updateCue,
    updateCueTiming,
    shiftAllCues,
    deleteCue,
    addCue,
    progressStep,
    progressPercent,
    setProgress,
    whisperModel,
    setSeekTo,
    theme,
    setSidebarVisible,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("main");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shiftOffset, setShiftOffset] = useState<string>("0");
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto");

  // Whisper supported languages
  const languages = [
    { code: "auto", name: "Auto Detect" },
    { code: "en", name: "English" },
    { code: "zh", name: "Chinese" },
    { code: "de", name: "German" },
    { code: "es", name: "Spanish" },
    { code: "ru", name: "Russian" },
    { code: "ko", name: "Korean" },
    { code: "fr", name: "French" },
    { code: "ja", name: "Japanese" },
    { code: "pt", name: "Portuguese" },
    { code: "tr", name: "Turkish" },
    { code: "pl", name: "Polish" },
    { code: "ca", name: "Catalan" },
    { code: "nl", name: "Dutch" },
    { code: "ar", name: "Arabic" },
    { code: "sv", name: "Swedish" },
    { code: "it", name: "Italian" },
    { code: "id", name: "Indonesian" },
    { code: "hi", name: "Hindi" },
    { code: "fi", name: "Finnish" },
    { code: "vi", name: "Vietnamese" },
    { code: "iw", name: "Hebrew" },
    { code: "uk", name: "Ukrainian" },
    { code: "el", name: "Greek" },
    { code: "ms", name: "Malay" },
    { code: "cs", name: "Czech" },
    { code: "ro", name: "Romanian" },
    { code: "da", name: "Danish" },
    { code: "hu", name: "Hungarian" },
    { code: "ta", name: "Tamil" },
    { code: "no", name: "Norwegian" },
    { code: "th", name: "Thai" },
    { code: "ur", name: "Urdu" },
    { code: "hr", name: "Croatian" },
    { code: "bg", name: "Bulgarian" },
    { code: "lt", name: "Lithuanian" },
    { code: "la", name: "Latin" },
    { code: "mi", name: "Maori" },
    { code: "ml", name: "Malayalam" },
    { code: "cy", name: "Welsh" },
    { code: "sk", name: "Slovak" },
    { code: "te", name: "Telugu" },
    { code: "fa", name: "Persian" },
    { code: "lv", name: "Latvian" },
    { code: "bn", name: "Bengali" },
    { code: "sr", name: "Serbian" },
    { code: "az", name: "Azerbaijani" },
    { code: "sl", name: "Slovenian" },
    { code: "kn", name: "Kannada" },
    { code: "et", name: "Estonian" },
    { code: "mk", name: "Macedonian" },
    { code: "br", name: "Breton" },
    { code: "eu", name: "Basque" },
    { code: "is", name: "Icelandic" },
    { code: "hy", name: "Armenian" },
    { code: "ne", name: "Nepali" },
    { code: "mn", name: "Mongolian" },
    { code: "bs", name: "Bosnian" },
    { code: "kk", name: "Kazakh" },
    { code: "sq", name: "Albanian" },
    { code: "sw", name: "Swahili" },
    { code: "gl", name: "Galician" },
    { code: "mr", name: "Marathi" },
    { code: "pa", name: "Punjabi" },
    { code: "si", name: "Sinhala" },
    { code: "km", name: "Khmer" },
    { code: "sn", name: "Shona" },
    { code: "yo", name: "Yoruba" },
    { code: "so", name: "Somali" },
    { code: "af", name: "Afrikaans" },
    { code: "oc", name: "Occitan" },
    { code: "ka", name: "Georgian" },
    { code: "be", name: "Belarusian" },
    { code: "tg", name: "Tajik" },
    { code: "sd", name: "Sindhi" },
    { code: "gu", name: "Gujarati" },
    { code: "am", name: "Amharic" },
    { code: "yi", name: "Yiddish" },
    { code: "lo", name: "Lao" },
    { code: "uz", name: "Uzbek" },
    { code: "fo", name: "Faroese" },
    { code: "ht", name: "Haitian Creole" },
    { code: "ps", name: "Pashto" },
    { code: "tk", name: "Turkmen" },
    { code: "nn", name: "Nynorsk" },
    { code: "mt", name: "Maltese" },
    { code: "sa", name: "Sanskrit" },
    { code: "lb", name: "Luxembish" },
    { code: "my", name: "Burmese" },
    { code: "bo", name: "Tibetan" },
    { code: "tl", name: "Tagalog" },
    { code: "mg", name: "Malagasy" },
    { code: "as", name: "Assamese" },
    { code: "tt", name: "Tatar" },
    { code: "haw", name: "Hawaiian" },
    { code: "ln", name: "Lingala" },
    { code: "ha", name: "Hausa" },
    { code: "ba", name: "Bashkir" },
    { code: "jw", name: "Javanese" },
    { code: "su", name: "Sundanese" },
  ];

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMessage(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("video/")) {
        setCurrentVideo(file);
        const url = URL.createObjectURL(file);
        setCurrentVideoUrl(url);
        setCurrentVideoPath(null);
      } else if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
        // Handle subtitle file
        try {
          const text = await file.text();
          let cues;
          if (file.name.endsWith(".srt")) {
            cues = parseSRT(text);
          } else {
            cues = parseVTT(text);
          }
          const track: SubtitleTrack = {
            id: `track-${Date.now()}`,
            name: file.name,
            language: "Unknown",
            cues,
          };
          setSubtitleTracks([...subtitleTracks, track]);
          setActiveSubtitleTrackId(track.id);
        } catch (err) {
          setErrorMessage(`Error reading subtitle file: ${(err as Error).message}`);
        }
      }
    }
  }, [currentVideo, subtitleTracks]);

  const parseSRT = (text: string) => {
    const cues: any[] = [];
    const blocks = text.trim().split(/\n\n+/);
    blocks.forEach(block => {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (timeMatch) {
          const startTime = parseFloat(timeMatch[1])*3600 + parseFloat(timeMatch[2])*60 + parseFloat(timeMatch[3]) + parseFloat(timeMatch[4])/1000;
          const endTime = parseFloat(timeMatch[5])*3600 + parseFloat(timeMatch[6])*60 + parseFloat(timeMatch[7]) + parseFloat(timeMatch[8])/1000;
          const text = lines.slice(2).join('\n');
          cues.push({
            id: `cue-${Date.now()}-${Math.random()}`,
            startTime,
            endTime,
            text,
          });
        }
      }
    });
    return cues;
  };

  const parseVTT = (text: string) => {
    const cues: any[] = [];
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }
    while (i < lines.length) {
      const timeLine = lines[i];
      const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      if (timeMatch) {
        const startTime = parseFloat(timeMatch[1])*3600 + parseFloat(timeMatch[2])*60 + parseFloat(timeMatch[3]) + parseFloat(timeMatch[4])/1000;
        const endTime = parseFloat(timeMatch[5])*3600 + parseFloat(timeMatch[6])*60 + parseFloat(timeMatch[7]) + parseFloat(timeMatch[8])/1000;
        i++;
        let cueText = '';
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          cueText += (cueText ? '\n' : '') + lines[i];
          i++;
        }
        cues.push({
          id: `cue-${Date.now()}-${Math.random()}`,
          startTime,
          endTime,
          text: cueText.trim(),
        });
      } else {
        i++;
      }
    }
    return cues;
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith("video/")) {
        setCurrentVideo(file);
        const url = URL.createObjectURL(file);
        setCurrentVideoUrl(url);
        setCurrentVideoPath(null);
        setErrorMessage(null);
      } else if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
        // Handle subtitle file
        try {
          file.text().then(text => {
            let cues;
            if (file.name.endsWith(".srt")) {
              cues = parseSRT(text);
            } else {
              cues = parseVTT(text);
            }
            const track: SubtitleTrack = {
              id: `track-${Date.now()}`,
              name: file.name,
              language: "Unknown",
              cues,
            };
            setSubtitleTracks([...subtitleTracks, track]);
            setActiveSubtitleTrackId(track.id);
          });
        } catch (error) {
          setErrorMessage(`Error reading subtitle file: ${(error as Error).message}`);
        }
      }
    }
  };

  const isTauriApp = typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleFileInputRef = useRef<HTMLInputElement>(null);

  const handleNativeVideoSelect = async () => {
    if (!isTauriApp) {
      fileInputRef.current?.click();
      return;
    }
    setProgress("selecting" as any, 0);
    setErrorMessage(null);
    try {
      const videoFile = await TauriService.openVideoDialog();
      if (videoFile) {
        setCurrentVideoPath(videoFile.path);
        // Only set URL if running in Tauri environment
        if (isTauriApp) {
          // In Tauri, we'll use the path directly through Tauri's filesystem API
          // But for now, let's just set the URL to be handled specially
          // In a real Tauri app, you'd use tauri-plugin-fs to get a proper asset URL
          setCurrentVideoUrl(null); // We'll update the VideoPlayer component to handle this case
        } else {
          setCurrentVideoUrl(null);
        }
      }
    } catch (error) {
      setErrorMessage(`Error selecting video: ${(error as Error).message}`);
    } finally {
      setProgress("idle", 0);
    }
  };

  const handleLoadSubtitleFile = async () => {
    if (!isTauriApp) {
      subtitleFileInputRef.current?.click();
      return;
    }
    try {
      const filePath = await TauriService.openSubtitleDialog();
      if (filePath) {
        const cues = await TauriService.readSubtitleFile(filePath);
        const track: SubtitleTrack = {
          id: `track-${Date.now()}`,
          name: `Subtitles (${filePath.split("/").pop()?.split(".").pop() || ""})`,
          language: "Unknown",
          cues,
        };
        setSubtitleTracks([...subtitleTracks, track]);
        setActiveSubtitleTrackId(track.id);
      }
    } catch (error) {
      setErrorMessage(`Error loading subtitle: ${(error as Error).message}`);
    }
  };

  const handleGenerateSubtitles = async () => {
    if (!currentVideo && !currentVideoPath) {
      alert("Please select a video first");
      return;
    }

    setProgress("extracting", 0);
    setErrorMessage(null);
    let extractedAudioPath: string | null = null;
    let tempVideoPath: string | null = null;

    try {
      if (currentVideoPath) {
        console.log("Step 1: Extracting audio from native file...", currentVideoPath);
        const audioPath = await TauriService.extractAudio(currentVideoPath);
        console.log("Step 1 complete: Audio path", audioPath);
        extractedAudioPath = audioPath;
        setProgress("extracting", 100);
      } else if (currentVideo) {
        // For local whisper with uploaded file, we need to write it to disk first
        setProgress("saving", 25);
        console.log("Step 1: Writing uploaded file to disk...");
        const fileArrayBuffer = await currentVideo.arrayBuffer();
        const fileUint8Array = new Uint8Array(fileArrayBuffer);
        tempVideoPath = await TauriService.writeFile(currentVideo.name, fileUint8Array);
        console.log("Step 1 complete: Temp video path", tempVideoPath);
        setProgress("extracting", 50);
        
        console.log("Step 2: Extracting audio...");
        const audioPath = await TauriService.extractAudio(tempVideoPath);
        console.log("Step 2 complete: Audio path", audioPath);
        extractedAudioPath = audioPath;
        setProgress("extracting", 100);
      }

      if (!extractedAudioPath) {
        throw new Error("Failed to extract audio");
      }

      setProgress("transcribing", 0);
      const whisperLanguage = selectedLanguage === "auto" ? undefined : selectedLanguage;
      const cues = await TauriService.transcribeAudioLocal(
        extractedAudioPath,
        whisperModel,
        whisperLanguage
      );
      setProgress("transcribing", 100);

      const languageName = languages.find(l => l.code === selectedLanguage)?.name || "Unknown";
      const newTrack: SubtitleTrack = {
        id: `track-${Date.now()}`,
        name: `Auto-Generated (${languageName})`,
        language: languageName,
        cues,
        isGenerated: true,
      };

      setSubtitleTracks([...subtitleTracks, newTrack]);
      setActiveSubtitleTrackId(newTrack.id);
      setTimeout(() => setProgress("idle", 0), 1500);
    } catch (error) {
      console.error("Subtitle generation error:", error);
      const errMsg = (error as Error).message || String(error);
      setErrorMessage(`Error: ${errMsg}`);
      setProgress("idle", 0);
    }
  };

  const handleExport = async (format: "srt" | "vtt") => {
    const tracksToExport: { track: SubtitleTrack; suffix: string }[] = [];

    if (activeSubtitleTrackId) {
      const track = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
      if (track) tracksToExport.push({ track, suffix: `-${track.language.toLowerCase()}` });
    }

    if (activeTranslatedTrackId) {
      const track = subtitleTracks.find((t) => t.id === activeTranslatedTrackId);
      if (track) tracksToExport.push({ track, suffix: `-${track.language.toLowerCase()}` });
    }

    if (tracksToExport.length === 0) {
      alert("Please select at least one subtitle track");
      return;
    }

    for (const { track, suffix } of tracksToExport) {
      try {
        const defaultName = `subtitles${suffix}.${format}`;
        const savePath = await TauriService.saveSubtitleDialog(defaultName);
        if (savePath) {
          await TauriService.writeSubtitleFile(savePath, track.cues, format);
        }
      } catch (error) {
        console.error("Export error:", error);
        setErrorMessage(`Error exporting subtitles: ${(error as Error).message}`);
      }
    }

    setShowExportOptions(false);
  };

  const handleDeleteTrack = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this subtitle track?")) {
      const updatedTracks = subtitleTracks.filter((t) => t.id !== trackId);
      setSubtitleTracks(updatedTracks);
      if (activeSubtitleTrackId === trackId) {
        setActiveSubtitleTrackId(null);
      }
      if (activeTranslatedTrackId === trackId) {
        setActiveTranslatedTrackId(null);
      }
    }
  };

  const handleShiftAllCues = (trackId: string) => {
    const offset = parseFloat(shiftOffset);
    if (!isNaN(offset)) {
      shiftAllCues(trackId, offset);
    }
  };

  const getStepText = () => {
    switch (progressStep) {
      case "extracting":
        return "Extracting audio...";
      case "transcribing":
        return "Transcribing audio...";
      default:
        return "";
    }
  };

  const isProcessing = progressStep !== "idle";
  const originalTrack = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
  const translatedTrack = subtitleTracks.find((t) => t.id === activeTranslatedTrackId);
  const hasTracks = originalTrack || translatedTrack;



  return (
    <div 
      className={cn(
        "w-96 border-r flex flex-col h-full relative",
        theme === "dark" 
          ? "bg-gray-900 border-gray-700" 
          : "bg-white border-gray-200"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/20 border-4 border-dashed border-blue-500 flex items-center justify-center">
          <div className="text-center text-white">
            <FileVideo className="w-16 h-16 mx-auto mb-4" />
            <p className="text-xl font-semibold">Drop video or subtitle file</p>
          </div>
        </div>
      )}
      {/* Header Row */}
      <div className={cn(
        "flex items-center border-b",
        theme === "dark" ? "border-gray-700" : "border-gray-200"
      )}>
        {/* App Logo */}
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Languages className="w-5 h-5 text-white" />
          </div>
        </div>
        <button
          onClick={() => setActiveTab("main")}
          className={cn(
            "flex-1 py-3 px-4 text-sm font-medium transition-colors",
            activeTab === "main"
              ? theme === "dark"
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "bg-gray-100 text-gray-900 border-b-2 border-blue-500"
              : theme === "dark"
                ? "text-gray-500 hover:text-gray-300"
                : "text-gray-500 hover:text-gray-700"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <List className="w-4 h-4" />
            Main
          </div>
        </button>
        {hasTracks && (
          <button
            onClick={() => setActiveTab("editor")}
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors",
              activeTab === "editor"
                ? theme === "dark"
                  ? "bg-gray-800 text-white border-b-2 border-blue-500"
                  : "bg-gray-100 text-gray-900 border-b-2 border-blue-500"
                : theme === "dark"
                  ? "text-gray-500 hover:text-gray-300"
                  : "text-gray-500 hover:text-gray-700"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              Editor
            </div>
          </button>
        )}
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "p-3 transition-colors",
            (activeTab as Tab) === "settings"
              ? theme === "dark"
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "bg-gray-100 text-gray-900 border-b-2 border-blue-500"
              : theme === "dark"
                ? "text-gray-500 hover:text-gray-300"
                : "text-gray-500 hover:text-gray-700"
          )}
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSidebarVisible(false)}
          className={cn(
            "p-3 transition-colors",
            theme === "dark"
              ? "hover:bg-gray-800 text-gray-400 hover:text-white"
              : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          )}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {activeTab === "main" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={cn(
            "p-6 border-b",
            theme === "dark"
              ? "border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900"
              : "border-gray-200 bg-gradient-to-b from-gray-50 to-white"
          )}>
            <h2 className={cn(
              "text-2xl font-bold mb-4 flex items-center gap-2",
              theme === "dark" ? "text-white" : "text-gray-900"
            )}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Languages className="w-5 h-5 text-white" />
            </div>
            Sub Player
          </h2>

            {/* Error/Success Messages */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm">{errorMessage}</p>
              </div>
            )}
            {progressPercent === 100 && progressStep !== "idle" && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <p className="text-green-300 text-sm">Completed successfully!</p>
              </div>
            )}
            {/* Progress Bar */}
            {isProcessing && (
              <div className="mb-4">
                <p className={cn(
                  "text-sm mb-2",
                  theme === "dark" ? "text-gray-300" : "text-gray-600"
                )}>{getStepText()}</p>
                <div className={cn(
                  "h-2 rounded-full overflow-hidden",
                  theme === "dark" ? "bg-gray-700" : "bg-gray-200"
                )}>
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Video Upload Section */}
            <div className="space-y-3 mb-5">
              <button
                onClick={handleNativeVideoSelect}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <Upload className="w-5 h-5" />
                Select Video
              </button>
              <label className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 text-sm cursor-pointer",
                theme === "dark"
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-500 hover:text-gray-700"
              )}>
                or upload a file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </label>
              <input
                ref={subtitleFileInputRef}
                type="file"
                accept=".srt,.vtt"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            {/* Controls */}
            <div className="space-y-3">
              {/* Language Selector */}
              <div className="space-y-1">
                <label className={cn(
                  "block text-xs font-semibold uppercase tracking-wider",
                  theme === "dark" ? "text-gray-400" : "text-gray-500"
                )}>
                  Video Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className={cn(
                    "w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2",
                    theme === "dark"
                      ? "bg-gray-800 border-gray-700 text-white focus:border-blue-500 focus:ring-blue-500/20"
                      : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                  )}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateSubtitles}
                disabled={isProcessing || (!currentVideo && !currentVideoPath)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-green-900/20"
              >
                <Languages className="w-5 h-5" />
                {getStepText() || "Auto-Transcribe"}
              </button>

              <button
                onClick={handleLoadSubtitleFile}
                disabled={isProcessing}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all",
                  theme === "dark"
                    ? "bg-gray-800 hover:bg-gray-700 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                )}
              >
                <FileText className="w-5 h-5" />
                Load Subtitle File
              </button>

              {/* Export Options */}
              {hasTracks && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportOptions(!showExportOptions)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Download className="w-5 h-5" />
                    Export Subtitles
                  </button>

                  {showExportOptions && (
                    <div className={cn(
                      "absolute bottom-full left-0 right-0 mb-2 border rounded-xl shadow-2xl overflow-hidden z-10",
                      theme === "dark"
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-200"
                    )}>
                      <button
                        onClick={() => handleExport("srt")}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors flex items-center gap-3",
                          theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"
                        )}
                      >
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-white">SRT</span>
                        </div>
                        <div>
                          <p className={cn(
                            "font-semibold",
                            theme === "dark" ? "text-white" : "text-gray-900"
                          )}>Export SRT</p>
                          <p className="text-xs text-gray-400">SubRip format</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleExport("vtt")}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors flex items-center gap-3",
                          theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"
                        )}
                      >
                        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-white">VTT</span>
                        </div>
                        <div>
                          <p className={cn(
                            "font-semibold",
                            theme === "dark" ? "text-white" : "text-gray-900"
                          )}>Export VTT</p>
                          <p className="text-xs text-gray-400">WebVTT format</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Subtitle Tracks */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className={cn(
              "p-4 border-b",
              theme === "dark"
                ? "border-gray-700 bg-gray-850"
                : "border-gray-200 bg-gray-50"
            )}>
              <h3 className={cn(
                "text-xs font-semibold uppercase tracking-wider flex items-center gap-2",
                theme === "dark" ? "text-gray-400" : "text-gray-500"
              )}>
                <List className="w-4 h-4" />
                Subtitle Tracks
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {subtitleTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => {
                    if (track.isTranslated) {
                      setActiveTranslatedTrackId(
                        activeTranslatedTrackId === track.id ? null : track.id
                      );
                    } else {
                      setActiveSubtitleTrackId(
                        activeSubtitleTrackId === track.id ? null : track.id
                      );
                    }
                  }}
                  className={cn(
                    "relative p-4 rounded-xl border transition-all cursor-pointer group",
                    (activeSubtitleTrackId === track.id || activeTranslatedTrackId === track.id)
                      ? "bg-blue-900/20 border-blue-500 shadow-lg shadow-blue-900/10"
                      : theme === "dark"
                        ? "bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600"
                        : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className={cn(
                        "font-semibold text-sm",
                        (activeSubtitleTrackId === track.id || activeTranslatedTrackId === track.id)
                          ? "text-blue-300"
                          : theme === "dark"
                            ? "text-white"
                            : "text-gray-900"
                      )}>
                        {track.name}
                      </h4>
                      <p className={cn(
                        "text-xs mt-0.5",
                        theme === "dark" ? "text-gray-500" : "text-gray-400"
                      )}>
                        {track.language} • {track.cues.length} cues
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {track.isGenerated && (
                        <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">
                          Generated
                        </span>
                      )}
                      {track.isTranslated && (
                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-medium">
                          Translated
                        </span>
                      )}
                      <button
                        onClick={(e) => handleDeleteTrack(track.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Shift controls for original track */}
                  {!track.isTranslated && (
                    <div className={cn(
                      "mt-2 pt-2 border-t",
                      theme === "dark" ? "border-gray-700" : "border-gray-200"
                    )}>
                      <label className={cn(
                        "text-xs mb-1 block",
                        theme === "dark" ? "text-gray-500" : "text-gray-500"
                      )}>Shift all (seconds)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={shiftOffset}
                          onChange={(e) => setShiftOffset(e.target.value)}
                          step="0.1"
                          className={cn(
                            "flex-1 px-2 py-1 border rounded text-sm",
                            theme === "dark"
                              ? "bg-gray-900 border-gray-700 text-white"
                              : "bg-white border-gray-300 text-gray-900"
                          )}
                        />
                        <button
                          onClick={() => handleShiftAllCues(track.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                        >
                          Shift
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {subtitleTracks.length === 0 && (
                <div className={cn(
                  "flex flex-col items-center justify-center py-12",
                  theme === "dark" ? "text-gray-500" : "text-gray-400"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center mb-3",
                    theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  )}>
                    <Languages className="w-6 h-6 opacity-50" />
                  </div>
                  <p className="text-sm">No subtitle tracks yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "editor" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={cn(
            "p-4 border-b",
            theme === "dark"
              ? "border-gray-700 bg-gray-850"
              : "border-gray-200 bg-gray-50"
          )}>
            <h3 className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              theme === "dark" ? "text-gray-400" : "text-gray-500"
            )}>
              Subtitle Editor
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {originalTrack?.cues.map((originalCue, index) => {
              const translatedCue = translatedTrack?.cues[index];
              return (
                <div
                  key={originalCue.id}
                  className={cn(
                    "rounded-xl p-4 border transition-all cursor-pointer",
                    theme === "dark"
                      ? "bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750"
                      : "bg-white border-gray-200 hover:border-blue-500 hover:bg-gray-50"
                  )}
                  onClick={() => setSeekTo(originalCue.startTime)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn(
                      "text-xs font-mono",
                      theme === "dark" ? "text-gray-500" : "text-gray-400"
                    )}>
                      {Math.floor(originalCue.startTime / 3600).toString().padStart(2, "0")}:
                      {Math.floor((originalCue.startTime % 3600) / 60).toString().padStart(2, "0")}:
                      {Math.floor(originalCue.startTime % 60).toString().padStart(2, "0")},
                      {Math.floor((originalCue.startTime % 1) * 1000).toString().padStart(3, "0")}
                       → 
                      {Math.floor(originalCue.endTime / 3600).toString().padStart(2, "0")}:
                      {Math.floor((originalCue.endTime % 3600) / 60).toString().padStart(2, "0")}:
                      {Math.floor(originalCue.endTime % 60).toString().padStart(2, "0")},
                      {Math.floor((originalCue.endTime % 1) * 1000).toString().padStart(3, "0")}
                    </span>
                    <button
                      onClick={() => deleteCue(originalTrack.id, originalCue.id)}
                      className={cn(
                        "p-1 rounded transition-all",
                        theme === "dark"
                          ? "text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                          : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {originalTrack && (
                      <div>
                        <label className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-1 block">
                          Original
                        </label>
                        <textarea
                          value={originalCue.text}
                          onChange={(e) => updateCue(originalTrack.id, originalCue.id, e.target.value)}
                          className={cn(
                            "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none",
                            theme === "dark"
                              ? "bg-gray-900 border-gray-700 text-white"
                              : "bg-white border-gray-300 text-gray-900"
                          )}
                          rows={2}
                        />
                      </div>
                    )}
                    {translatedTrack && translatedCue && (
                      <div>
                        <label className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1 block">
                          Translated
                        </label>
                        <textarea
                          value={translatedCue.text}
                          onChange={(e) => updateCue(translatedTrack.id, translatedCue.id, e.target.value)}
                          className={cn(
                            "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none",
                            theme === "dark"
                              ? "bg-gray-900 border-gray-700 text-white"
                              : "bg-white border-gray-300 text-gray-900"
                          )}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>

                  <div className={cn(
                    "mt-3 pt-3 border-t flex gap-2",
                    theme === "dark" ? "border-gray-700" : "border-gray-200"
                  )}>
                    <input
                      type="number"
                      step="0.1"
                      value={originalCue.startTime}
                      onChange={(e) =>
                        updateCueTiming(
                          originalTrack.id,
                          originalCue.id,
                          parseFloat(e.target.value) || 0,
                          originalCue.endTime
                        )
                      }
                      className={cn(
                        "w-full px-2 py-1 border rounded text-sm",
                        theme === "dark"
                          ? "bg-gray-900 border-gray-700 text-white"
                          : "bg-white border-gray-300 text-gray-900"
                      )}
                      placeholder="Start time"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={originalCue.endTime}
                      onChange={(e) =>
                        updateCueTiming(
                          originalTrack.id,
                          originalCue.id,
                          originalCue.startTime,
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className={cn(
                        "w-full px-2 py-1 border rounded text-sm",
                        theme === "dark"
                          ? "bg-gray-900 border-gray-700 text-white"
                          : "bg-white border-gray-300 text-gray-900"
                      )}
                      placeholder="End time"
                    />
                  </div>
                </div>
              );
            })}

            {!originalTrack && translatedTrack?.cues.map((cue) => (
              <div
                key={cue.id}
                className={cn(
                  "rounded-xl p-4 border transition-all cursor-pointer",
                  theme === "dark"
                    ? "bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750"
                    : "bg-white border-gray-200 hover:border-blue-500 hover:bg-gray-50"
                )}
                onClick={() => setSeekTo(cue.startTime)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn(
                    "text-xs font-mono",
                    theme === "dark" ? "text-gray-500" : "text-gray-400"
                  )}>
                    {Math.floor(cue.startTime / 3600).toString().padStart(2, "0")}:
                    {Math.floor((cue.startTime % 3600) / 60).toString().padStart(2, "0")}:
                    {Math.floor(cue.startTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>
                <textarea
                  value={cue.text}
                  onChange={(e) => updateCue(translatedTrack.id, cue.id, e.target.value)}
                  className={cn(
                    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none",
                    theme === "dark"
                      ? "bg-gray-900 border-gray-700 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  )}
                  rows={2}
                />
              </div>
            ))}

            {originalTrack && (
              <button
                onClick={() => {
                  const newCue = {
                    id: `cue-${Date.now()}`,
                    startTime: originalTrack.cues.length > 0
                      ? originalTrack.cues[originalTrack.cues.length - 1].endTime + 1
                      : 0,
                    endTime: originalTrack.cues.length > 0
                      ? originalTrack.cues[originalTrack.cues.length - 1].endTime + 4
                      : 3,
                    text: "",
                  };
                  addCue(originalTrack.id, newCue);
                }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl transition-all",
                  theme === "dark"
                    ? "border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
                    : "border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400"
                )}
              >
                <Plus className="w-4 h-4" />
                Add Cue
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="flex-1 overflow-y-auto">
          <SettingsComponent />
        </div>
      )}
    </div>
  );
};
