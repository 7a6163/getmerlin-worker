export const MERLIN_API_URL = "https://www.getmerlin.in/arcane/api/v2/thread/unified";

export const ALLOWED_MODELS = [
  'gpt-4o-mini',
  'gpt-5-nano',
  'gemini-2.5-flash',
  'deepseek-chat'
] as const;

export type AllowedModel = typeof ALLOWED_MODELS[number];
