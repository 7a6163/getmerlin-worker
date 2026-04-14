export const MERLIN_API_URL =
  'https://www.getmerlin.in/arcane/api/v2/thread/unified';

export const MODELS_CDN_URL =
  'https://cdn.jsdelivr.net/gh/foyer-work/cdn-files@latest/merlin_constants.json';

export const MODEL_CACHE_TTL_SECONDS = 3600;

export const ALLOWED_ROLES = new Set(['user', 'assistant', 'system']);

export const MAX_MESSAGE_CONTENT_LENGTH = 32_768;

/** Model ID must be alphanumeric with hyphens, dots, and colons */
export const MODEL_ID_PATTERN = /^[\w.\-:]+$/;
