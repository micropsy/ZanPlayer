import { useState } from "react";
import { useAppStore } from "../services/store";
import {
  MicLanguages,
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
} from "lucide-react";
import { OpenAIService } from "../services/openai";
import { TauriService } from "../services/tauri";
import { SettingsComponent } from "./Settings";
import { cn } from "../utils/cn";
import type { SubtitleTrack } from "../types/subtitle";

type WorkflowStep = "idle" | "selecting" | "extracting" | "transcribing" | "translating" | "completed";
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
    apiKey,
    setApiKey,
    defaultTargetLanguage,
    setDefaultTargetLanguage,
    updateCue,
    updateCueTiming,
    shiftAllCues,
    deleteCue,
    addCue,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("main");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(defaultTargetLanguage);
  const [shiftOffset, setShiftOffset] = useState<string>("0");
  const [showExportOptions, setShowExportOptions] = useState(false);

  const languages = [
    "Burmese",
    "English",
    "Spanish",
    "French",
    "German",
    "Chinese (Simplified)",
    "Chinese (Traditional)",
    "Japanese",
    "Korean",
    "Portuguese",
    "Russian",
    "Arabic",
    "Hindi",
    "Thai",
    "Vietnamese",
  ];

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("video/")) {
      setCurrentVideo(file);
      const url = URL.createObjectURL(file);
      setCurrentVideoUrl(url);
      setCurrentVideoPath(null);
      setErrorMessage(null);
    }
  };

  const handleNativeVideoSelect = async () => {
    setWorkflowStep("selecting");
    setErrorMessage(null);
    try {
      const videoFile = await TauriService.openVideoDialog();
      if (videoFile) {
        setCurrentVideoPath(videoFile.path);
        const url = `file://${encodeURIComponent(videoFile.path)}`;
        setCurrentVideoUrl(url);
      }
    } catch (error) {
      setErrorMessage(`Error selecting video: ${(error as Error).message}`);
    } finally {
      setWorkflowStep("idle");
    }
  };

  const handleLoadSubtitleFile = async () => {
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
    if (!apiKey) {
      alert("Please enter an OpenAI API key in Settings");
      return;
    }

    if (!currentVideo && !currentVideoPath) {
      alert("Please select a video first");
      return;
    }

    setWorkflowStep("extracting");
    setErrorMessage(null);
    let audioFile: File | null = null;

    try {
      if (currentVideoPath) {
        const audioPath = await TauriService.extractAudio(currentVideoPath);
        const audioBlob = await TauriService.readFileAsBlob(audioPath);
        audioFile = new File([audioBlob], "extracted_audio.wav", { type: "audio/wav" });
      } else if (currentVideo) {
        audioFile = currentVideo;
      }

      if (!audioFile) {
        throw new Error("No audio file available");
      }

      setWorkflowStep("transcribing");
      const service = new OpenAIService(apiKey);
      const cues = await service.transcribeAudio(audioFile);

      const newTrack: SubtitleTrack = {
        id: `track-${Date.now()}`,
        name: "Auto-Generated (English)",
        language: "English",
        cues,
        isGenerated: true,
      };

      setSubtitleTracks([...subtitleTracks, newTrack]);
      setActiveSubtitleTrackId(newTrack.id);
      setWorkflowStep("completed");
    } catch (error) {
      console.error("Subtitle generation error:", error);
      setErrorMessage(`Error: ${(error as Error).message}`);
      setWorkflowStep("idle");
    }
  };

  const handleTranslate = async () => {
    if (!apiKey) {
      alert("Please enter an OpenAI API key in Settings");
      return;
    }

    const activeTrack = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
    if (!activeTrack) {
      alert("Please select a subtitle track first");
      return;
    }

    setWorkflowStep("translating");
    setErrorMessage(null);
    try {
      const service = new OpenAIService(apiKey);
      const translatedCues = await service.batchTranslate(activeTrack.cues, targetLanguage);

      const newTrack: SubtitleTrack = {
        id: `translated-${Date.now()}`,
        name: `Translated (${targetLanguage})`,
        language: targetLanguage,
        cues: translatedCues,
        isTranslated: true,
      };

      const updatedTracks = [...subtitleTracks, newTrack];
      setSubtitleTracks(updatedTracks);
      setActiveTranslatedTrackId(newTrack.id);
      setWorkflowStep("completed");
    } catch (error) {
      console.error("Translation error:", error);
      setErrorMessage(`Translation error: ${(error as Error).message}`);
    } finally {
      setWorkflowStep("idle");
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
    switch (workflowStep) {
      case "selecting":
        return "Selecting video...";
      case "extracting":
        return "Extracting audio...";
      case "transcribing":
        return "Transcribing audio...";
      case "translating":
        return "Translating subtitles...";
      case "completed":
        return "Completed!";
      default:
        return "";
    }
  };

  const isProcessing = workflowStep !== "idle" && workflowStep !== "completed";
  const originalTrack = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
  const translatedTrack = subtitleTracks.find((t) => t.id === activeTranslatedTrackId);
  const hasTracks = originalTrack || translatedTrack;

  if (activeTab === "settings") {
    return <SettingsComponent />;
  }

  return (
    <div className="w-96 bg-gray-900 border-r border-gray-700 flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab("main")}
          className={cn(
            "flex-1 py-3 px-4 text-sm font-medium transition-colors",
            activeTab === "main"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-300"
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
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "text-gray-500 hover:text-gray-300"
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
            activeTab === "settings"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {activeTab === "main" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <MicLanguages className="w-5 h-5 text-white" />
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
            {workflowStep === "completed" && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <p className="text-green-300 text-sm">Completed successfully!</p>
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
              <label className="flex items-center justify-center gap-2 px-4 py-2 text-gray-400 hover:text-white text-sm cursor-pointer">
                or upload a file
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </label>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <button
                onClick={handleGenerateSubtitles}
                disabled={isProcessing || (!currentVideo && !currentVideoPath)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-green-900/20"
              >
                <MicLanguages className="w-5 h-5" />
                {getStepText() || "Auto-Transcribe"}
              </button>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Target Language
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleTranslate}
                disabled={isProcessing || !activeSubtitleTrackId}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-purple-900/20"
              >
                <Languages className="w-5 h-5" />
                {workflowStep === "translating" ? "Translating..." : "Auto-Translate"}
              </button>

              <button
                onClick={handleLoadSubtitleFile}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-all"
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
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-10">
                      <button
                        onClick={() => handleExport("srt")}
                        className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-3"
                      >
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-white">SRT</span>
                        </div>
                        <div>
                          <p className="font-semibold text-white">Export SRT</p>
                          <p className="text-xs text-gray-400">SubRip format</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handleExport("vtt")}
                        className="w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center gap-3"
                      >
                        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-white">VTT</span>
                        </div>
                        <div>
                          <p className="font-semibold text-white">Export VTT</p>
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
            <div className="p-4 border-b border-gray-700 bg-gray-850">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
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
                      : "bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className={cn(
                        "font-semibold text-sm",
                        (activeSubtitleTrackId === track.id || activeTranslatedTrackId === track.id)
                          ? "text-blue-300"
                          : "text-white"
                      )}>
                        {track.name}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">{track.cues.length} cues</p>
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
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <label className="text-xs text-gray-500 mb-1 block">Shift all (seconds)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={shiftOffset}
                          onChange={(e) => setShiftOffset(e.target.value)}
                          step="0.1"
                          className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
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
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-3">
                    <MicLanguages className="w-6 h-6 opacity-50" />
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
          <div className="p-4 border-b border-gray-700 bg-gray-850">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Subtitle Editor
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {originalTrack?.cues.map((originalCue, index) => {
              const translatedCue = translatedTrack?.cues[index];
              return (
                <div
                  key={originalCue.id}
                  className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-500 font-mono">
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
                      className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400"
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
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
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
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-700 flex gap-2">
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
                      className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
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
                      className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                      placeholder="End time"
                    />
                  </div>
                </div>
              );
            })}

            {!originalTrack && translatedTrack?.cues.map((cue) => (
              <div
                key={cue.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-mono">
                    {Math.floor(cue.startTime / 3600).toString().padStart(2, "0")}:
                    {Math.floor((cue.startTime % 3600) / 60).toString().padStart(2, "0")}:
                    {Math.floor(cue.startTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>
                <textarea
                  value={cue.text}
                  onChange={(e) => updateCue(translatedTrack.id, cue.id, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
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
                className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-700 rounded-xl text-gray-400 hover:text-white hover:border-gray-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Cue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
