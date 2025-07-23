import UserAgent from 'fake-useragent';
import type { Env, FirebaseTokenResponse } from './types';

export function getRandomUserAgent(): string {
  try {
    return UserAgent();
  } catch (error) {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
}

export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export async function getToken(env: Env): Promise<string> {
  try {
    const googleApiKey = env.GOOGLE_API_KEY || '';
    if (!googleApiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const firebaseSignupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${googleApiKey}`;
    const response = await fetch(firebaseSignupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': getRandomUserAgent(),
        'X-Client-Version': 'Chrome/JsCore/10.13.1/FirebaseCore-web'
      },
      body: JSON.stringify({ returnSecureToken: true })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: FirebaseTokenResponse = await response.json();

    if (!data.idToken) {
      throw new Error('Received empty token');
    }

    return data.idToken;
  } catch (error) {
    throw new Error(`Failed to get token: ${(error as Error).message}`);
  }
}

export function removeCitationPatterns(content: string): string {
  const citationRegex = /(\[|【)\s*(citation|引用):\d+(-\d+)?\s*(\]|】)/g;
  return content.replace(citationRegex, '');
}
