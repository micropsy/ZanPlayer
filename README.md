# Sub Player

A modern, beautiful desktop video player with AI-powered subtitle generation and translation capabilities, built with Tauri, React, TypeScript, and Tailwind CSS.

## Features

### Core Features
- 🎬 Modern, clean video player interface
- 📝 Subtitle overlay with custom styling
- 🎯 Multiple subtitle display modes:
  - Original only
  - Translated only
  - Dual mode (both languages together)
- ⌨️ Keyboard shortcuts for all controls
- 📱 Responsive design
- 🔄 Fullscreen support

### AI Features
- 🤖 Auto-subtitle generation using OpenAI Whisper API
- 🌐 Auto-translation to 15+ languages using OpenAI GPT API
- 📄 Load existing subtitle files (SRT, VTT)
- 💾 Export subtitles in SRT or VTT formats

### Subtitle Editor
- ✏️ Edit subtitle text in real-time
- ⏱️ Adjust subtitle timing (start/end times)
- ➕ Add new subtitle cues
- 🗑️ Delete existing cues
- 📊 Shift all cues by a time offset

### Settings
- 🔑 Save API keys securely
- 🌍 Default target language preference
- 🎨 Theme preferences (coming soon)

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
3. **OpenAI API Key** (for AI features)

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

## FFmpeg Setup

For local video processing (audio extraction), you'll need FFmpeg:

1. Download FFmpeg for your platform from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Place the binary in `src-tauri/binaries/` with the appropriate name:
   - macOS (Apple Silicon): `ffmpeg-aarch64-apple-darwin`
   - macOS (Intel): `ffmpeg-x86_64-apple-darwin`
   - Windows: `ffmpeg-x86_64-pc-windows-msvc.exe`
   - Linux: `ffmpeg-x86_64-unknown-linux-gnu`

## Project Structure

```
Sub Player/
├── src/                    # Frontend (React)
│   ├── components/         # UI Components
│   │   ├── Sidebar.tsx    # Sidebar with controls
│   │   ├── VideoPlayer.tsx # Video player component
│   │   └── Settings.tsx   # Settings panel
│   ├── services/          # Business logic
│   │   ├── openai.ts      # OpenAI API client
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
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **AI**: OpenAI API (Whisper, GPT)
- **Build Tool**: Vite

## Usage

1. Launch the app
2. Open Settings and enter your OpenAI API key
3. Select a video file
4. Generate subtitles with the "Auto-Transcribe" button
5. Translate subtitles if needed
6. Use the subtitle mode switcher to choose your preferred view
7. Export your subtitles if desired

## Future Plans

- [ ] Local Whisper support (no API key needed)
- [ ] Auto-download FFmpeg
- [ ] More subtitle formats (ASS, SSA, etc.)
- [ ] Subtitle styling customization
- [ ] Project save/load
- [ ] CI/CD for automated builds
- [ ] Tests for frontend and backend
- [ ] Drag-and-drop support
- [ ] Connect subtitle editor with video player (seek to cue on click)
- [ ] Better progress indicators for AI operations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop framework
- [OpenAI](https://openai.com/) - For the AI APIs
- [FFmpeg](https://ffmpeg.org/) - For video processing
- Everyone who contributes to open source!
