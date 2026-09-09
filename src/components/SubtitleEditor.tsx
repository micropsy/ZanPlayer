import { X, Trash2, Plus } from "lucide-react";
import { useAppStore } from "../services/store";
import { cn } from "../utils/cn";
import type { FormEvent } from "react";

interface SubtitleEditorProps {
  onClose: () => void;
}

const autoResize = (e: FormEvent<HTMLTextAreaElement>) => {
  const el = e.currentTarget;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
};

const formatEditorTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

export const SubtitleEditor = ({ onClose }: SubtitleEditorProps) => {
  const subtitleTracks = useAppStore((s) => s.subtitleTracks);
  const activeSubtitleTrackId = useAppStore((s) => s.activeSubtitleTrackId);
  const activeTranslatedTrackId = useAppStore((s) => s.activeTranslatedTrackId);
  const setSeekTo = useAppStore((s) => s.setSeekTo);
  const updateCue = useAppStore((s) => s.updateCue);
  const updateCueTiming = useAppStore((s) => s.updateCueTiming);
  const deleteCue = useAppStore((s) => s.deleteCue);
  const addCue = useAppStore((s) => s.addCue);
  const theme = useAppStore((s) => s.theme);

  const originalTrack = subtitleTracks.find((t) => t.id === activeSubtitleTrackId);
  const translatedTrack = subtitleTracks.find((t) => t.id === activeTranslatedTrackId);

  const inputCls = cn(
    "w-[76px] px-2 py-1 border rounded-md text-right font-mono text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30",
    theme === "dark"
      ? "bg-gray-800 border-gray-700 text-white"
      : "bg-white border-gray-300 text-gray-900"
  );

  const textareaCls = (accent?: string) =>
    cn(
      "w-full px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:border-blue-500 resize-none overflow-y-auto min-h-[2.5rem] max-h-[120px]",
      accent,
      theme === "dark"
        ? "bg-gray-800 border-gray-700 text-white"
        : "bg-white border-gray-300 text-gray-900"
    );

  return (
    <aside
      className={cn(
        "w-[30%] min-w-[340px] max-w-[440px] h-full flex flex-col border-l",
        theme === "dark" ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2.5 border-b shrink-0",
          theme === "dark" ? "border-gray-700 bg-gray-850" : "border-gray-200 bg-gray-50"
        )}
      >
        <h3
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            theme === "dark" ? "text-gray-300" : "text-gray-600"
          )}
        >
          Subtitle Editor
        </h3>
        <button
          onClick={onClose}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            theme === "dark"
              ? "text-gray-400 hover:text-white hover:bg-gray-800"
              : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          )}
          title="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {originalTrack?.cues.map((originalCue, index) => {
          const translatedCue = translatedTrack?.cues[index];
          return (
            <div
              key={originalCue.id}
              onClick={() => setSeekTo(originalCue.startTime)}
              className={cn(
                "rounded-lg border p-2 transition-all cursor-pointer",
                theme === "dark"
                  ? "bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750"
                  : "bg-white border-gray-200 hover:border-blue-500 hover:bg-gray-50"
              )}
            >
              <div
                className="flex items-center gap-1.5 mb-1.5"
                onClick={(e) => e.stopPropagation()}
              >
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
                  className={inputCls}
                  placeholder="Start"
                />
                <span className="text-xs text-gray-500">{"\u2192"}</span>
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
                  className={inputCls}
                  placeholder="End"
                />
                <span
                  className={cn(
                    "text-[10px] font-mono ml-1 hidden md:block",
                    theme === "dark" ? "text-gray-500" : "text-gray-400"
                  )}
                >
                  {formatEditorTime(originalCue.startTime)}
                </span>
                <div className="flex-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCue(originalTrack.id, originalCue.id);
                  }}
                  className={cn(
                    "p-1 rounded transition-all",
                    theme === "dark"
                      ? "text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                      : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <textarea
                value={originalCue.text}
                onInput={autoResize}
                rows={2}
                onChange={(e) => updateCue(originalTrack.id, originalCue.id, e.target.value)}
                className={textareaCls()}
              />

              {translatedTrack && translatedCue && (
                <div className="mt-1.5">
                  <textarea
                    value={translatedCue.text}
                    onInput={autoResize}
                    rows={2}
                    onChange={(e) => updateCue(translatedTrack.id, translatedCue.id, e.target.value)}
                    className={cn(
                      textareaCls(),
                      "border-l-2",
                      theme === "dark" ? "border-l-purple-500/60" : "border-l-purple-400"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}

        {!originalTrack &&
          translatedTrack?.cues.map((cue) => (
            <div
              key={cue.id}
              onClick={() => setSeekTo(cue.startTime)}
              className={cn(
                "rounded-lg border p-2 transition-all cursor-pointer",
                theme === "dark"
                  ? "bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750"
                  : "bg-white border-gray-200 hover:border-blue-500 hover:bg-gray-50"
              )}
            >
              <div
                className="flex items-center justify-between mb-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    theme === "dark" ? "text-gray-500" : "text-gray-400"
                  )}
                >
                  {formatEditorTime(cue.startTime)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCue(translatedTrack.id, cue.id);
                  }}
                  className={cn(
                    "p-1 rounded transition-all",
                    theme === "dark"
                      ? "text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                      : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={cue.text}
                onInput={autoResize}
                rows={2}
                onChange={(e) => updateCue(translatedTrack.id, cue.id, e.target.value)}
                className={cn(
                  textareaCls(),
                  "border-l-2",
                  theme === "dark" ? "border-l-purple-500/60" : "border-l-purple-400"
                )}
              />
            </div>
          ))}

        {originalTrack && (
          <button
            onClick={() => {
              const cues = originalTrack.cues;
              const start = cues.length > 0 ? cues[cues.length - 1].endTime + 1 : 0;
              const end = cues.length > 0 ? cues[cues.length - 1].endTime + 4 : 3;
              addCue(originalTrack.id, { id: `cue-${Date.now()}`, startTime: start, endTime: end, text: "" });
            }}
            className={cn(
              "w-full flex items-center justify-center gap-2 p-2 border border-dashed rounded-lg text-sm transition-all",
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
    </aside>
  );
};