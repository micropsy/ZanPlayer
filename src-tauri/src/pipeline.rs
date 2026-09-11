// V2 native pipeline: Silero VAD gating -> chunked Whisper decode -> PTS remap.
// Whisper cannot emit original + English in one pass, so the pipeline is driven
// by a `translate` flag and a `kind` tag per pass ("original" / "translation").
// The caller runs one pass for Original-only/English-only, two passes (parallel
// in realtime mode, sequential in batch mode) over the same audio for "Both",
// and the UI merges the two cue streams. NLLB-200 and its onnx/xenova wrappers
// are gone; the only inference engine left is whisper.cpp behind `whisper-rs`.

use crossbeam_channel::{unbounded, Receiver, Sender};
use silero_vad_pure::{SampleRate, SileroVad};
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, SegmentCallbackData, WhisperContext};

pub const SAMPLE_RATE: u32 = 16_000;

/// 512 samples (32 ms) at 16 kHz — fixed silero-vad-pure frame size.
const VAD_FRAME: usize = 512;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SubtitleCue {
    pub id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
    /// Which inference pass produced this cue: `Some("original")` when whisper
    /// transcribed in the source language, `Some("translation")` for the
    /// English translate pass, `None` for externally-loaded subtitle files.
    #[serde(default)]
    pub kind: Option<String>,
}

#[derive(Clone, Debug)]
pub struct StreamOptions {
    /// Source language. `None` delegates to Whisper auto-detection.
    pub language: Option<String>,
    /// Silero speech probability required to treat a frame as voice.
    pub vad_threshold: f32,
    /// Discrete utterances shorter than this (s) are considered noise.
    pub min_speech_secs: f64,
    /// Run of silence (s) that closes an utterance.
    pub min_silence_secs: f64,
    /// Never feed Whisper a chunk longer than this (s).
    pub max_chunk_secs: f64,
}

impl Default for StreamOptions {
    fn default() -> Self {
        Self {
            language: None,
            vad_threshold: 0.5,
            min_speech_secs: 0.4,
            min_silence_secs: 0.6,
            max_chunk_secs: 30.0,
        }
    }
}

