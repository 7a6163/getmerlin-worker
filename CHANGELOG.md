# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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