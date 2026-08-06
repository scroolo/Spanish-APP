/** Provider-independent text-to-speech interfaces. */
export interface TTSSynthesizeOptions {
  text: string;
  voice?: string;
}

export interface TTSAudioResult {
  data: Buffer;
  format: 'mp3' | 'wav';
  ext: string;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(opts: TTSSynthesizeOptions): Promise<TTSAudioResult>;
}
