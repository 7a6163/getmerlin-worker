# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-04-14

### Added
- Timing-safe token comparison for `AUTH_TOKEN` authentication
- `Content-Type: application/json` validation on POST endpoints (returns 415)
- Message role allowlist validation (`user`, `assistant`, `system`)
- Message content length cap (32 KB per message)
- Model ID format validation via regex pattern
- In-flight promise deduplication for Firebase token and model list fetches (prevents cache stampede)
- SSE parser now concatenates multiple `data:` lines per SSE spec
- Error cause chaining in Firebase token fetch (distinguishes timeout vs network errors)
- Fetch error logging in Merlin API client

### Changed
- `AUTH_TOKEN` is now **required** — returns 503 if not configured (previously optional)
- Model `owned_by` field now reflects actual provider (google, deepseek-ai, etc.) instead of hardcoded `openai`
- Sanitized user-supplied model names in error responses to prevent log pollution
- Streaming IIFE handlers now catch unhandled rejections
- `writer.close()` wrapped in try/catch to handle already-errored writers
- Firebase token TTL uses named constant `FIREBASE_TOKEN_LIFETIME_MS` instead of magic number
- Removed misleading `|| ''` fallback in `GOOGLE_API_KEY` check

### Security
- Replaced `===` token comparison with XOR-based timing-safe equality
- Added input validation at system boundary (role, content length, model ID format)
- Locked down unauthenticated access by default

## [2.0.0] - 2025-08-16

### Added
- Anthropic-compatible `/v1/messages` endpoint (streaming and non-streaming)
- Dynamic model list fetched from Merlin CDN with 3-tier cache (in-memory → CF Cache API → CDN)
- Biome linter and formatter
- `x-api-key` header support for authentication
- Dedicated modules: `anthropic.ts`, `merlin.ts`, `models.ts`

### Changed
- Replaced hardcoded `ALLOWED_MODELS` with dynamic model fetching
- Refactored SSE parsing and Merlin API client into separate module
- Version bumped to 2.0.0

## [1.3.0] - 2025-08-16

### Added
- Implemented `/v1/models` endpoint following OpenAI API standard format
- Models list endpoint returns proper OpenAI-compatible model objects

### Changed
- Updated version from 1.2.0 to 1.3.0
- Removed unnecessary message field from root endpoint

## [1.2.0] - 2025-08-16

### Added
- Root endpoint (`/`) now displays version number and supported models
- Version information in API response

### Changed
- Updated version from 1.1.0 to 1.2.0
- Model list update: replaced `llama-4-maverick` with `gpt-5-nano`

## [1.1.0] - 2025-08-08

### Added
- Prepared for Docker containerization support
- Enhanced documentation for potential Docker deployment

### Changed
- Updated version from 1.0.0 to 1.1.0

## [1.0.0] - Initial Release

### Added
- OpenAI-compatible `/v1/chat/completions` API endpoint
- Support for streaming and non-streaming responses
- Automatic Firebase authentication integration
- Global edge deployment on Cloudflare Workers
- CORS support for cross-origin requests
- Support for 4 AI models:
  - gpt-4o-mini
  - llama-4-maverick
  - gemini-2.5-flash
  - deepseek-chat
- Token caching for improved performance
- Optional authentication token support
- Comprehensive error handling