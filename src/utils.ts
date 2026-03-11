import type { Env, FirebaseTokenResponse } from './types';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
] as const;

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Firebase token cache (module-level, survives across requests within same isolate)
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getToken(env: Env): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const googleApiKey = env.GOOGLE_API_KEY || '';
  if (!googleApiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': getRandomUserAgent(),
          'X-Client-Version': 'Chrome/JsCore/10.13.1/FirebaseCore-web',
        },
        body: JSON.stringify({ returnSecureToken: true }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Firebase auth failed with status ${response.status}`);
    }

    const data: FirebaseTokenResponse = await response.json();

    if (!data.idToken) {
      throw new Error('Received empty token from Firebase');
    }

    // Firebase anonymous tokens are valid for ~1 hour
    cachedToken = data.idToken;
    tokenExpiresAt = Date.now() + 55 * 60 * 1000 - TOKEN_REFRESH_MARGIN_MS;

    return cachedToken;
  } catch (_error) {
    clearTimeout(timeoutId);
    throw new Error('Failed to obtain authentication token');
  }
}

export function removeCitationPatterns(content: string): string {
  const citationRegex = /(\[|【)\s*(citation|引用):\d+(-\d+)?\s*(\]|】)/g;
  return content.replace(citationRegex, '');
}
