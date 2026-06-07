import OpenAI from 'openai';
import type { SubtitleCue } from '../types/subtitle';

interface WhisperResponse {
  text: string;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
}

interface TranslationRequest {
  id: string;
  text: string;
}

export class OpenAIService {
  private client: OpenAI | null = null;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey: apiKey, dangerouslyAllowBrowser: true });
  }

  async transcribeAudio(audioFile: File): Promise<SubtitleCue[]> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    const response = await this.client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const whisperData = response as unknown as WhisperResponse;

    return whisperData.segments.map((segment) => ({
      id: `cue-${segment.id}`,
      startTime: segment.start,
      endTime: segment.end,
      text: segment.text.trim(),
    }));
  }

  async batchTranslate(cues: SubtitleCue[], targetLanguage: string): Promise<SubtitleCue[]> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    // Create a numbered list of texts for batch processing
    const numberedTexts = cues.map((cue, index) => `${index + 1}. ${cue.text}`).join('\n');

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following numbered list of texts to ${targetLanguage}.
Important rules:
1. Keep the same numbering format (1., 2., etc.)
2. Only return the translated list, no additional explanations
3. Preserve any proper nouns or technical terms
4. Maintain the original meaning and tone`,
        },
        { role: 'user', content: numberedTexts },
      ],
    });

    const translatedText = response.choices[0]?.message.content || '';
    const translatedLines = translatedText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.replace(/^\d+\.\s*/, ''));

    // Map back to original cues, preserving timestamps
    return cues.map((cue, index) => ({
      ...cue,
      id: `translated-${cue.id}`,
      text: translatedLines[index] || cue.text,
    }));
  }
}
