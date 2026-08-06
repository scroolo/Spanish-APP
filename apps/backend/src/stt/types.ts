export interface SttTranscribeOptions {
  /** Raw audio bytes (e.g. base64-decoded recording from the mobile client). */
  audio: Uint8Array;
  mimeType: string;
  language?: string;
}

export interface SttTranscriptionResult {
  text: string;
  durationSeconds: number;
  language: string;
}

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(opts: SttTranscribeOptions): Promise<SttTranscriptionResult>;
}
