import { useAppStore } from "../services/store";
import { Languages, Settings as SettingsIcon, CheckCircle2, Info, Download, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "../services/tauri";
import { check } from "@tauri-apps/plugin-updater";

interface WhisperModel {
  id: string;
  name: string;
  description: string;
  accuracy: number;
  speed: number;
  size: string;
  isPlus?: boolean;
}

const whisperModels: WhisperModel[] = [
  {
    id: "tiny",
    name: "Tiny",
    description: "Fastest transcription with acceptable accuracy",
    accuracy: 55,
    speed: 100,
    size: "75MB",
  },
  {
    id: "base",
    name: "Base",
    description: "Good balance of speed and accuracy",
    accuracy: 65,
    speed: 85,
    size: "142MB",
  },
  {
    id: "small",
    name: "Small",
    description: "High accuracy with fast transcription speed",
    accuracy: 75,
    speed: 60,
    size: "461MB",
  },
  {
    id: "medium",
    name: "Medium",
    description: "Very high accuracy with good speed",
    accuracy: 85,
    speed: 35,
    size: "1.5GB",
    isPlus: true,
  },
  {
    id: "large",
    name: "Large",
    description: "Maximum accuracy with slowest transcription speed",
    accuracy: 95,
    speed: 10,
    size: "2.9GB",
    isPlus: true,
  },
];

const systemFonts = [
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
  "Arial, sans-serif",
  "Helvetica, sans-serif",
  "Georgia, serif",
  "Times New Roman, serif",
  "Verdana, sans-serif",
  "Tahoma, sans-serif",
  "Geneva, sans-serif",
  "Courier New, monospace",
  "monospace",
  "serif",
  "sans-serif",
];

export const SettingsComponent = () => {
  const {
    theme,
    setTheme,
    whisperModel,
    setWhisperModel,
    subtitleStyle,
    setSubtitleStyle,
    downloadedModels,
    downloadingModels,
    loadDownloadedModels,
    downloadModel,
    deleteModel,
  } = useAppStore();
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not_available' | 'installing'>('idle');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  console.log("isTauri():", isTauri());

  useEffect(() => {
    loadDownloadedModels();
  }, [loadDownloadedModels]);

  const checkForUpdates = async () => {
    if (!isTauri()) return;
    setUpdateStatus('checking');
    try {
      const update = await check();
      if (update) {
        setUpdateStatus('available');
        setUpdateInfo(update);
      } else {
        setUpdateStatus('not_available');
      }
    } catch (error) {
      console.error("Update check failed:", error);
      setUpdateStatus('idle');
    }
  };

  const installUpdate = async () => {
    if (!updateInfo) return;
    setUpdateStatus('installing');
    try {
      await updateInfo.downloadAndInstall();
      // Application will restart automatically after install
    } catch (error) {
      console.error("Update installation failed:", error);
      setUpdateStatus('idle');
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-2">
        <SettingsIcon className={`w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
        <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Settings
        </h2>
      </div>

      <div className="space-y-2">
        <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Theme
        </label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as "dark" | "light")}
          className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Updates
        </label>
        {isTauri() ? (
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
          }`}>
            {updateStatus === 'idle' && (
            <button
              onClick={checkForUpdates}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all`}
            >
              <RefreshCw className="w-4 h-4" />
              Check for Updates
            </button>
            )}
            
            {updateStatus === 'checking' && (
            <div className={`flex items-center justify-center gap-2 px-4 py-3`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>Checking...</span>
            </div>
            )}
            
            {updateStatus === 'not_available' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-4 py-3 text-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>You're up to date!</span>
              </div>
              <button
                onClick={checkForUpdates}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm ${
                  theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-700'
                }`}
              >
                Check again
              </button>
            </div>
            )}
            
            {updateStatus === 'available' && (
            <div className="space-y-2">
              <div className={`text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
              }`}>
                New version available!
              </div>
              <button
                onClick={installUpdate}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl transition-all"
              >
                Install Update
              </button>
            </div>
            )}
            
            {updateStatus === 'installing' && (
            <div className="flex items-center justify-center gap-2 px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>Installing...</span>
            </div>
            )}
          </div>
        ) : (
          <div className={`p-4 rounded-xl border ${
            theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
          }`}>
            <p className={`text-sm ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Update feature is only available in the desktop app.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            Models
          </h3>
          <Info className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
        <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          Select a model to use for creating subtitles. Higher quality models provide better accuracy for more difficult audio.
        </p>

        <div className={`p-4 rounded-xl border ${
          theme === 'dark'
            ? 'bg-gray-800 border-gray-700'
            : 'bg-white border-gray-300'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${
              theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Current Model
            </span>
            <span className={`text-sm ${
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {whisperModels.find(m => m.id === whisperModel)?.name || whisperModel}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className={`text-sm font-semibold ${
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          }`}>
            All Models
          </h4>
          {whisperModels.map((model) => {
            const isDownloaded = downloadedModels.includes(model.id);
            const isDownloading = downloadingModels.has(model.id);
            const isSelected = whisperModel === model.id;
            
            return (
              <div
                key={model.id}
                className={`p-4 rounded-xl border transition-all ${
                  isSelected
                    ? theme === 'dark'
                      ? 'bg-blue-900/20 border-blue-500'
                      : 'bg-blue-50 border-blue-500'
                    : theme === 'dark'
                      ? 'bg-gray-800 border-gray-700'
                      : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <h5 className={`font-medium ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {model.name}
                    </h5>
                    {model.isPlus && (
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-full">
                        Plus
                      </span>
                    )}
                    {isDownloaded && (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Loaded
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                  </div>
                </div>
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  {model.description}
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs w-16 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Accuracy:
                    </span>
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${model.accuracy}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs w-16 ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Speed:
                    </span>
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                      theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${model.speed}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs w-16 ${
                        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Size:
                      </span>
                      <span className={`text-xs ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {model.size}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!isDownloaded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isTauri()) downloadModel(model.id);
                          }}
                          disabled={isDownloading || !isTauri()}
                          className={`px-3 py-1.5 text-white rounded-lg text-sm font-medium flex items-center gap-1 ${
                            isTauri()
                              ? isDownloading
                                ? 'bg-gray-600 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                              : 'bg-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {isDownloading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {!isTauri()
                            ? 'Requires App'
                            : isDownloading
                              ? 'Downloading...'
                              : 'Download'}
                        </button>
                      )}
                      {isDownloaded && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setWhisperModel(model.id);
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                          >
                            Use
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isTauri()) setShowDeleteConfirm(model.id);
                            }}
                            disabled={!isTauri()}
                            className={`p-1.5 rounded-lg ${
                              isTauri()
                                ? theme === 'dark'
                                  ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/20'
                                  : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                                : 'text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {showDeleteConfirm === model.id && (
                  <div className={`mt-4 p-4 rounded-lg border ${
                    theme === 'dark'
                      ? 'bg-red-500/10 border-red-500/20'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <p className={`text-sm mb-3 ${
                      theme === 'dark' ? 'text-red-300' : 'text-red-600'
                    }`}>
                      Are you sure you want to delete this model?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
                          theme === 'dark'
                            ? 'bg-gray-700 hover:bg-gray-600 text-white'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          deleteModel(model.id);
                          setShowDeleteConfirm(null);
                          if (whisperModel === model.id) {
                            setWhisperModel("tiny");
                          }
                        }}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`space-y-4 pt-4 border-t ${
        theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <h3 className={`text-sm font-semibold flex items-center gap-2 ${
          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
        }`}>
          <Languages className="w-4 h-4" />
          Subtitle Style
        </h3>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Font Family
          </label>
          <select
            value={subtitleStyle.fontName}
            onChange={(e) => setSubtitleStyle({ fontName: e.target.value })}
            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
              theme === 'dark'
                ? 'bg-gray-800 border-gray-700 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            {systemFonts.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font.split(',')[0].replace(/['"]/g, '')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Font Size: {subtitleStyle.fontSize}px
          </label>
          <input
            type="range"
            min="12"
            max="72"
            value={subtitleStyle.fontSize}
            onChange={(e) => setSubtitleStyle({ fontSize: parseInt(e.target.value) })}
            className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
            }`}
          />
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Text Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={subtitleStyle.primaryColor}
              onChange={(e) => setSubtitleStyle({ primaryColor: e.target.value })}
              className="w-12 h-10 rounded cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={subtitleStyle.primaryColor}
              onChange={(e) => setSubtitleStyle({ primaryColor: e.target.value })}
              className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Outline Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={subtitleStyle.outlineColor}
              onChange={(e) => setSubtitleStyle({ outlineColor: e.target.value })}
              className="w-12 h-10 rounded cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={subtitleStyle.outlineColor}
              onChange={(e) => setSubtitleStyle({ outlineColor: e.target.value })}
              className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={subtitleStyle.backColor.slice(0, 7)}
              onChange={(e) => {
                const newColor = e.target.value + subtitleStyle.backColor.slice(7);
                setSubtitleStyle({ backColor: newColor });
              }}
              className="w-12 h-10 rounded cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={subtitleStyle.backColor}
              onChange={(e) => setSubtitleStyle({ backColor: e.target.value })}
              className={`flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex items-center justify-between flex-1">
            <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Bold
            </label>
            <button
              onClick={() => setSubtitleStyle({ bold: !subtitleStyle.bold })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                subtitleStyle.bold ? "bg-blue-600" : theme === 'dark' ? "bg-gray-700" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  subtitleStyle.bold ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between flex-1">
            <label className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Italic
            </label>
            <button
              onClick={() => setSubtitleStyle({ italic: !subtitleStyle.italic })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                subtitleStyle.italic ? "bg-blue-600" : theme === 'dark' ? "bg-gray-700" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  subtitleStyle.italic ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Subtitle Position
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSubtitleStyle({ alignment: "top" })}
              className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
                subtitleStyle.alignment === "top"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : theme === 'dark'
                    ? "bg-gray-800 border-gray-700 text-gray-400"
                    : "bg-white border-gray-300 text-gray-600"
              }`}
            >
              Top
            </button>
            <button
              onClick={() => setSubtitleStyle({ alignment: "bottom" })}
              className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
                subtitleStyle.alignment === "bottom"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : theme === 'dark'
                    ? "bg-gray-800 border-gray-700 text-gray-400"
                    : "bg-white border-gray-300 text-gray-600"
              }`}
            >
              Bottom
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
