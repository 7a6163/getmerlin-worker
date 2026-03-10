import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';
import {
  handleAnthropicNonStreaming,
  handleAnthropicStreaming,
} from './anthropic';
import {
  buildMerlinRequest,
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
import { getCurrentTimestamp, removeCitationPatterns } from './utils';

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

// Bearer auth middleware for /v1/* (conditional)
app.use('/v1/*', async (c, next) => {
  const authToken = c.env.AUTH_TOKEN;

  if (authToken) {
    // Support both Bearer token and x-api-key header
    const apiKey = c.req.header('x-api-key');
    if (apiKey === authToken) {
      await next();
      return;
    }

    const authMiddleware = bearerAuth({ token: authToken });
    return authMiddleware(c, next);
  }

  await next();
});

// Root route
app.get('/', async (c) => {
  const models = await getModels();
  return c.json({
    status: 'GetMerlin Service Running',
    version: '2.0.0',
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
    owned_by: 'openai',
    permission: [
      {
        id: `modelperm-${crypto.randomUUID()}`,
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
          error: `Model '${requestedModel}' is not supported. See GET /v1/models for available models.`,
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
            message: `Model '${requestedModel}' is not supported. See GET /v1/models for available models.`,
          },
        },
        400,
      );
    }

    // Build messages list: prepend system as a user-context message if provided
    const messages = anthropicReq.system
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
  const encoder = new TextEncoder();

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
            id: `chatcmpl-${crypto.randomUUID()}`,
            object: 'chat.completion.chunk',
            created: getCurrentTimestamp(),
            model: model,
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
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: 'chat.completion.chunk',
        created: getCurrentTimestamp(),
        model: model,
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

// 404 handler
app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