/// VAD-gated streaming transcription with a pass-time Whisper decode.
///
/// Reads a 16 kHz mono 16-bit PCM WAV, drops silence with Silero VAD, groups
/// speech into bounded chunks and runs one fresh `WhisperState` per chunk so a
/// new session never needs `reset()`. When `translate` is true the decode runs
/// whisper's translate task (output is English); when false the output is the
/// source speech (auto-detected or pinned via `options.language`). Every cue is
/// tagged with `kind` so a dual-pass caller can route cues to the matching
/// track. Whisper's per-segment 10 ms `t0`/`t1` are remapped to the source
/// timeline as `chunk_start_pts + t * 0.01` seconds and forwarded through
/// `on_cue` as each decode pass finalizes. `on_progress` receives the overall
/// percentage (0.0-100.0) based on the WAV sample position. Returns the number
/// of cues emitted.
pub fn transcribe_wav_streaming(
    ctx: &WhisperContext,
    wav_path: &Path,
    options: &StreamOptions,
    translate: bool,
    kind: Option<String>,
    mut on_cue: impl FnMut(SubtitleCue),
    mut on_progress: impl FnMut(f64),
) -> Result<usize, String> {
    let mut reader =
        hound::WavReader::open(wav_path).map_err(|e| format!("Failed to open WAV: {}", e))?;
    let spec = reader.spec();
    if spec.sample_rate != SAMPLE_RATE || spec.channels != 1 {
        return Err(format!(
            "Audio must be {} Hz mono PCM, got {} Hz / {} ch",
            SAMPLE_RATE, spec.sample_rate, spec.channels
        ));
    }

    let mut vad = SileroVad::new(SampleRate::Hz16000)
        .map_err(|e| format!("VAD engine init failed: {}", e))?;

    let max_chunk_samples = (options.max_chunk_secs * SAMPLE_RATE as f64) as usize;
    let min_speech_samples = (options.min_speech_secs * SAMPLE_RATE as f64) as usize;
    let min_silence_frames = ((options.min_silence_secs * SAMPLE_RATE as f64) / VAD_FRAME as f64)
        .ceil() as usize;
    let language = options.language.as_deref();
    let kind_tag = kind.as_deref();

    // hound 3.5 `duration()` reports the total frame count directly (u32).
    let total_samples = reader.duration() as u64;

    let (seg_tx, seg_rx) = unbounded::<SubtitleCue>();

    let mut utterance = UtteranceBuilder::new(max_chunk_samples, min_speech_samples, min_silence_frames);
    let mut samples_read = 0u64;
    let mut total_cues = 0usize;

    // Stream i16 samples out of hound, normalising to [-1, 1) to match the VAD
    // and Whisper float input, and feed 512-sample VAD frames.
    let mut frame: Vec<f32> = Vec::with_capacity(VAD_FRAME);

    for sample in reader.samples::<i16>() {
        let s = sample.map_err(|e| format!("WAV sample read failed: {}", e))? as f32 / 32768.0;
        let frame_start_sample = samples_read;
        samples_read += 1;
        frame.push(s);
        if frame.len() == VAD_FRAME {
            let speech = vad
                .process(&frame)
                .map_err(|e| format!("VAD frame failed: {}", e))?
                >= options.vad_threshold;
            if let Some((start, chunk)) = utterance.accumulate(
                speech,
                &frame,
                frame_start_sample,
            ) {
                frame.clear();
                dispatch_chunk(ctx, &chunk, start, language, translate, kind_tag, &seg_tx)?;
                total_cues = drain_cues(&seg_rx, &mut on_cue, total_cues);
                report_progress(samples_read, total_samples, &mut on_progress);
            } else {
                frame.clear();
            }
        }
    }

    // Trailing partial frame at EOF: zero-pad so silero gets its fixed size.
    // Zeros read as silence, which — below the minimum — won't close an open
    // utterance on its own; the EOF flush after the loop handles that.
    if !frame.is_empty() {
        let frame_start_sample = samples_read.saturating_sub(frame.len() as u64);
        let real_len = frame.len();
        frame.resize(VAD_FRAME, 0.0);
        let speech = vad
            .process(&frame)
            .map_err(|e| format!("VAD frame failed: {}", e))?
            >= options.vad_threshold;
        if let Some((start, chunk)) = utterance.accumulate(speech, &frame[..real_len], frame_start_sample)
        {
            dispatch_chunk(ctx, &chunk, start, language, translate, kind_tag, &seg_tx)?;
            total_cues = drain_cues(&seg_rx, &mut on_cue, total_cues);
        }
    }

    // EOF flush: whatever is still buffered gets decoded with its true start PTS.
    if utterance.needs_flush() {
        let start = utterance.flush_start();
        let chunk = utterance.take_chunk();
        dispatch_chunk(ctx, &chunk, start, language, translate, kind_tag, &seg_tx)?;
        total_cues = drain_cues(&seg_rx, &mut on_cue, total_cues);
    }

    on_progress(100.0);
    Ok(total_cues)
}

/// Tracks the utterance being carved out of the VAD stream. Accumulates
/// 32 ms frames of speech and yields a bounded chunk for Whisper once a
/// silence run closes the unit or the length cap is hit.
struct UtteranceBuilder {
    in_speech: bool,
    silence_frames: usize,
    speech_buf: Vec<f32>,
    chunk_start_pts: f64,
    max_chunk_samples: usize,
    min_speech_samples: usize,
    min_silence_frames: usize,
}

