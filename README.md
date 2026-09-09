# ZanPlayer

A modern, beautiful desktop video player with **local, offline, AI-powered subtitle generation and translation**, built with Tauri 2, React 19, TypeScript, and Tailwind CSS v4. **100% offline-first** — no external API keys, no cloud calls required.

## Features

### Player
- 🎬 Modern video/audio player with seek bar, volume, mute, and fullscreen
- 🖱️ Drag-and-drop support for video, audio, and subtitle files (`.srt` / `.vtt` / `.ass` / `.ssa`)
- 📱 Responsive layout with a toggleable sidebar
- ⏯️ Automatic pause with a **"Transcribing Audio... Please wait"** overlay during a first-time transcription of a new video, then auto-resume so the beginning of the subtitles is never missed
- 🔄 Auto-updater via GitHub releases

### Subtitles
- 📑 Multiple display modes: **Original only**, **Translated only**, or **Dual** (both languages on screen)
- 🎚️ CC menu with subtitle toggle, **Spoken Audio (Source)** selector, **Language** (translation target), and **Caption Mode**
- 🎨 Styled subtitle overlay — font family, size, colors, outline, bold/italic, alignment (top/bottom)
- 📄 Load existing subtitle files (SRT, VTT, ASS/SSA)
- 💾 Export subtitles in SRT or VTT (backend also supports ASS)
- ✏️ Full subtitle editor: real-time text editing, cue timing, add/delete cues, and shifting all cues by an offset

### AI (100% local)
- 🗣️ **Transcription with Whisper** (`whisper-rs`) — models run on your machine
  - **Spoken Audio (Source)** selector (Auto-Detect / Burmese / English) forces the Whisper language token, preventing English hallucinations on low-resource languages such as Burmese
  - Model manager in Settings downloads/removes Whisper models (tiny → large)
- 🌐 **Translation with NLLB-200** (distilled 600M, int8-quantized) via Transformers.js + ONNX Runtime Web
  - Runs in a dedicated Web Worker, so the UI never freezes during translation
  - ~900 MB one-time download from Settings, cached locally for fully offline use
  - 14 selectable target languages (FLORES-200 codes):

  | Language | FLORES-200 | Language | FLORES-200 |
  |----------|-----------|----------|-----------|
  | English | `eng_Latn` | Chinese (Simplified) | `zho_Hans` |
  | Spanish | `spa_Latn` | Portuguese | `por_Latn` |
  | Burmese | `mya_Mymr` | Russian | `rus_Cyrl` |
  | French | `fra_Latn` | Thai | `tha_Thai` |
  | German | `deu_Latn` | Vietnamese | `vie_Latn` |
  | Japanese | `jpn_Jpan` | Hindi | `hin_Deva` |
  | Korean | `kor_Hang` | Arabic | `arb_Arab` |

