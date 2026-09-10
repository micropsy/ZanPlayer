import { pipeline, env } from "@xenova/transformers";

export const NLLB_MODEL_ID = "nllb-200";
export const NLLB_CACHE_HOST = "https://offline.local/";
export const NLLB_CACHE_TEMPLATE = "{model}";

export const DEFAULT_MAX_NEW_TOKENS = 128;
// Antidote for the NLLB repetition-loops seen in production (e.g. a single
// Burmese syllable repeated forever: "ကက်ကက်ကက်..."). These decode-time
// constraints are applied to every translation, for every language pair.
export const DEFAULT_REPETITION_PENALTY = 1.5;
export const DEFAULT_NO_REPEAT_NGRAM_SIZE = 3;

const FLORES_TARGET: Record<string, string> = {
  // ISO-639-1 codes
  en: "eng_Latn",
  es: "spa_Latn",
  my: "mya_Mymr",
  fr: "fra_Latn",
  de: "deu_Latn",
  ja: "jpn_Jpan",
  ko: "kor_Hang",
  zh: "zho_Hans",
  pt: "por_Latn",
  ru: "rus_Cyrl",
  th: "tha_Thai",
  vi: "vie_Latn",
  hi: "hin_Deva",
  ar: "arb_Arab",
  // Full display names (defensive: NLLB strictly needs Flores-200 codes, and
  // any unresolved string makes the pipeline crash silently).
  english: "eng_Latn",
  spanish: "spa_Latn",
  espanol: "spa_Latn",
  burmese: "mya_Mymr",
  myanmar: "mya_Mymr",
  french: "fra_Latn",
  german: "deu_Latn",
  japanese: "jpn_Jpan",
  korean: "kor_Hang",
  chinese: "zho_Hans",
  "chinese (simplified)": "zho_Hans",
  portuguese: "por_Latn",
  russian: "rus_Cyrl",
  thai: "tha_Thai",
  vietnamese: "vie_Latn",
  hindi: "hin_Deva",
  arabic: "arb_Arab",
};

const SCRIPT_RULES: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /[\u1000-\u109F]/, code: "mya_Mymr" },
  { pattern: /[\u0E00-\u0E7F]/, code: "tha_Thai" },
  { pattern: /[\u1780-\u17FF]/, code: "khm_Khmr" },
  { pattern: /[\u0E80-\u0EFF]/, code: "lao_Laoo" },
  { pattern: /[\u0980-\u09FF]/, code: "ben_Beng" },
  { pattern: /[\u0B80-\u0BFF]/, code: "tam_Taml" },
  { pattern: /[\u0C00-\u0C7F]/, code: "tel_Telu" },
  { pattern: /[\u0C80-\u0CFF]/, code: "kan_Knda" },
  { pattern: /[\u0D00-\u0D7F]/, code: "mal_Mlym" },
  { pattern: /[\u0A80-\u0AFF]/, code: "guj_Gujr" },
  { pattern: /[\u0A00-\u0A7F]/, code: "pan_Guru" },
  { pattern: /[\u0D80-\u0DFF]/, code: "sin_Sinh" },
  { pattern: /[\u0600-\u06FF]/u, code: "arb_Arab" },
  { pattern: /[\u0590-\u05FF]/u, code: "heb_Hebr" },
  { pattern: /[\u0370-\u03FF]/u, code: "ell_Grek" },
  { pattern: /[\uAC00-\uD7AF]/, code: "kor_Hang" },
  { pattern: /\p{Script=Hiragana}|\p{Script=Katakana}/u, code: "jpn_Jpan" },
  { pattern: /\p{Script=Han}/u, code: "zho_Hans" },
  { pattern: /[\u0400-\u04FF]/, code: "rus_Cyrl" },
  { pattern: /[\u10A0-\u10FF]/, code: "kat_Geor" },
  { pattern: /[\u0530-\u058F]/, code: "hye_Armn" },
  { pattern: /\p{Script=Devanagari}/u, code: "hin_Deva" },
];

