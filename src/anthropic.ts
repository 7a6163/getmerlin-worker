import { parseMerlinSSEBuffer, readFullContent } from './merlin';
import type { AnthropicResponse } from './types';
import { removeCitationPatterns } from './utils';

export async function handleAnthropicNonStreaming(
  merlinResponse: Response,
  model: string,
): Promise<Response> {
  const rawContent = await readFullContent(merlinResponse);
  const fullContent = removeCitationPatterns(rawContent);

  const response: AnthropicResponse = {
    id: `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: fullContent }],
    model: model,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export function handleAnthropicStreaming(
  merlinResponse: Response,
  model: string,
): Response {
  if (!merlinResponse.body) {
    throw new Error('Merlin response has no body');
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const msgId = `msg_${crypto.randomUUID()}`;
  const body = merlinResponse.body;

  async function writeEvent(
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await writer.write(
      encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`),
    );
  }

  (async () => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // message_start
      await writeEvent('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });

      // content_block_start
      await writeEvent('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      // Stream content deltas
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseMerlinSSEBuffer(buffer);
        buffer = remainder;

        for (const event of events) {
          await writeEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: event.content },
          });
        }
      }

      // content_block_stop
      await writeEvent('content_block_stop', {
        type: 'content_block_stop',
        index: 0,
      });

      // message_delta
      await writeEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      });

      // message_stop
      await writeEvent('message_stop', { type: 'message_stop' });
    } catch (error) {
      console.error('Anthropic streaming error:', error);
      try {
        await writeEvent('error', {
          type: 'error',
          error: { type: 'api_error', message: 'stream_error' },
        });
      } catch {
        /* writer may already be closed */
      }
    } finally {
      reader.releaseLock();
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
