import { useAppStore } from "../services/store";
import { MicLanguages, Languages, Settings as SettingsIcon } from "lucide-react";

export const SettingsComponent = () => {
  const {
    apiKey,
    setApiKey,
    defaultTargetLanguage,
    setDefaultTargetLanguage,
    theme,
    setTheme,
    useLocalWhisper,
    setUseLocalWhisper,
    whisperModel,
    setWhisperModel,
    subtitleStyle,
    setSubtitleStyle,
  } = useAppStore();

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

  const whisperModels = [
    "tiny.en",
    "tiny",
    "base.en",
    "base",
    "small.en",
    "small",
    "medium.en",
    "medium",
    "large",
  ];

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-white">Settings</h2>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-400">
          OpenAI API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {/* Target Language */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-400">
          Default Target Language
        </label>
        <select
          value={defaultTargetLanguage}
          onChange={(e) => setDefaultTargetLanguage(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-400">
          Theme
        </label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as "dark" | "light")}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      {/* Local Whisper */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-400">
            Use Local Whisper (Offline)
          </label>
          <button
            onClick={() => setUseLocalWhisper(!useLocalWhisper)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              useLocalWhisper ? "bg-blue-600" : "bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                useLocalWhisper ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {useLocalWhisper && (
          <select
            value={whisperModel}
            onChange={(e) => setWhisperModel(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            {whisperModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        )}
      </div>

      {/* Subtitle Style */}
      <div className="space-y-4 pt-4 border-t border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Languages className="w-4 h-4" />
          Subtitle Style
        </h3>

        {/* Font Name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
            Font Family
          </label>
          <input
            type="text"
            value={subtitleStyle.fontName}
            onChange={(e) => setSubtitleStyle({ fontName: e.target.value })}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Font Size */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
            Font Size: {subtitleStyle.fontSize}px
          </label>
          <input
            type="range"
            min="12"
            max="72"
            value={subtitleStyle.fontSize}
            onChange={(e) => setSubtitleStyle({ fontSize: parseInt(e.target.value) })}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Primary Color */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
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
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Outline Color */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
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
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Back Color */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
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
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* Bold & Italic */}
        <div className="flex gap-4">
          <div className="flex items-center justify-between flex-1">
            <label className="text-sm font-medium text-gray-400">Bold</label>
            <button
              onClick={() => setSubtitleStyle({ bold: !subtitleStyle.bold })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                subtitleStyle.bold ? "bg-blue-600" : "bg-gray-700"
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
            <label className="text-sm font-medium text-gray-400">Italic</label>
            <button
              onClick={() => setSubtitleStyle({ italic: !subtitleStyle.italic })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                subtitleStyle.italic ? "bg-blue-600" : "bg-gray-700"
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

        {/* Alignment */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
            Subtitle Position
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSubtitleStyle({ alignment: "top" })}
              className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
                subtitleStyle.alignment === "top"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              Top
            </button>
            <button
              onClick={() => setSubtitleStyle({ alignment: "bottom" })}
              className={`flex-1 px-4 py-3 rounded-xl border transition-all ${
                subtitleStyle.alignment === "bottom"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
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
