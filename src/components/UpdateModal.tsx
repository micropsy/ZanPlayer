import { CheckCircle2, Download, Loader2, RefreshCw, Rocket, X } from "lucide-react";
import { useAppStore } from "../services/store";
import { cancelUpdate, downloadUpdate, installAndRestart } from "../services/updater";

// Global update prompt. Rendered at the app root so it overlays everything with
// a blurred backdrop. Driven entirely by the store's updater state machine; the
// only phase that cannot be dismissed is the active download, to avoid leaving
// a corrupted staged update behind.
export const UpdateModal = () => {
  const updateModalOpen = useAppStore((s) => s.updateModalOpen);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const downloadProgress = useAppStore((s) => s.downloadProgress);
  const updateVersion = useAppStore((s) => s.updateVersion);

  if (!updateModalOpen) return null;

  const locked = updateStatus === "downloading";

  return (
    <div
      onClick={() => {
        if (!locked) cancelUpdate();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-modal-backdrop-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-gray-900 rounded-xl shadow-2xl w-96 p-6 border border-gray-700 animate-modal-in"
      >
        {!locked && (
          <button
            onClick={cancelUpdate}
            aria-label="Close"
            className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {updateStatus === "checking" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="w-8 h-8 text-zan-cyan animate-spin" />
            <p className="text-sm text-gray-300 font-medium">Checking for updates...</p>
          </div>
        )}

        {updateStatus === "available" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-zan-cyan/15 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-zan-cyan" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">
                Version {updateVersion} is available!
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                A new version of ZanPlayer is ready to download.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={cancelUpdate}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void downloadUpdate()}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-zan-cyan text-zan-black hover:brightness-110 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        )}

        {updateStatus === "downloading" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Loader2 className="w-8 h-8 text-zan-cyan animate-spin" />
            <div className="w-full">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-300 font-medium">Downloading...</span>
                <span className="text-gray-400">{downloadProgress}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-zan-cyan to-zan-blue transition-all duration-200 ease-out"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {updateStatus === "ready" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">Download complete.</h3>
              <p className="text-sm text-gray-400 mt-1">Version {updateVersion} is ready to install.</p>
            </div>
            <button
              onClick={() => void installAndRestart()}
              className="w-full px-4 py-3 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition-all flex items-center justify-center gap-2"
            >
              <Rocket className="w-4 h-4" />
              Install & Restart
            </button>
          </div>
        )}

        {updateStatus === "uptodate" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-100">ZanPlayer is up to date.</h3>
              <p className="text-sm text-gray-400 mt-1">You're running the latest version.</p>
            </div>
            <button
              onClick={cancelUpdate}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};