### Settings
- 🎨 Theme preferences (light/dark)
- 🔤 Custom subtitle styling (font family, size, colors) with real-time preview
- 🤖 Whisper model management (download/delete models)
- 🌐 NLLB-200 translation model management (download with progress bar / delete)
- 🔄 Update checker

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` / `→` | Seek 5 seconds backward/forward |
| `↑` / `↓` | Volume up/down |
| `M` | Mute toggle |
| `F` | Fullscreen toggle |

## Installation

### Prerequisites
1. **Node.js** (v20 or higher; CI uses v24)
2. **Rust** (stable toolchain)
3. Platform dependencies:
   - **macOS**: Xcode Command Line Tools
   - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libxdo-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, etc. (see `.github/workflows/build.yml`)
   - **Windows**: MSVC build tools

### Steps
```bash
git clone https://github.com/micropsy/ZanPlayer.git
cd ZanPlayer
npm install
npm run tauri dev
```

### Build & release
```bash
npm run bundle:wasm   # regenerate public/onnx/ from node_modules/onnxruntime-web (runs automatically in CI)
npm run build         # type-check (tsc) + frontend build (vite)
npm run tauri build   # full desktop bundles (app, dmg, AppImage, deb, msi)
npm run release -- patch   # semantic-version release pipeline (see RELEASE_PROCESS.md)
```

## Offline AI — Where Things Live

- **Whisper models** → app data `models/` directory, downloaded from Settings.
- **NLLB-200 translation model** → app data `nllb-200/` directory, downloaded with a progress bar from Settings and warmed into the browser Cache API so the Web Worker can load it entirely offline.
- **ONNX Runtime WASM assets** → bundled into the app at build time via `npm run bundle:wasm` (copies from `node_modules/onnxruntime-web/dist` to `public/onnx/`). No runtime CDN dependency.

## Project Structure

```
ZanPlayer/
├── src/                        # Frontend (React 19 + TypeScript)
│   ├── App.tsx                 # Root layout + drag-and-drop handling
│   ├── components/
│   │   ├── Sidebar.tsx         # Open/export subtitles, track list
│   │   ├── VideoPlayer.tsx     # Player, overlays, CC menu, Whisper + translation wiring
│   │   ├── Settings.tsx        # Theme, styles, Whisper/NLLB model managers
│   │   └── SubtitleEditor.tsx  # Timeline/text editing side panel
│   ├── services/
│   │   ├── tauri.ts            # Typed wrappers for Rust commands
│   │   ├── store.ts            # Zustand store (persisted state)
│   │   └── translation.ts      # NLLB model download/cache + worker bridge
│   ├── workers/
│   │   └── translation.worker.ts  # Transformers.js NLLB-200 pipeline in a Web Worker
│   ├── types/subtitle.ts       # Subtitle / cue / track types
│   └── utils/                  # cn, subtitleExporter
├── scripts/
│   ├── bundle-wasm.mjs         # Copy onnxruntime WASM → public/onnx/
│   └── release.mjs             # SemVer release automation
├── public/
│   └── onnx/                   # Bundled ONNX Runtime WASM (generated, gitignored)
├── src-tauri/                  # Backend (Rust/Tauri)
│   ├── src/main.rs             # Commands: whisper, ffmpeg, subtitles, model/NLLB downloads
│   ├── Cargo.toml / tauri.conf.json
│   └── capabilities/main.json  # Tauri 2 permissions
└── .github/workflows/build.yml # CI: builds + creates releases for all 4 platforms
```

## Technologies

- **Desktop**: Tauri 2
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand (with persistence)
- **Transcription AI**: whisper-rs (local Whisper models)
- **Translation AI**: Transformers.js (`@xenova/transformers`) + onnxruntime-web (WASM) — NLLB-200
- **Build Tool**: Vite 8
- **Icon Library**: Lucide React
- **CI/Release**: GitHub Actions matrix (macOS x64/aarch64, Linux x64, Windows x64) + `tauri-action`

## Usage

1. Launch the app, then drag-and-drop a video/audio file or use the sidebar open button.
2. Enable subtitles (CC). The first time, the video auto-pauses while Whisper transcribes locally, then resumes.
3. In Settings, download a Whisper model (if not present) and — for translation — the NLLB-200 model (~900 MB, one-time, offline after that).
4. To keep low-resource audio (e.g. Burmese) from hallucinating English, set **CC → Spoken Audio (Source) → Burmese**.
5. Pick a translation target via **CC → Language** (e.g. English) to get local NLLB translation; switch between Original/Translated/Dual in **Caption Mode**.
6. Edit cues in the sidebar editor and export when ready.

## Future Plans

- [ ] Project save/load
- [ ] Tests for frontend and backend
- [ ] Click-to-seek from the subtitle editor into the player

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Tauri](https://tauri.app/) — for the amazing desktop framework
- [whisper-rs](https://github.com/tazz4843/whisper-rs) — for local Whisper inference
- [Transformers.js](https://github.com/xenova/transformers.js) — for in-browser NLLB models
- [FFmpeg](https://ffmpeg.org/) — for video/audio processing
- Everyone who contributes to open source!