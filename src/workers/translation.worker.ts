import { pipeline, env } from "@xenova/transformers";

export const NLLB_MODEL_ID = "nllb-200";
export const NLLB_CACHE_HOST = "https://offline.local/";
export const NLLB_CACHE_TEMPLATE = "{model}";

export const DEFAULT_MAX_NEW_TOKENS = 128;

const FLORES_TARGET: Record<string, string> = {
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

type Translator = (
  texts: string | string[],
  options: Record<string, unknown>
) => Promise<Array<{ translation_text: string }>>;

let translator: Translator | null = null;
let initPromise: Promise<void> | null = null;

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
      post({ type: "error", id, message: errToString(err) });
    }
  },
  translate: async (id, payload) => {
    const { texts, srcLang, tgtLang, maxNewTokens } = payload as TranslatePayload;
    try {
      if (!translator) {
        throw new Error("Translation model is not loaded yet");
      }
      const sourceCode = toFloresCode(srcLang) ?? detectSourceFloresCode(texts);
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
        const outputs = await translator(chunk, {
          src_lang: sourceCode,
          tgt_lang: targetCode,
          max_new_tokens: maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
          num_beams: 1,
        } as Record<string, unknown>);
        for (const out of outputs) {
          translated.push(out?.translation_text ?? "");
        }
      }
      post({ type: "result", id, texts: translated });
    } catch (err) {
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