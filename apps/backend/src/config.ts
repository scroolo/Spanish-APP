import 'dotenv/config';

export const config = {
  environment: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://spanish:spanish@localhost:5432/spanishteacher',
  jwtSecret:
    process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me-in-production',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'info' | 'debug' | 'silent',
  mediaDir: process.env.MEDIA_DIR ?? './media/tts',
  ttsCacheVersion: process.env.TTS_CACHE_VERSION ?? '1',

  // Vercel Blob token. When present, TTS assets are stored in Vercel Blob
  // instead of the local disk (which is ephemeral on serverless functions).
  blob: {
    token: process.env.BLOB_READ_WRITE_TOKEN ?? '',
  },

  // Maximum accepted request body in bytes (Fastify bodyLimit). Raised well
  // above the default 1 MB so base64 m4a audio recordings survive upload.
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES ?? 15 * 1024 * 1024),

  // AI provider. 'mock' runs fully offline with deterministic outputs.
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'mock') as 'mock' | 'openai',
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
    maxStructuredRetries: Number(process.env.AI_STRUCTURED_RETRIES ?? 3),
    maxContextChars: Number(process.env.AI_CONTEXT_MAX_CHARS ?? 9000),
  },

  // Text-to-speech provider. 'mock' returns deterministic asset metadata.
  tts: {
    provider: (process.env.TTS_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'elevenlabs',
    voice: process.env.TTS_VOICE ?? 'alloy',
    model: process.env.TTS_MODEL ?? 'tts-1',
    apiKey: process.env.TTS_API_KEY ?? '',
    baseUrl: process.env.TTS_BASE_URL ?? 'https://api.openai.com/v1',
  },

  // Speech-to-text provider. 'mock' returns deterministic transcripts.
  // 'openai' uses OpenAI Whisper, 'groq' uses Groq's OpenAI-compatible endpoint.
  stt: {
    provider: (process.env.STT_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'groq',
    model: process.env.STT_MODEL ?? 'whisper-1',
    apiKey: process.env.STT_API_KEY ?? '',
    baseUrl: process.env.STT_BASE_URL ?? 'https://api.openai.com/v1',
    groqApiKey: process.env.GROQ_API_KEY ?? '',
    groqBaseUrl: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
    groqModel: process.env.GROQ_MODEL ?? 'whisper-large-v3-turbo',
    maxAudioSeconds: Number(process.env.STT_MAX_AUDIO_SECONDS ?? 30),
  },

  // Per-user rate limits (in-memory, resets on restart). -1 disables a limit.
  rateLimit: {
    aiPerHour: Number(process.env.RATE_LIMIT_AI_PER_HOUR ?? 60),
    ttsPerHour: Number(process.env.RATE_LIMIT_TTS_PER_HOUR ?? 90),
    sttPerHour: Number(process.env.RATE_LIMIT_STT_PER_HOUR ?? 40),
  },
};
