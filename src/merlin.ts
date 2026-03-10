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

export async function fetchFromMerlin(merlinReq: MerlinRequest, env: Env): Promise<Response> {
  const token = await getToken(env);

  const response = await fetch(MERLIN_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, text/event-stream',
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
    body: JSON.stringify(merlinReq)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Merlin API error: ${response.status} - ${errorText}`);
  }

  return response;
}

export interface MerlinSSEEvent {
  eventType: string;
  content: string;
}

/**
 * Parse a buffer of SSE data from Merlin, yielding text content chunks.
 * Returns the unprocessed remainder of the buffer.
 */
export function parseMerlinSSEBuffer(buffer: string): { events: MerlinSSEEvent[]; remainder: string } {
  const events: MerlinSSEEvent[] = [];
  let processedIndex = 0;

  while (true) {
    const eventIndex = buffer.indexOf('event: ', processedIndex);
    if (eventIndex === -1) break;

    const eventEndIndex = buffer.indexOf('\n', eventIndex);
    if (eventEndIndex === -1) break;

    const eventType = buffer.substring(eventIndex + 7, eventEndIndex).trim();

    const dataIndex = buffer.indexOf('data: ', eventEndIndex);
    if (dataIndex === -1) break;

    const dataEndIndex = buffer.indexOf('\n', dataIndex);
    if (dataEndIndex === -1) break;

    const dataStr = buffer.substring(dataIndex + 6, dataEndIndex).trim();

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

    processedIndex = dataEndIndex + 1;
  }

  const remainder = processedIndex > 0 ? buffer.substring(processedIndex) : buffer;
  return { events, remainder };
}

/**
 * Read the entire Merlin SSE stream and return the full concatenated content.
 */
export async function readFullContent(merlinResponse: Response): Promise<string> {
  let fullContent = '';
  const reader = merlinResponse.body!.getReader();
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
