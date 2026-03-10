export const MERLIN_API_URL = "https://www.getmerlin.in/arcane/api/v2/thread/unified";

export const MODELS_CDN_URL = "https://cdn.jsdelivr.net/gh/foyer-work/cdn-files@latest/merlin_constants.json";

export const MODEL_CACHE_TTL_SECONDS = 3600;

export const FALLBACK_MODELS: readonly string[] = [
  'gpt-4o-mini',
  'gpt-5-nano',
  'gemini-2.5-flash',
  'deepseek-chat'
] as const;
