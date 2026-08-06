import type { TTSAudioResult, TTSProvider, TTSSynthesizeOptions } from '../types.js';

/**
 * Offline TTS mock. Produces a small, valid playable WAV file (a soft tone)
 * so the whole audio pipeline (cache → asset → mobile playback) can be
 * exercised without any paid credentials. It does NOT contain real speech —
 * that is clearly documented and only used when TTS_PROVIDER=mock.
 */
function makeToneWav(seconds = 0.5, frequency = 440, sampleRate = 8000): Buffer {
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.05, (seconds - t) / 0.05);
    const value = Math.round(Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope * 32767);
    buffer.writeInt16LE(value, 44 + i * 2);
  }
  return buffer;
}

export class MockTTSProvider implements TTSProvider {
  readonly name = 'mock';

  async synthesize(_opts: TTSSynthesizeOptions): Promise<TTSAudioResult> {
    await new Promise((r) => setTimeout(r, 3));
    return { data: makeToneWav(), format: 'wav', ext: 'wav' };
  }
}
