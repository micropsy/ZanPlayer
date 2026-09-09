export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface SubtitleTrack {
  id: string;
  name: string;
  language: string;
  cues: SubtitleCue[];
  isGenerated?: boolean;
  isTranslated?: boolean;
  sourceTrackId?: string;
}
