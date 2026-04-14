import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  handleAnthropicNonStreaming,
  handleAnthropicStreaming,
} from './anthropic';
import {
  buildMerlinRequest,
  type ChatMessage,
  fetchFromMerlin,
  parseMerlinSSEBuffer,
  readFullContent,
} from './merlin';
import { getModels } from './models';
import type {
  AnthropicRequest,
  Env,
  OpenAIRequest,
  OpenAIResponse,
} from './types';
import {
  getCurrentTimestamp,
  removeCitationPatterns,
  timingSafeEqual,
} from './utils';

// Module-level encoder shared across all streaming requests
const encoder = new TextEncoder();

function sanitizeForDisplay(value: string): string {
  return value.slice(0, 100).replace(/[^\w.\-:]/g, '');
}

function getModelOwner(modelId: string): string {
  if (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4')
  )
    return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('deepseek-')) return 'deepseek-ai';
  if (modelId.startsWith('claude-')) return 'anthropic';
  return 'unknown';
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use(
  '/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'anthropic-version',
    ],
    maxAge: 86400,
  }),
);

// Bearer auth middleware for /v1/* (requires AUTH_TOKEN to be configured)
app.use('/v1/*', async (c, next) => {
  const authToken = c.env.AUTH_TOKEN;

  if (!authToken) {
    return c.json({ error: 'AUTH_TOKEN not configured' }, 503);
  }

  // Support both Bearer token and x-api-key header
  const apiKey = c.req.header('x-api-key');
  if (apiKey && timingSafeEqual(apiKey, authToken)) {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  const bearerPrefix = 'Bearer ';
  if (
    authHeader?.startsWith(bearerPrefix) &&
    timingSafeEqual(authHeader.slice(bearerPrefix.length), authToken)
  ) {
    await next();
    return;
  }

  return c.json({ error: 'Unauthorized' }, 401);
});

// Root route
app.get('/', async (c) => {
  const models = await getModels();
  return c.json({
    status: 'GetMerlin Service Running',
    version: '2.1.0',
    supported_models: models,
  });
});

// Models endpoint - OpenAI compatible
app.get('/v1/models', async (c) => {
  const models = await getModels();
  const data = models.map((modelId) => ({
    id: modelId,
    object: 'model',
    created: 1677610602,
    owned_by: getModelOwner(modelId),
    permission: [
      {
        id: `modelperm-${modelId}`,
        object: 'model_permission',
        created: 1677610602,
        allow_create_engine: false,
        allow_sampling: true,
        allow_logprobs: true,
        allow_search_indices: false,
        allow_view: true,
        allow_fine_tuning: false,
        organization: '*',
        group: null,
        is_blocking: false,
      },
    ],
    root: modelId,
    parent: null,
  }));

  return c.json({
    object: 'list',
    data: data,
  });
});

// Chat completions route - OpenAI compatible
app.post('/v1/chat/completions', async (c) => {
  if (!c.req.header('content-type')?.includes('application/json')) {
    return c.json({ error: 'Content-Type must be application/json' }, 415);
  }

  try {
    const openAIReq: OpenAIRequest = await c.req.json();

    if (
      !openAIReq.messages ||
      !Array.isArray(openAIReq.messages) ||
      openAIReq.messages.length === 0
    ) {
      return c.json({ error: 'messages must be a non-empty array' }, 400);
    }

    // Validate model
    const allowedModels = await getModels();
    const requestedModel = openAIReq.model || 'gemini-2.5-flash';
    if (!allowedModels.includes(requestedModel)) {
      return c.json(
        {
          error: `Model '${sanitizeForDisplay(requestedModel)}' is not supported. See GET /v1/models for available models.`,
        },
        400,
      );
    }

    const merlinReq = buildMerlinRequest(openAIReq.messages, requestedModel);
    const merlinResponse = await fetchFromMerlin(merlinReq, c.env);

    if (openAIReq.stream) {
      return handleOpenAIStreaming(merlinResponse, requestedModel);
    } else {
      return await handleOpenAINonStreaming(merlinResponse, requestedModel);
    }
  } catch (error) {
    console.error('Chat completions error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Messages route - Anthropic compatible
app.post('/v1/messages', async (c) => {
  if (!c.req.header('content-type')?.includes('application/json')) {
    return c.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Content-Type must be application/json',
        },
      },
      415,
    );
  }

  try {
    const anthropicReq: AnthropicRequest = await c.req.json();

    if (
      !anthropicReq.messages ||
      !Array.isArray(anthropicReq.messages) ||
      anthropicReq.messages.length === 0
    ) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'messages must be a non-empty array',
          },
        },
        400,
      );
    }

    if (
      !anthropicReq.max_tokens ||
      typeof anthropicReq.max_tokens !== 'number'
    ) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'max_tokens is required',
          },
        },
        400,
      );
    }

    // Validate model
    const allowedModels = await getModels();
    const requestedModel = anthropicReq.model;
    if (!requestedModel || !allowedModels.includes(requestedModel)) {
      return c.json(
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${sanitizeForDisplay(requestedModel || '')}' is not supported. See GET /v1/models for available models.`,
          },
        },
        400,
      );
    }

    // Build messages list: prepend system as a user-context message if provided
    const messages: ChatMessage[] = anthropicReq.system
      ? [
          { role: 'system', content: anthropicReq.system },
          ...anthropicReq.messages,
        ]
      : [...anthropicReq.messages];

    const merlinReq = buildMerlinRequest(messages, requestedModel);
    const merlinResponse = await fetchFromMerlin(merlinReq, c.env);

    if (anthropicReq.stream) {
      return handleAnthropicStreaming(merlinResponse, requestedModel);
    } else {
      return await handleAnthropicNonStreaming(merlinResponse, requestedModel);
    }
  } catch (error) {
    console.error('Messages error:', error);
    return c.json(
      {
        type: 'error',
        error: { type: 'api_error', message: 'Internal server error' },
      },
      500,
    );
  }
});

// --- OpenAI response handlers ---

async function handleOpenAINonStreaming(
  merlinResponse: Response,
  model: string,
): Promise<Response> {
  const rawContent = await readFullContent(merlinResponse);
  const fullContent = removeCitationPatterns(rawContent);

  const response: OpenAIResponse = {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: getCurrentTimestamp(),
    model: model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: fullContent,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleOpenAIStreaming(
  merlinResponse: Response,
  model: string,
): Response {
  if (!merlinResponse.body) {
    throw new Error('Merlin response has no body');
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Generate ID and timestamp once for entire response
  const responseId = `chatcmpl-${crypto.randomUUID()}`;
  const created = getCurrentTimestamp();
  const body = merlinResponse.body;

  (async () => {
    const reader = body.getReader();
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
          const openAIResp: OpenAIResponse = {
            id: responseId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta: { content: event.content },
                finish_reason: null,
              },
            ],
          };

          await writer.write(
            encoder.encode(`data: ${JSON.stringify(openAIResp)}\n\n`),
          );
        }
      }

      // Final chunk
      const finalResp: OpenAIResponse = {
        id: responseId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };

      await writer.write(
        encoder.encode(`data: ${JSON.stringify(finalResp)}\n\n`),
      );
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      console.error('Streaming error:', error);
      try {
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ error: 'stream_error' })}\n\n`,
          ),
        );
      } catch {
        /* writer may already be closed */
      }
    } finally {
      reader.releaseLock();
      try {
        await writer.close();
      } catch {
        /* writer may already be errored */
      }
    }
  })().catch((error) => console.error('Stream pipeline error:', error));

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

// 404 handler
app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