export function toFloresCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const normalized = code.toLowerCase();
  if (normalized === "auto" || normalized === "original") return undefined;
  return FLORES_TARGET[normalized] ?? undefined;
}

export function detectSourceFloresCode(texts: string[]): string {
  for (const rule of SCRIPT_RULES) {
    for (const text of texts) {
      if (rule.pattern.test(text)) return rule.code;
    }
  }
  return "eng_Latn";
}

// Resolve the NLLB source language. Whisper always returns English transcripts,
// so `eng_Latn` is the absolute default for the auto-generated pipeline. An
// explicit `srcLang` (e.g. pinned to "en" by the player) always wins; for
// non-Whisper tracks (imported SRT files) whose text is visibly written in a
// foreign script, script detection kicks in as a fallback so they still
// translate instead of being mislabeled as English.
export function resolveSourceLang(srcLang: string | undefined, texts: string[]): string {
  const explicit = toFloresCode(srcLang);
  if (explicit) return explicit;
  return detectSourceFloresCode(texts);
}

type Message = { type: string; id: string; payload: unknown };

interface InitPayload {
  modelId: string;
  cacheHost: string;
  cacheTemplate: string;
  localModelPath?: string;
}

interface TranslatePayload {
  texts: string[];
  srcLang?: string;
  tgtLang: string;
  maxNewTokens?: number;
}

interface TranslateChunkPayload {
  text: string;
  srcLang?: string;
  tgtLang: string;
}

type Translator = (
  texts: string | string[],
  options: Record<string, unknown>
) => Promise<Array<{ translation_text: string }>>;

let translator: Translator | null = null;
let initPromise: Promise<void> | null = null;

// Monotonic load progress for the "Loading Translator... %" indicator. The
// NLLB ONNX model reports progress twice (encoder, then merged decoder), each
// 0..100; mapping the second pass onto the 50..100 range keeps the bar rising.
let doneLoadPasses = 0;
let lastLoadPercent = 0;

// Serialize model calls so chunk translations never pile up on concurrent
// pipeline invocations (single ONNX session). Exactly one translation runs at
// a time, in FIFO order, keeping the worker queue bounded.
let queueTail: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(task, task);
  queueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function post(message: Record<string, unknown>): void {
  (self as unknown as { postMessage: (msg: Record<string, unknown>) => void }).postMessage(message);
}

function errToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function ensureTranslator(
  payload: InitPayload
): Promise<void> {
  if (translator) return;
  if (!initPromise) {
    initPromise = (async () => {
      env.backends.onnx.wasm.wasmPaths = new URL("../../onnx/", self.location.href).href;
      env.remoteHost = payload.cacheHost;
      env.remotePathTemplate = payload.cacheTemplate;
      env.useBrowserCache = true;
      if (payload.localModelPath) {
        // Offline-only: load every model file from local disk via the injected
        // asset URL (convertFileSrc of the app-data dir). Never hit the network,
        // which otherwise falls back to a HTML 404 page and crashes .json() parsing.
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = payload.localModelPath;
      } else {
        // No asset URL injected (non-Tauri dev fallback): keep remote loading.
        env.allowLocalModels = true;
        env.allowRemoteModels = true;
      }
      translator = (await pipeline("translation", payload.modelId, {
        quantized: true,
        progress_callback: (info: { status?: string; progress?: number }) => {
          if (info?.status === "progress" && typeof info.progress === "number") {
            const total = Math.min(100, Math.round((doneLoadPasses * 100 + info.progress) / 2));
            lastLoadPercent = Math.max(lastLoadPercent, total);
            post({ type: "loading-progress", percent: lastLoadPercent });
          } else if (info?.status === "done") {
            doneLoadPasses = Math.min(2, doneLoadPasses + 1);
          }
        },
      })) as unknown as Translator;
    })();
  }
  await initPromise;
}

