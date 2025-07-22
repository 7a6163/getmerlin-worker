# GetMerlin Cloudflare Worker

Cloudflare Worker version of GetMerlin - provides OpenAI-compatible API endpoints for Merlin AI.

## Features

- OpenAI-compatible `/v1/chat/completions` API
- Streaming and non-streaming responses
- Automatic Firebase authentication
- Global edge deployment
- CORS support

## Supported Models

This API supports only the following four models:

- `gpt-4o-mini`
- `llama-4-maverick`
- `gemini-2.5-flash`
- `deepseek-chat`

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure secrets**
   ```bash
   # Required: Set Google API Key for Firebase authentication
   wrangler secret put GOOGLE_API_KEY

   # Optional: Set authentication token for API access
   wrangler secret put AUTH_TOKEN
   ```

3. **Development**
   ```bash
   npm run dev
   ```

4. **Deploy**
   ```bash
   npm run deploy
   ```

## Usage

### Basic Request
```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Streaming Request
```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
```

## Configuration

### Required Secrets

#### 1. Google API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Enable the **Identity Toolkit API**
4. Create an API Key:
   - Click "Create Credentials" → "API Key"
   - Restrict the key to "Identity Toolkit API" for security
5. Set the secret in Cloudflare Workers:
   ```bash
   wrangler secret put GOOGLE_API_KEY
   # Enter your Google API Key when prompted
   ```

#### 2. Optional Authentication Token

To protect your API endpoint:
```bash
wrangler secret put AUTH_TOKEN
# Enter your desired authentication token
```

If `AUTH_TOKEN` is set, clients must include the header:
```
Authorization: Bearer <your-token>
```

## Performance

- Global edge network deployment
- Automatic scaling
- Zero server maintenance
