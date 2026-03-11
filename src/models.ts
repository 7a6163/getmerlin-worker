import { MODEL_CACHE_TTL_SECONDS, MODELS_CDN_URL } from './constants';
import type { MerlinConstantsResponse } from './types';

// Hardcoded fallback models in case both in-memory cache and CDN fail
const FALLBACK_MODELS = [
  'gpt-4o-mini',
  'gpt-5-nano',
  'gemini-2.5-flash',
  'deepseek-chat',
];

// In-memory L1 cache (survives across requests within same isolate)
const IN_MEMORY_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedModels: readonly string[] | null = null;
let modelsCacheExpiresAt = 0;

function parseModels(data: MerlinConstantsResponse): string[] {
  if (!data.textLLMs || !Array.isArray(data.textLLMs)) {
    return [];
  }

  return data.textLLMs
    .filter(
      (m) =>
        !m.archived && !m.paid && m.queryCost <= 1 && typeof m.id === 'string',
    )
    .map((m) => m.id);
}

export async function getModels(): Promise<readonly string[]> {
  // L1: In-memory cache
  if (cachedModels && Date.now() < modelsCacheExpiresAt) {
    return cachedModels;
  }

  const cache = caches.default;
  const cacheKey = new Request(MODELS_CDN_URL);

  try {
    // L2: Cache API
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data: MerlinConstantsResponse = await cached.json();
      const models = parseModels(data);
      if (models.length > 0) {
        cachedModels = models;
        modelsCacheExpiresAt = Date.now() + IN_MEMORY_TTL_MS;
        return models;
      }
    }

    // L3: CDN fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(MODELS_CDN_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`CDN responded with ${response.status}`);
    }

    const data: MerlinConstantsResponse = await response.json();
    const models = parseModels(data);

    if (models.length === 0) {
      throw new Error('No valid models found in CDN response');
    }

    // Update L1 cache
    cachedModels = models;
    modelsCacheExpiresAt = Date.now() + IN_MEMORY_TTL_MS;

    // Update L2 cache
    const cacheResponse = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${MODEL_CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(cacheKey, cacheResponse);

    return models;
  } catch (error) {
    console.error('Failed to fetch models from CDN:', error);
    // Return stale in-memory cache if available, otherwise fallback
    if (cachedModels) {
      return cachedModels;
    }
    console.warn('Using hardcoded fallback model list');
    return FALLBACK_MODELS;
  }
}