const handlers: Record<string, (id: string, payload: unknown) => Promise<void>> = {
  init: async (id, payload) => {
    const { cacheHost, cacheTemplate, modelId, localModelPath } = payload as InitPayload;
    try {
      await ensureTranslator({ modelId, cacheHost, cacheTemplate, localModelPath });
      post({ type: "ready", id });
    } catch (err) {
      console.error("Translation worker init failed:", err);
      post({ type: "error", id, message: errToString(err) });
    }
  },
  translate: async (id, payload) => {
    const { texts, srcLang, tgtLang, maxNewTokens } = payload as TranslatePayload;
    try {
      if (!translator) {
        throw new Error("Translation model is not loaded yet");
      }
      const model = translator;
      const sourceCode = resolveSourceLang(srcLang, texts);
      const targetCode = toFloresCode(tgtLang);
      if (!targetCode) {
        throw new Error(`Unsupported target language: ${tgtLang}`);
      }
      if (sourceCode === targetCode) {
        post({ type: "result", id, texts });
        return;
      }
      const chunkSize = 4;
      const translated: string[] = [];
      for (let i = 0; i < texts.length; i += chunkSize) {
        const chunk = texts.slice(i, i + chunkSize);
        const outputs = await enqueue(() =>
          model(chunk, {
            src_lang: sourceCode,
            tgt_lang: targetCode,
            max_new_tokens: maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
            num_beams: 1,
            repetition_penalty: DEFAULT_REPETITION_PENALTY,
            no_repeat_ngram_size: DEFAULT_NO_REPEAT_NGRAM_SIZE,
          } as Record<string, unknown>)
        );
        for (const out of outputs) {
          translated.push(out?.translation_text ?? "");
        }
      }
      post({ type: "result", id, texts: translated });
    } catch (err) {
      console.error("Translation worker translate failed:", err);
      post({ type: "error", id, message: errToString(err) });
    }
  },
  "translate-chunk": async (id, payload) => {
    const { text, srcLang, tgtLang } = payload as TranslateChunkPayload;
    try {
      if (!translator) {
        throw new Error("Translation model is not loaded yet");
      }
      const model = translator;
      if (!text) {
        post({ type: "chunk-translated", id, translatedText: "" });
        return;
      }
      const sourceCode = resolveSourceLang(srcLang, [text]);
      const targetCode = toFloresCode(tgtLang);
      if (!targetCode) {
        throw new Error(`Unsupported target language: ${tgtLang}`);
      }
      if (sourceCode === targetCode) {
        post({ type: "chunk-translated", id, translatedText: text });
        return;
      }
      const outputs = await enqueue(() =>
        model([text], {
          src_lang: sourceCode,
          tgt_lang: targetCode,
          max_new_tokens: DEFAULT_MAX_NEW_TOKENS,
          num_beams: 1,
          repetition_penalty: DEFAULT_REPETITION_PENALTY,
          no_repeat_ngram_size: DEFAULT_NO_REPEAT_NGRAM_SIZE,
        } as Record<string, unknown>)
      );
      post({ type: "chunk-translated", id, translatedText: outputs?.[0]?.translation_text ?? "" });
    } catch (err) {
      console.error("Translation worker translate-chunk failed:", err);
      post({ type: "error", id, message: errToString(err) });
    }
  },
  status: async (id) => {
    post({
      type: "status",
      id,
      payload: { loaded: translator !== null, loading: initPromise !== null },
    });
  },
};

self.addEventListener("message", (event) => {
  const msg = event.data as Message;
  if (!msg || typeof msg.id !== "string") return;
  const handler = handlers[msg.type];
  if (!handler) return;
  const payload = msg.payload;
  void handler(msg.id, payload).catch((err: unknown) => {
    post({ type: "error", id: msg.id, message: errToString(err) });
  });
});