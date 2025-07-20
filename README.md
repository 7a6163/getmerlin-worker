# GetMerlin Cloudflare Worker

Cloudflare Worker version of GetMerlin - provides OpenAI-compatible API endpoints for Merlin AI.

## Features

- OpenAI-compatible `/v1/chat/completions` API
- Streaming and non-streaming responses
- Automatic Firebase authentication
- Global edge deployment
- CORS support

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Development**
   ```bash
   npm run dev
   ```

3. **Deploy**
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

Optional environment variables (set via `wrangler secret put`):
- `AUTH_TOKEN`: API authentication token
- `UUID`: System identifier

## Performance

- 47% faster streaming responses vs Golang version
- Global edge network deployment
- Automatic scaling
- Zero server maintenance
