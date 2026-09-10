import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dirname } from "@tauri-apps/api/path";
import { isTauri } from "./tauri";
import { useAppStore } from "./store";
import {
  NLLB_MODEL_ID,
  NLLB_CACHE_HOST,
  NLLB_CACHE_TEMPLATE,
  DEFAULT_MAX_NEW_TOKENS,
} from "../workers/translation.worker";

interface NllbProgressEvent {
  file: string;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  fileBytes: number;
  fileDone: number;
}

const NLLB_FILE_SIZES: Record<string, number> = {
  "config.json": 264,
  "generation_config.json": 189,
  "tokenizer.json": 17331224,
  "tokenizer_config.json": 544,
  "special_tokens_map.json": 3636,
  "onnx/encoder_model_quantized.onnx": 419120483,
  "onnx/decoder_model_merged_quantized.onnx": 475505771,
};

const NLLB_TOTAL_BYTES = Object.values(NLLB_FILE_SIZES).reduce(
  (sum, size) => sum + size,
  0
);

// Race a promise against a hard timeout. Used to convert dead/hung loads and
// dead/hung inferences (both observed on WKWebView with the ONNX pipeline) into
// visible errors instead of an endless "Loading Translator 100%".
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

type WorkerResponse =
  | { type: "ready"; id: string }
  | { type: "result"; id: string; texts: string[] }
  | { type: "chunk-translated"; id: string; translatedText: string }
  | { type: "error"; id: string; message: string }
  | { type: "status"; id: string; payload: { loaded: boolean; loading: boolean } }
  | { type: "loading-progress"; percent: number };

