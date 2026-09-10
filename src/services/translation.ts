import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
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

const NLLB_FILES = [
  "config.json",
  "generation_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

const NLLB_FILE_SIZES: Record<string, number> = {
  "config.json": 264,
  "generation_config.json": 189,
  "tokenizer.json": 17331224,
  "tokenizer_config.json": 544,
  "special_tokens_map.json": 3636,
  "onnx/encoder_model_quantized.onnx": 419120483,
  "onnx/decoder_model_merged_quantized.onnx": 475505771,
};

const NLLB_TOTAL_BYTES = NLLB_FILES.reduce((sum, f) => sum + (NLLB_FILE_SIZES[f] ?? 0), 0);

type WorkerResponse =
  | { type: "ready"; id: string }
  | { type: "result"; id: string; texts: string[] }
  | { type: "chunk-translated"; id: string; translatedText: string }
  | { type: "error"; id: string; message: string }
  | { type: "status"; id: string; payload: { loaded: boolean; loading: boolean } }
  | { type: "loading-progress"; percent: number };

const cacheKey = (filename: string): string => {
  const templatePath = NLLB_CACHE_TEMPLATE.replace(/\{model\}/g, NLLB_MODEL_ID);
  return new URL(filename, new URL(`${templatePath.replace(/\/$/, "")}/`, NLLB_CACHE_HOST)).href;
};

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
      await this.warmModelCache(onProgress);
      await this.ensureReady();
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

  private async warmModelCache(onProgress?: (percent: number, phase: "preparing") => void): Promise<void> {
    if (!("caches" in self)) {
      throw new Error("Offline model cache is unavailable in this environment");
    }
    const dir = await this.getModelPath();
    const cache = await caches.open("transformers-cache");
    for (let i = 0; i < NLLB_FILES.length; i++) {
      const filename = NLLB_FILES[i];
      const key = cacheKey(filename);
      if (await cache.match(key)) {
        continue;
      }
      const filePath = await join(dir, ...filename.split("/"));
      const bytes = await readFile(filePath);
      const response = new Response(new Blob([bytes]), { status: 200 });
      try {
        await cache.put(key, response);
      } catch {
        throw new Error(
          `Not enough storage to cache the translation model offline (${filename}). Free some space and try again.`
        );
      }
      const percent = Math.min(100, 90 + ((i + 1) / NLLB_FILES.length) * 10);
      onProgress?.(percent, "preparing");
    }
  }

  // Silently warm the NLLB model in the background at startup when it is
  // already installed: warms the offline cache and loads the ONNX weights into
  // the worker. Never downloads anything on its own (that stays opt-in via
  // Settings). Progress is written to the store so the player can show a
  // non-intrusive "Loading Translator..." indicator.
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
      console.error("Background translation model load failed:", err);
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
    await this.readyPromise;
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
    await this.ensureReady();
    const response = await this.request("translate-chunk", {
      text,
      tgtLang: targetLang,
      ...(srcLang ? { srcLang } : {}),
    });
    if (response.type === "chunk-translated") {
      return response.translatedText;
    }
    if (response.type === "error") {
      throw new Error(response.message);
    }
    throw new Error("Chunk translation failed");
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