# Sub Player

A modern, beautiful desktop video player with AI-powered subtitle generation and translation capabilities, built with Tauri, React, TypeScript, and Tailwind CSS. **100% offline-first** - no external API keys required!

## Features

### Core Features
- 🎬 Modern, clean video player interface
- 📝 Subtitle overlay with custom styling (font, size, colors)
- 🎯 Multiple subtitle display modes:
  - Original only
  - Translated only
  - Dual mode (both languages together)
- ⌨️ Keyboard shortcuts for all controls
- 📱 Responsive design with toggleable sidebar
- 🔄 Fullscreen support
- 🖱️ Drag-and-drop support for video and subtitle files
- 🔄 Auto-updater via GitHub releases

### AI Features
- 🤖 Local subtitle generation using Whisper (offline, no API key!)
- 🌐 Local translation to English using Whisper
- 📄 Load existing subtitle files (SRT, VTT)
- 💾 Export subtitles in SRT or VTT formats
- 📦 Model manager to download/delete Whisper models locally

### Subtitle Editor
- ✏️ Edit subtitle text in real-time
- ⏱️ Adjust subtitle timing (start/end times)
- ➕ Add new subtitle cues
- 🗑️ Delete existing cues
- 📊 Shift all cues by a time offset

### Settings
- 🎨 Theme preferences (light/dark mode)
- 🌍 Default target language preference
- 🔤 Custom subtitle styling (font family, size, colors) with real-time preview
- 🤖 Whisper model management (download/delete models)

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
1. **Node.js** (v18 or higher)
2. **Rust** (for Tauri)

### Steps

1. Clone the repository:
```bash
git clone https://github.com/micropsy/subplayer.git
cd subplayer
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

## FFmpeg & Whisper Setup

**No manual setup needed!** The app automatically:
- Downloads FFmpeg on first launch
- Downloads Whisper models when selected in settings

## Project Structure

```
Sub Player/
├── src/                    # Frontend (React)
│   ├── components/         # UI Components
│   │   ├── Sidebar.tsx    # Sidebar with controls
│   │   ├── VideoPlayer.tsx # Video player component
│   │   └── Settings.tsx   # Settings panel
│   ├── services/          # Business logic
│   │   ├── tauri.ts       # Tauri commands wrapper
│   │   └── store.ts       # Zustand state management
│   ├── types/             # TypeScript type definitions
│   │   └── subtitle.ts    # Subtitle-related types
│   └── utils/             # Helper functions
│       ├── cn.ts          # Class name utility
│       └── subtitleExporter.ts # Subtitle export functions
├── src-tauri/             # Backend (Rust/Tauri)
│   ├── src/               # Rust source code
│   │   └── main.rs        # Tauri commands
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri config
└── (other config files)
```

## Technologies

- **Desktop**: Tauri 2
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **AI**: whisper-rs (local Whisper models, no external APIs)
- **Build Tool**: Vite
- **Icon Library**: Lucide React

## Usage

1. Launch the app
2. Drag-and-drop a video file or use the open button
3. Go to Settings and download a Whisper model (if not already downloaded)
4. Select your preferred model and target language
5. Generate subtitles with the "Auto-Transcribe" button
6. Use the subtitle mode switcher in the player controls to choose your preferred view
7. Export your subtitles if desired

## Future Plans

- [ ] More subtitle formats (ASS, SSA, etc.)
- [ ] Project save/load
- [ ] Tests for frontend and backend
- [ ] Connect subtitle editor with video player (seek to cue on click)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop framework
- [whisper-rs](https://github.com/tazz4843/whisper-rs) - For local Whisper inference
- [FFmpeg](https://ffmpeg.org/) - For video processing
- Everyone who contributes to open source!