class TranslationService {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (value: WorkerResponse) => void; reject: (err: Error) => void }>();
  private readyPromise: Promise<void> | null = null;
  private requestCounter = 0;

  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = new Worker(new URL("../workers/translation.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event: MessageEvent) => {
        const data = event.data as WorkerResponse;
        // Model-init progress (no request id): surface it live in the UI.
        if (data.type === "loading-progress") {
          useAppStore.getState().setTranslationLoadProgress(data.percent);
          return;
        }
        const entry = this.pending.get(data.id);
        if (!entry) return;
        this.pending.delete(data.id);
        if (data.type === "error") {
          entry.reject(new Error(data.message));
        } else {
          entry.resolve(data);
        }
      };
      this.worker.onerror = (event) => {
        for (const [, entry] of this.pending) {
          entry.reject(new Error(event.message || "Translation worker error"));
        }
        this.pending.clear();
        this.worker = null;
        this.readyPromise = null;
      };
    }
    return this.worker;
  }

  private request(type: string, payload: unknown): Promise<WorkerResponse> {
    const id = `req-${++this.requestCounter}`;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.getWorker().then((worker) => {
        worker.postMessage({ type, id, payload });
      });
    });
  }

  async isModelAvailable(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      return await invoke<boolean>("is_translation_model_downloaded");
    } catch {
      return false;
    }
  }

  async getModelPath(): Promise<string> {
    return await invoke<string>("get_translation_model_path");
  }

  async deleteModel(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    await invoke<void>("delete_translation_model");
    useAppStore.getState().setTranslationModelAvailable(false);
  }

  async loadModel(onProgress?: (percent: number, phase: "downloading" | "preparing") => void): Promise<void> {
    if (!isTauri()) {
      throw new Error("This feature requires the desktop app");
    }
    useAppStore.getState().setTranslationModelLoading(true);
    useAppStore.getState().setTranslationError(null);
    try {
      if (!(await this.isModelAvailable())) {
        await this.downloadModel(onProgress);
      } else {
        onProgress?.(100, "preparing");
      }
      await this.initTranslator();
      // Self-test: prove the loaded pipeline actually produces output before
      // marking the model available. A load that "succeeds" but can't run (e.g.
      // broken asset protocol, unavailable ONNX session) would otherwise appear
      // available while every chunk silently fails — exactly the "translations
      // never appear" bug. Fail loudly here instead, on a clear error.
      const probe = await this.translate(["hello"], "en", "my");
      if (!probe?.[0]) {
        throw new Error("Translation pipeline returned no output");
      }
      useAppStore.getState().setTranslationModelAvailable(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useAppStore.getState().setTranslationError(message);
      useAppStore.getState().setTranslationModelAvailable(false);
      throw err;
    } finally {
      useAppStore.getState().setTranslationModelLoading(false);
    }
  }

  private async downloadModel(onProgress?: (percent: number, phase: "downloading") => void): Promise<void> {
    const completed = new Set<string>();
    let unlisten: (() => void) | undefined;
    if (onProgress) {
      unlisten = await listen<NllbProgressEvent>("nllb-download-progress", (event) => {
        const { file, fileBytes, fileDone } = event.payload ?? {};
        if (!file) return;
        if (fileBytes > 0 && fileDone >= fileBytes) {
          completed.add(file);
        }
        const doneBefore = Array.from(completed).reduce(
          (sum, f) => sum + (NLLB_FILE_SIZES[f] ?? 0),
          0
        );
        const total = NLLB_TOTAL_BYTES || 1;
        const percent = Math.min(100, ((doneBefore + (fileDone || 0)) / total) * 100);
        onProgress(percent, "downloading");
      });
    }
    try {
      await invoke<string>("download_nllb_model");
    } finally {
      if (unlisten) unlisten();
    }
  }

  // Resolve the model directory to a webview-accessible asset URL and load the
  // NLLB pipeline exclusively from local disk (never the network or Cache API).
  // The whole load is bounded by a timeout: a pipeline that hangs while reading
  // the ~900MB ONNX files (seen on WKWebView) now rejects with a visible error
  // instead of leaving the spinner stuck at 100% forever.
  private async initTranslator(): Promise<void> {
    let localModelPath: string | undefined;
    if (isTauri()) {
      const modelDir = await this.getModelPath();
      const appDataDir = await dirname(modelDir);
      localModelPath = convertFileSrc(appDataDir);
    }
    await withTimeout(
      this.readyRequest(localModelPath),
      240_000,
      "Timed out loading the translation model. Please restart the app and try again."
    );
  }

  private readyRequest(localModelPath?: string): Promise<void> {
    return this.request("init", {
      modelId: NLLB_MODEL_ID,
      cacheHost: NLLB_CACHE_HOST,
      cacheTemplate: NLLB_CACHE_TEMPLATE,
      localModelPath,
    }).then((response) => {
      if (response.type !== "ready") {
        throw new Error("Failed to initialize translation model");
      }
    });
  }

  // Silently warm the NLLB model in the background at startup when it is
  // already installed: loads the ONNX weights into the worker so realtime
  // translated captions start flowing the moment a video is loaded. Never
  // downloads anything on its own (that stays opt-in via Settings). Progress is
  // written to the store so the player can show a non-intrusive
  // "Loading Translator..." indicator.
  async autoLoadIfInstalled(onProgress?: (percent: number) => void): Promise<void> {
    if (!isTauri()) return;
    const s = useAppStore.getState();
    if (s.translationModelLoading || s.translationModelAvailable) return;
    s.setTranslationModelLoading(true);
    s.setTranslationLoadProgress(0);
    try {
      if (!(await this.isModelAvailable())) {
        // Model not downloaded - leave it to the Settings flow.
        return;
      }
      await this.loadModel((percent) => {
        onProgress?.(percent);
        useAppStore.getState().setTranslationLoadProgress(percent);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Background translation model load failed:", err);
      // Never fail silently: the player shows this so the user knows why
      // translated captions aren't appearing and can act on it.
      useAppStore.getState().setTranslationError(
        `Translation model failed to load: ${message}`
      );
    } finally {
      useAppStore.getState().setTranslationModelLoading(false);
    }
  }

  async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        // Worker threads cannot call Tauri APIs, so resolve the downloaded model
        // directory to a webview-accessible asset URL here and inject it into the
        // worker. Transformers.js then loads every file from local disk via the
        // asset protocol, never from a remote server.
        let localModelPath: string | undefined;
        if (isTauri()) {
          const modelDir = await this.getModelPath();
          const appDataDir = await dirname(modelDir);
          localModelPath = convertFileSrc(appDataDir);
        }
        const response = await this.request("init", {
          modelId: NLLB_MODEL_ID,
          cacheHost: NLLB_CACHE_HOST,
          cacheTemplate: NLLB_CACHE_TEMPLATE,
          localModelPath,
        });
        if (response.type !== "ready") {
          throw new Error("Failed to initialize translation model");
        }
      })();
    }
    try {
      await this.readyPromise;
    } catch (err) {
      // A failed init must not lock translation out for the whole session:
      // drop the cached promise (and any stale worker init state) so the next
      // translation attempt re-initializes from scratch.
      this.readyPromise = null;
      this.worker?.terminate();
      this.worker = null;
      throw err;
    }
  }

  async translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
    maxNewTokens: number = DEFAULT_MAX_NEW_TOKENS
  ): Promise<string[]> {
    await this.ensureReady();
    const response = await this.request("translate", {
      texts,
      srcLang: sourceLang,
      tgtLang: targetLang,
      maxNewTokens,
    });
    if (response.type !== "result") {
      throw new Error("Translation failed");
    }
    return response.texts;
  }

  // Translate a single cue and resolve as soon as the worker posts back its
  // "chunk-translated" result. Used by the realtime/full streaming flows so the
  // UI never blocks on one monolithic batch request. `srcLang` defaults to
  // English inside the worker (Whisper's output); passing it explicitly here
  // pins eng_Latn for Whisper-generated tracks.
  async translateChunk(text: string, targetLang: string, srcLang?: string): Promise<string> {
    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        await this.ensureReady();
        const response = await withTimeout(
          this.request("translate-chunk", {
            text,
            tgtLang: targetLang,
            ...(srcLang ? { srcLang } : {}),
          }),
          60_000,
          "Translation chunk timed out"
        );
        if (response.type === "chunk-translated") {
          return response.translatedText;
        }
        if (response.type === "error") {
          throw new Error(response.message);
        }
        throw new Error("Chunk translation failed");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          attempts >= 2 ||
          (message.length > 0 &&
            !message.match(/timed out|not loaded|init|fetch|network|worker|cache|onnx/i))
        ) {
          throw err;
        }
        // Transient failure (stale worker init, aborted network/cache load):
        // tear everything down so the next iteration re-initializes cleanly.
        console.warn("Chunk translation failed, retrying with fresh init:", message);
        this.readyPromise = null;
        this.worker?.terminate();
        this.worker = null;
      }
    }
  }

  async status(): Promise<{ loaded: boolean; loading: boolean }> {
    const response = await this.request("status", {});
    if (response.type !== "status") {
      return { loaded: false, loading: false };
    }
    return response.payload;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.pending.clear();
  }
}

export const translationService = new TranslationService();