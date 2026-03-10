# GetMerlin Cloudflare Worker

Cloudflare Worker that provides OpenAI and Anthropic compatible API endpoints for Merlin AI.

## Features

- OpenAI-compatible `/v1/chat/completions` API
- Anthropic-compatible `/v1/messages` API
- Streaming and non-streaming responses
- Dynamic model list from CDN (cached 1 hour)
- Automatic Firebase authentication with token caching
- Global edge deployment
- CORS support

## Supported Models

Models are fetched dynamically from CDN. Only free models (`queryCost <= 1`) are available. Check the current list via:

```bash
curl https://your-worker.workers.dev/v1/models
```

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

### OpenAI Format

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax-m2.5",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Anthropic Format

```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax-m2.5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Streaming

Both endpoints support `"stream": true` with their respective SSE formats.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and supported models |
| `/v1/models` | GET | List available models (OpenAI format) |
| `/v1/chat/completions` | POST | Chat completions (OpenAI format) |
| `/v1/messages` | POST | Messages (Anthropic format) |

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

If `AUTH_TOKEN` is set, clients must include one of:
```
Authorization: Bearer <your-token>
x-api-key: <your-token>
```
