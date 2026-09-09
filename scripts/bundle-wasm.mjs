import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const sourceDir = join(root, "node_modules", "onnxruntime-web", "dist");
const targetDir = join(root, "public", "onnx");

const files = [
  "ort-wasm.wasm",
  "ort-wasm-simd.wasm",
  "ort-wasm-threaded.wasm",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-threaded.js",
  "ort-wasm-threaded.worker.js",
];

mkdirSync(targetDir, { recursive: true });
for (const file of files) {
  const from = join(sourceDir, file);
  const to = join(targetDir, file);
  try {
    copyFileSync(from, to);
    console.log(`copied ${file}`);
  } catch (err) {
    console.warn(`SKIP ${file}: ${err.code ?? err.message}`);
  }
}

console.log(`bundled onnxruntime wasm assets -> public/onnx/ (${files.length} files)`);