impl UtteranceBuilder {
    fn new(max_chunk_samples: usize, min_speech_samples: usize, min_silence_frames: usize) -> Self {
        Self {
            in_speech: false,
            silence_frames: 0,
            speech_buf: Vec::new(),
            chunk_start_pts: 0.0,
            max_chunk_samples,
            min_speech_samples,
            min_silence_frames,
        }
    }

    fn accumulate(&mut self, speech: bool, frame: &[f32], frame_start_sample: u64) -> Option<(f64, Vec<f32>)> {
        if speech {
            if !self.in_speech {
                self.in_speech = true;
                self.silence_frames = 0;
                self.chunk_start_pts = frame_start_sample as f64 / SAMPLE_RATE as f64;
                self.speech_buf.clear();
            }
            self.speech_buf.extend_from_slice(frame);
            if self.speech_buf.len() >= self.max_chunk_samples {
                // Cap hit while still sounding: the next frame re-opens with a
                // fresh chunk so decode latency stays bounded.
                let chunk = self.take_chunk();
                self.in_speech = false;
                return Some((self.chunk_start_pts, chunk));
            }
        } else if self.in_speech {
            self.silence_frames += 1;
            if self.silence_frames >= self.min_silence_frames {
                let ready = self.speech_buf.len() >= self.min_speech_samples;
                let chunk = self.take_chunk();
                self.in_speech = false;
                if ready {
                    return Some((self.chunk_start_pts, chunk));
                }
            }
        }
        None
    }

    fn needs_flush(&self) -> bool {
        self.in_speech && self.speech_buf.len() >= self.min_speech_samples
    }

    fn flush_start(&self) -> f64 {
        self.chunk_start_pts
    }

    fn take_chunk(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.speech_buf)
    }
}

/// Run one Whisper decode pass over an audio chunk at absolute `start` seconds.
///
/// A fresh `WhisperState` is created per chunk (no `reset()`). When `translate`
/// is true the pass outputs English (whisper's translate task); when false it
/// outputs the source speech. `kind` tags every emitted cue so a dual-pass
/// caller can merge the two passes in the UI render queue. The segment callback
/// maps Whisper's 10 ms relative timestamps onto the source timeline before
/// queueing a cue.
fn dispatch_chunk(
    ctx: &WhisperContext,
    audio: &[f32],
    start: f64,
    language: Option<&str>,
    translate: bool,
    kind: Option<&str>,
    seg_tx: &Sender<SubtitleCue>,
) -> Result<(), String> {
    let lang_code = normalize_language(language);
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    // The target language is dynamic: `translate` is only set when the user
    // asked for English output, never hardcoded.
    params.set_translate(translate);
    params.set_single_segment(false);
    // None = Whisper auto-detection; an explicit code is always whitelisted by
    // `normalize_language` so whisper never indexes an unknown language table.
    params.set_language(lang_code.as_deref());
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let kind_owned = kind.map(str::to_string);
    let tx = seg_tx.clone();
    params.set_segment_callback_safe(move |seg: SegmentCallbackData| {
        if seg.text.trim().is_empty() {
            return;
        }
        let _ = tx.send(SubtitleCue {
            id: uuid::Uuid::new_v4().to_string(),
            start_time: start + seg.start_timestamp as f64 * 0.01,
            end_time: start + seg.end_timestamp as f64 * 0.01,
            text: seg.text,
            kind: kind_owned.clone(),
        });
    });

    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Failed to allocate Whisper state: {}", e))?;
    state
        .full(params, audio)
        .map_err(|e| format!("Whisper decode failed: {}", e))?;
    Ok(())
}

/// Push every cue the whisper callback enqueued during a decode pass onto the
/// realtime sink (off the whisper compute thread — the closure only does the
/// fast, lock-free channel send; emission happens once `full` returns).
fn drain_cues(
    recv: &Receiver<SubtitleCue>,
    on_cue: &mut impl FnMut(SubtitleCue),
    mut count: usize,
) -> usize {
    while let Ok(cue) = recv.try_recv() {
        on_cue(cue);
        count += 1;
    }
    count
}

