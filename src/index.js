/**
 * Cloudflare Worker version of GetMerlin
 */

import UserAgent from 'fake-useragent';

// Constants
const FIREBASE_SIGNUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyAvCgtQ4XbmlQGIynDT-v_M8eLaXrKmtiM";
const MERLIN_API_URL = "https://www.getmerlin.in/arcane/api/v2/thread/unified";

// Allowed models
const ALLOWED_MODELS = [
  'gpt-4o-mini',
  'llama-4-maverick',
  'gemini-2.5-flash',
  'deepseek-chat'
];

// Utility functions
function getRandomUserAgent() {
  try {
    return UserAgent();
  } catch (error) {
    // Fallback to a default user agent if fake-useragent fails
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
}

function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function getEnvOrDefault(env, key, defaultValue) {
  return env[key] || defaultValue;
}

// Firebase token acquisition
async function getToken() {
  try {
    const response = await fetch(FIREBASE_SIGNUP_URL, {
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

    const data = await response.json();

    if (!data.idToken) {
      throw new Error('Received empty token');
    }

    return data.idToken;
  } catch (error) {
    throw new Error(`Failed to get token: ${error.message}`);
  }
}

// Request handlers
async function handleRoot() {
  return new Response(JSON.stringify({
    status: "GetMerlin Service Running...",
    message: "MoLoveSze..."
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleChatCompletions(request, env) {
  try {
    // Check authorization
    const authHeader = request.headers.get('Authorization');
    const envToken = getEnvOrDefault(env, 'AUTH_TOKEN', '');

    if (envToken && authHeader !== `Bearer ${envToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // Parse request body
    const openAIReq = await request.json();

    if (!openAIReq.messages || !Array.isArray(openAIReq.messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request format' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // Validate model
    const requestedModel = openAIReq.model || "gemini-2.5-flash";
    if (!ALLOWED_MODELS.includes(requestedModel)) {
      return new Response(JSON.stringify({
        error: `Model '${requestedModel}' is not supported. Allowed models: ${ALLOWED_MODELS.join(', ')}`
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // Build context from previous messages
    const contextMessages = [];
    for (let i = 0; i < openAIReq.messages.length - 1; i++) {
      const msg = openAIReq.messages[i];
      contextMessages.push(`${msg.role}: ${msg.content}`);
    }
    const context = contextMessages.join('\n');

    // Prepare Merlin request (v2 format)
    const merlinReq = {
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
    const token = await getToken();

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
}

async function handleNonStreamingResponse(merlinResponse, model) {
  let fullContent = '';
  const reader = merlinResponse.body.getReader();
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
          const merlinResp = JSON.parse(dataStr);
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
  const citationRegex = /(\[|【)\s*(citation|引用):\d+(-\d+)?\s*(\]|】)/g;
  fullContent = fullContent.replace(citationRegex, '');

  const response = {
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
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function handleStreamingResponse(merlinResponse, model) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process the stream asynchronously
  (async () => {
    const reader = merlinResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Debug: log raw chunks (can be removed in production)
        // console.log('Raw chunk received:', JSON.stringify(chunk));

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
            const merlinResp = JSON.parse(dataStr);

            // Handle different event types
            if (eventType === 'message' && merlinResp.data) {
              // v2 API uses 'text' field for content
              const content = merlinResp.data.text || merlinResp.data.content;

              if (content && content !== ' ' && merlinResp.data.type === 'text') {
                const openAIResp = {
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
      const finalResp = {
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
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// CORS handler
async function handleCORS() {
  return new Response(JSON.stringify({ status: 'OK' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Main worker handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    // Route handling
    if (url.pathname === '/' && request.method === 'GET') {
      return handleRoot();
    }

    if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
      return handleChatCompletions(request, env);
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 });
  }
};
