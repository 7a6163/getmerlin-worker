import { MODEL_CACHE_TTL_SECONDS, MODELS_CDN_URL } from './constants';
import type { MerlinConstantsResponse } from './types';

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

export async function getModels(): Promise<string[]> {
  const cache = caches.default;
  const cacheKey = new Request(MODELS_CDN_URL);

  try {
    // Check cache first
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data: MerlinConstantsResponse = await cached.json();
      const models = parseModels(data);
      if (models.length > 0) {
        return models;
      }
    }

    // Fetch from CDN with timeout
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

    // Store in cache
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
    return [];
  }
}
