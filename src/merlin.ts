import { MERLIN_API_URL } from './constants';
import type { Env, MerlinRequest, MerlinResponse } from './types';
import { getRandomUserAgent, getToken } from './utils';

export interface ChatMessage {
  role: string;
  content: string;
}

export function buildMerlinRequest(messages: ChatMessage[], model: string): MerlinRequest {
  const contextMessages: string[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    contextMessages.push(`${msg.role}: ${msg.content}`);
  }

  return {
    attachments: [],
    chatId: crypto.randomUUID(),
    language: "AUTO",
    message: {
      childId: crypto.randomUUID(),
      content: messages[messages.length - 1].content,
      context: contextMessages.join('\n'),
      id: crypto.randomUUID(),
      parentId: "root"
    },
    mode: "UNIFIED_CHAT",
    model: model,
    metadata: {
      noTask: true,
      isWebpageChat: false,
      deepResearch: false,
      webAccess: true,
      proFinderMode: false,
      mcpConfig: { isEnabled: false },
      merlinMagic: false
    }
  };
}

const MERLIN_FETCH_TIMEOUT_MS = 30_000;

export async function fetchFromMerlin(merlinReq: MerlinRequest, env: Env): Promise<Response> {
  const token = await getToken(env);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MERLIN_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(MERLIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${token}`,
        'X-Merlin-Version': 'web-merlin',
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.getmerlin.in',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': 'https://www.getmerlin.in/chat'
      },
      body: JSON.stringify(merlinReq),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Merlin API error:', response.status, errorText);
      throw new Error(`Merlin API returned status ${response.status}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export interface MerlinSSEEvent {
  eventType: string;
  content: string;
}

/**
 * Parse a buffer of SSE data from Merlin, yielding text content chunks.
 * Splits on \n\n event boundaries for correctness.
 * Returns the unprocessed remainder of the buffer.
 */
export function parseMerlinSSEBuffer(buffer: string): { events: MerlinSSEEvent[]; remainder: string } {
  const events: MerlinSSEEvent[] = [];
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    const lines = part.split('\n');
    let eventType = '';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6).trim();
      }
    }

    if (!eventType || !dataStr) continue;

    try {
      const merlinResp: MerlinResponse = JSON.parse(dataStr);

      if (eventType === 'message' && merlinResp.data) {
        const content = merlinResp.data.text || merlinResp.data.content;

        if (content && content !== ' ' && merlinResp.data.type === 'text') {
          events.push({ eventType, content });
        }
      } else if (eventType === 'error') {
        console.error('Error event received:', merlinResp);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return { events, remainder };
}

/**
 * Read the entire Merlin SSE stream and return the full concatenated content.
 */
export async function readFullContent(merlinResponse: Response): Promise<string> {
  if (!merlinResponse.body) {
    throw new Error('Merlin response has no body');
  }

  let fullContent = '';
  const reader = merlinResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = parseMerlinSSEBuffer(buffer);
      buffer = remainder;

      for (const event of events) {
        fullContent += event.content;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}
