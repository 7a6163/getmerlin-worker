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

export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

// Firebase anonymous tokens are valid for 1 hour
const FIREBASE_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenInflight: Promise<string> | null = null;

export async function getToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  // Deduplicate concurrent fetches
  if (tokenInflight) {
    return tokenInflight;
  }

  tokenInflight = fetchFirebaseToken(env).finally(() => {
    tokenInflight = null;
  });

  return tokenInflight;
}

async function fetchFirebaseToken(env: Env): Promise<string> {
  const googleApiKey = env.GOOGLE_API_KEY;
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

    cachedToken = data.idToken;
    tokenExpiresAt =
      Date.now() + FIREBASE_TOKEN_LIFETIME_MS - TOKEN_REFRESH_MARGIN_MS;

    return cachedToken;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Firebase auth token fetch timed out', {
        cause: error,
      });
    }
    throw new Error('Failed to obtain authentication token', {
      cause: error,
    });
  }
}

export function removeCitationPatterns(content: string): string {
  const citationRegex = /(\[|【)\s*(citation|引用):\d+(-\d+)?\s*(\]|】)/g;
  return content.replace(citationRegex, '');
}
