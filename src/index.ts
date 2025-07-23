import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import type { Env, OpenAIRequest, OpenAIResponse, MerlinRequest, MerlinResponse } from './types';
import { getRandomUserAgent, getCurrentTimestamp, getToken, removeCitationPatterns } from './utils';
import { MERLIN_API_URL, ALLOWED_MODELS } from './constants';

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Bearer auth middleware for /v1/chat/completions (conditional)
app.use('/v1/chat/completions', async (c, next) => {
  const authToken = c.env.AUTH_TOKEN;

  if (authToken) {
    const authMiddleware = bearerAuth({ token: authToken });
    return authMiddleware(c, next);
  }

  await next();
});

// Root route
app.get('/', (c) => {
  return c.json({
    status: "GetMerlin Service Running...",
    message: "MoLoveSze..."
  });
});

// Chat completions route
app.post('/v1/chat/completions', async (c) => {
  try {
    const openAIReq: OpenAIRequest = await c.req.json();

    if (!openAIReq.messages || !Array.isArray(openAIReq.messages)) {
      return c.json({ error: 'Invalid request format' }, 400);
    }

    // Validate model
    const requestedModel = openAIReq.model || "gemini-2.5-flash";
    if (!ALLOWED_MODELS.includes(requestedModel as typeof ALLOWED_MODELS[number])) {
      return c.json({
        error: `Model '${requestedModel}' is not supported. Allowed models: ${ALLOWED_MODELS.join(', ')}`
      }, 400);
    }

    // Build context from previous messages
    const contextMessages: string[] = [];
    for (let i = 0; i < openAIReq.messages.length - 1; i++) {
      const msg = openAIReq.messages[i];
      contextMessages.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextMessages.join('\n');

    // Prepare Merlin request (v2 format)
    const merlinReq: MerlinRequest = {
      attachments: [],
      chatId: crypto.randomUUID(),
      language: "AUTO",
      message: {
        childId: crypto.randomUUID(),
        content: openAIReq.messages[openAIReq.messages.length - 1].content,
        context: context,
        id: crypto.randomUUID(),
        parentId: "root"
      },
      mode: "UNIFIED_CHAT",
      model: requestedModel,
      metadata: {
        noTask: true,
        isWebpageChat: false,
        deepResearch: false,
        webAccess: true,
        proFinderMode: false,
        mcpConfig: {
          isEnabled: false
        },
        merlinMagic: false
      }
    };

    // Get authentication token
    const token = await getToken(c.env);

    // Make request to Merlin API
    const merlinResponse = await fetch(MERLIN_API_URL, {
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

    if (!merlinResponse.ok) {
      const errorText = await merlinResponse.text();
      throw new Error(`Merlin API error: ${merlinResponse.status} - ${errorText}`);
    }

    // Handle streaming vs non-streaming response
    if (openAIReq.stream) {
      return handleStreamingResponse(merlinResponse, requestedModel);
    } else {
      return await handleNonStreamingResponse(merlinResponse, requestedModel);
    }

  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

async function handleNonStreamingResponse(merlinResponse: Response, model: string): Promise<Response> {
  let fullContent = '';
  const reader = merlinResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process all complete event-data pairs in buffer
      let processedIndex = 0;

      while (true) {
        // Find next "event: message"
        const eventIndex = buffer.indexOf('event: message', processedIndex);
        if (eventIndex === -1) break;

        // Find corresponding "data: " line
        const dataIndex = buffer.indexOf('data: ', eventIndex);
        if (dataIndex === -1) break;

        // Find end of data line
        const dataEndIndex = buffer.indexOf('\n', dataIndex);
        if (dataEndIndex === -1) break; // Incomplete data line, wait for more

        // Extract and parse data
        const dataStr = buffer.substring(dataIndex + 6, dataEndIndex).trim();

        try {
          const merlinResp: MerlinResponse = JSON.parse(dataStr);
          if (merlinResp.data) {
            // v2 API uses 'text' field for content
            const content = merlinResp.data.text || merlinResp.data.content;

            if (content && content !== ' ' && merlinResp.data.type === 'text') {
              fullContent += content;
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }

        processedIndex = dataEndIndex + 1;
      }

      // Keep unprocessed part in buffer
      if (processedIndex > 0) {
        buffer = buffer.substring(processedIndex);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Remove citation patterns
  fullContent = removeCitationPatterns(fullContent);

  const response: OpenAIResponse = {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: getCurrentTimestamp(),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: fullContent
      },
      finish_reason: "stop"
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function handleStreamingResponse(merlinResponse: Response, model: string): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process the stream asynchronously
  (async () => {
    const reader = merlinResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process all complete event-data pairs in buffer
        let processedIndex = 0;

        while (true) {
          // Find next "event: " (any event type)
          const eventIndex = buffer.indexOf('event: ', processedIndex);
          if (eventIndex === -1) break;

          // Find end of event line
          const eventEndIndex = buffer.indexOf('\n', eventIndex);
          if (eventEndIndex === -1) break;

          // Extract event type
          const eventType = buffer.substring(eventIndex + 7, eventEndIndex).trim();

          // Find corresponding "data: " line
          const dataIndex = buffer.indexOf('data: ', eventEndIndex);
          if (dataIndex === -1) break;

          // Find end of data line
          const dataEndIndex = buffer.indexOf('\n', dataIndex);
          if (dataEndIndex === -1) break; // Incomplete data line, wait for more

          // Extract and parse data
          const dataStr = buffer.substring(dataIndex + 6, dataEndIndex).trim();

          try {
            const merlinResp: MerlinResponse = JSON.parse(dataStr);

            // Handle different event types
            if (eventType === 'message' && merlinResp.data) {
              // v2 API uses 'text' field for content
              const content = merlinResp.data.text || merlinResp.data.content;

              if (content && content !== ' ' && merlinResp.data.type === 'text') {
                const openAIResp: OpenAIResponse = {
                  id: `chatcmpl-${crypto.randomUUID()}`,
                  object: "chat.completion.chunk",
                  created: getCurrentTimestamp(),
                  model: model,
                  choices: [{
                    index: 0,
                    delta: {
                      content: content
                    },
                    finish_reason: null
                  }]
                };

                const responseData = `data: ${JSON.stringify(openAIResp)}\n\n`;
                await writer.write(encoder.encode(responseData));
              }
            } else if (eventType === 'error') {
              console.error('Error event received:', merlinResp);
            }
          } catch (e) {
            // Skip invalid JSON
          }

          processedIndex = dataEndIndex + 1;
        }

        // Keep unprocessed part in buffer
        if (processedIndex > 0) {
          buffer = buffer.substring(processedIndex);
        }
      }

      // Stream processing completed

      // Send final chunk
      const finalResp: OpenAIResponse = {
        id: `chatcmpl-${crypto.randomUUID()}`,
        object: "chat.completion.chunk",
        created: getCurrentTimestamp(),
        model: model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: "stop"
        }]
      };

      await writer.write(encoder.encode(`data: ${JSON.stringify(finalResp)}\n\n`));
      await writer.write(encoder.encode('data: [DONE]\n\n'));

    } catch (error) {
      console.error('Streaming error:', error);
    } finally {
      reader.releaseLock();
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// 404 handler
app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