fn report_progress(samples_read: u64, total_samples: u64, on_progress: &mut impl FnMut(f64)) {
    if total_samples > 0 {
        on_progress((samples_read as f64 / total_samples as f64 * 100.0).min(100.0));
    }
}

/// Normalize a spoken-audio language request into a whisper.cpp-safe code.
/// whisper.cpp's language table accepts ISO-639-1 codes or its own full names;
/// anything unresolvable is dropped so whisper runs auto-detection rather than
/// indexing an unknown language token.
pub(crate) fn normalize_language(language: Option<&str>) -> Option<String> {
    let lang = match language {
        Some(l) => l.trim().to_ascii_lowercase(),
        None => return None,
    };
    if lang.is_empty() {
        return None;
    }
    match lang.as_str() {
        "auto" | "auto-detect" | "autodetect" => None,
        "english" | "en" => Some("en".to_string()),
        "burmese" | "myanmar" | "my" => Some("my".to_string()),
        "spanish" | "espanol" | "es" => Some("es".to_string()),
        "french" | "fr" => Some("fr".to_string()),
        "german" | "deu" | "de" => Some("de".to_string()),
        "japanese" | "ja" => Some("ja".to_string()),
        "korean" | "ko" => Some("ko".to_string()),
        "chinese" | "chinese (simplified)" | "zh" => Some("zh".to_string()),
        "portuguese" | "pt" => Some("pt".to_string()),
        "russian" | "ru" => Some("ru".to_string()),
        "thai" | "th" => Some("th".to_string()),
        "vietnamese" | "vi" => Some("vi".to_string()),
        "hindi" | "hi" => Some("hi".to_string()),
        "arabic" | "ar" => Some("ar".to_string()),
        // A clean lowercase 2-letter ISO code passes straight through.
        other if other.len() == 2 && other.chars().all(|c| c.is_ascii_alphabetic()) => {
            Some(other.to_string())
        }
        other => {
            eprintln!(
                "zanplayer-lite: ignoring unrecognized language '{}', falling back to auto-detect",
                other
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_language_maps_and_rejects() {
        assert_eq!(normalize_language(None), None);
        assert_eq!(normalize_language(Some("")), None);
        assert_eq!(normalize_language(Some("auto")), None);
        assert_eq!(normalize_language(Some("Myanmar")), Some("my".to_string()));
        assert_eq!(normalize_language(Some("MY")), Some("my".to_string()));
        assert_eq!(normalize_language(Some("Klingon")), None);
        assert_eq!(normalize_language(Some("fr")), Some("fr".to_string()));
    }

    /// Every 512-sample VAD frame starts at `frame_start_sample`; the chunk's
    /// `start` (seconds) must be that PTS on the *source* timeline. This is the
    /// invariant the dual-pass render queue relies on to merge original and
    /// translation cues onto the same video clock.
    #[test]
    fn utterance_builder_opens_at_speech_pts_and_closes_on_silence() {
        let mut ub = UtteranceBuilder::new(10_000, 100, 2);
        let speech = vec![0.25f32; VAD_FRAME];
        // Three speech frames beginning at the 1-second boundary (sample 16000).
        let base = SAMPLE_RATE as u64;
        assert!(ub.accumulate(true, &speech, base).is_none());
        assert!(ub.accumulate(true, &speech, base + VAD_FRAME as u64).is_none());
        assert!(ub.accumulate(true, &speech, base + 2 * VAD_FRAME as u64).is_none());

        let silence = vec![0.0f32; VAD_FRAME];
        assert!(ub.accumulate(false, &silence, base + 3 * VAD_FRAME as u64).is_none());
        let (start, chunk) = ub
            .accumulate(false, &silence, base + 4 * VAD_FRAME as u64)
            .expect("silence run closes the utterance");
        assert_eq!(start, 1.0);
        assert_eq!(chunk.len(), 3 * VAD_FRAME);
        assert!(!ub.needs_flush());
    }

    #[test]
    fn utterance_builder_rejects_sub_minimum_speech() {
        let mut ub = UtteranceBuilder::new(100_000, 100_000, 1);
        let speech = vec![0.5f32; VAD_FRAME];
        assert!(ub.accumulate(true, &speech, 0).is_none());
        let silence = vec![0.0f32; VAD_FRAME];
        // One silence frame closes the utterance, but the buffered speech is
        // below the minimum, so it is discarded as noise.
        assert!(ub.accumulate(false, &silence, VAD_FRAME as u64).is_none());
        assert!(!ub.needs_flush());
    }

    #[test]
    fn utterance_builder_splits_into_bounded_chunks_at_the_cap() {
        // Cap = 2 frames (1024 samples) to keep decode latency bounded.
        let mut ub = UtteranceBuilder::new(2 * VAD_FRAME, 100, 10);
        let speech = vec![0.25f32; VAD_FRAME];
        assert!(ub.accumulate(true, &speech, 0).is_none());
        let (start, chunk) = ub
            .accumulate(true, &speech, VAD_FRAME as u64)
            .expect("cap flushes a bounded chunk");
        assert_eq!(start, 0.0);
        assert_eq!(chunk.len(), 2 * VAD_FRAME);

        // The next speech frame re-opens a fresh chunk at its own start PTS.
        assert!(ub.accumulate(true, &speech, 2 * VAD_FRAME as u64).is_none());
        let (start2, chunk2) = ub
            .accumulate(true, &speech, 3 * VAD_FRAME as u64)
            .expect("second bounded chunk");
        assert_eq!(start2, (2 * VAD_FRAME) as f64 / SAMPLE_RATE as f64);
        assert_eq!(chunk2.len(), 2 * VAD_FRAME);
    }

    #[test]
    fn utterance_builder_flushes_remaining_speech_at_eof() {
        let mut ub = UtteranceBuilder::new(100_000, 100, 10);
        let speech = vec![0.25f32; VAD_FRAME];
        for i in 0..5u64 {
            assert!(ub.accumulate(true, &speech, i * VAD_FRAME as u64).is_none());
        }
        assert!(ub.needs_flush());
        assert_eq!(ub.flush_start(), 0.0);
        assert_eq!(ub.take_chunk().len(), 5 * VAD_FRAME);
        assert!(!ub.needs_flush());
    }

    #[test]
    fn utterance_builder_ignores_brief_silence() {
        let mut ub = UtteranceBuilder::new(100_000, 100, 3);
        let speech = vec![0.25f32; VAD_FRAME];
        assert!(ub.accumulate(true, &speech, 0).is_none());
        let silence = vec![0.0f32; VAD_FRAME];
        // One and two silence frames stay below the 3-frame minimum.
        assert!(ub.accumulate(false, &silence, VAD_FRAME as u64).is_none());
        assert!(ub.accumulate(false, &silence, 2 * VAD_FRAME as u64).is_none());
        // Speech continues right after — still the same utterance.
        assert!(ub.accumulate(true, &speech, 3 * VAD_FRAME as u64).is_none());
        assert!(ub.needs_flush());
        assert_eq!(ub.take_chunk().len(), 2 * VAD_FRAME);
    }

    #[test]
    fn report_progress_tracks_wav_position() {
        let mut seen = Vec::new();
        report_progress(8000, 16000, &mut |p| seen.push(p));
        assert_eq!(seen, vec![50.0]);
        let mut seen = Vec::new();
        report_progress(16000, 16000, &mut |p| seen.push(p));
        assert_eq!(seen, vec![100.0]);
        // Empty audio never reports; guarded against divide-by-zero.
        report_progress(0, 0, &mut |_| panic!("no progress for empty audio"));
    }
}