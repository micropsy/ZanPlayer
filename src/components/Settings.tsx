import { useAppStore } from "../services/store";
import { MicLanguages, Languages, Settings as SettingsIcon, Upload } from "lucide-react";

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
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <SettingsIcon className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-white">Settings</h2>
      </div>

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-400">
            Use Local Whisper
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
    </div>
  );
};
