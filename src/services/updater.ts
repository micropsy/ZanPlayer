import { getVersion } from "@tauri-apps/api/app";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { isTauri, TauriService } from "./tauri";
import { useAppStore } from "./store";

function errorDetail(err: unknown): string {
  return err instanceof Error && err.message.trim()
    ? err.message.trim()
    : typeof err === "string"
      ? err
      : "Unknown error";
}

// Shared update flow driven by the store so the manual "Check for Updates"
// button in Settings and the silent background check on startup stay in sync.
// `mode: "background"` never surfaces a "no updates" message - it only prompts
// the user when an update actually exists.
export async function checkForUpdates(mode: "manual" | "background" = "manual"): Promise<void> {
  if (!isTauri()) return;
  const store = useAppStore.getState();
  store.setUpdateChecking(true);
  store.setUpdateNotice(null);
  store.setIsUpdateReady(false);
  store.setDownloadProgress(0);
  store.setIsDownloading(false);

  const reset = () => {
    useAppStore.getState().setIsDownloading(false);
    useAppStore.getState().setIsUpdateReady(false);
    useAppStore.getState().setDownloadProgress(0);
  };

  try {
    const update = await check();
    if (update) {
      const installNow = await ask(
        `Version ${update.version} is available. Do you want to download it?`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Download",
          cancelLabel: "Later",
        }
      ).catch(() => false);
      if (installNow) {
        // Switch the button out for the live download-progress bar, then let
        // the user decide when to relaunch once the download finishes.
        useAppStore.getState().setUpdateChecking(false);
        useAppStore.getState().setIsDownloading(true);
        useAppStore.getState().setDownloadProgress(0);
        let totalBytes = 0;
        let downloadedBytes = 0;
        try {
          await update.downloadAndInstall((event) => {
            if (event.event === "Started") {
              totalBytes = event.data.contentLength ?? 0;
              downloadedBytes = 0;
              useAppStore.getState().setDownloadProgress(0);
            } else if (event.event === "Progress") {
              downloadedBytes += event.data.chunkLength;
              // Guard against division by zero when the server omits the total
              // size; the bar simply stays at its current percentage.
              if (totalBytes > 0) {
                const percent = Math.min(
                  100,
                  Math.round((downloadedBytes / totalBytes) * 100)
                );
                useAppStore.getState().setDownloadProgress(percent);
              }
            } else if (event.event === "Finished") {
              useAppStore.getState().setDownloadProgress(100);
              useAppStore.getState().setIsDownloading(false);
              useAppStore.getState().setIsUpdateReady(true);
              useAppStore.getState().setUpdateVersion(update.version);
            }
          });
        } catch (err) {
          console.error("Update download failed:", err);
          reset();
          await message(`Update download failed. ${errorDetail(err)}`, {
            title: "Update Error",
            kind: "error",
          }).catch(() => {});
        }
      }
    } else if (mode === "manual") {
      const version = await getVersion().catch(() => "");
      useAppStore.getState().setUpdateNotice(
        version ? `ZanPlayer is up to date (v${version})` : "ZanPlayer is up to date"
      );
    }
  } catch (error) {
    console.error("Update check failed:", error);
    reset();
    const detail = errorDetail(error);
    if (detail.toLowerCase().includes("offline") || detail.toLowerCase().includes("no internet")) {
      await message("No internet connection. Please check your connection and try again.", {
        title: "Update Error",
        kind: "error",
      }).catch(() => {});
    } else {
      await message(`Unable to check for updates. ${detail}`, {
        title: "Update Error",
        kind: "error",
      }).catch(() => {});
    }
  } finally {
    if (isTauri()) useAppStore.getState().setUpdateChecking(false);
  }
}

export async function installAndRestart(): Promise<void> {
  if (!isTauri()) return;
  try {
    // Equivalent to `relaunch()` from @tauri-apps/plugin-process: the bundled
    // Rust `relaunch_app` command exits the process and the updater applies the
    // staged update on the next launch.
    await TauriService.relaunchApp();
  } catch (error) {
    console.error("Relaunch failed:", error);
    useAppStore.getState().setIsUpdateReady(false);
    useAppStore.getState().setIsDownloading(false);
    useAppStore.getState().setDownloadProgress(0);
    await message(`Unable to restart the app. ${errorDetail(error)}`, {
      title: "Update Error",
      kind: "error",
    }).catch(() => {});
  }
}