# Polly

Modern AI chat application built with React Router v7, Convex, and Vercel's AI SDK.

## Quick Start

1. **Clone and Install**

   ```bash
   mise install
   bun install
   ```

2. **Environment Setup**

   ```bash
   cp .env .env.local
   # Edit .env.local and set VITE_CONVEX_URL
   ```

3. **Start Development**

   ```bash
   bun run dev
   ```

## Prerequisites

- Bun (latest): `curl -fsSL https://bun.sh/install | bash`
- Node 20.x (for Convex compatibility)

Mise handles these prerequisites.

## Features

- Real-time chat with multiple AI providers
- Unified web search powered by Exa.ai
- Image generation via Replicate
- Text-to-speech via ElevenLabs
- Image and PDF upload support
- Conversation persistence and sharing
- Installable PWA with offline support

## Commands

```bash
bun run dev        # Start dev server
bun run build      # Production build
bun run fix        # Auto-fix formatting/linting
bun run check      # Full verification (lint + types + build)
bun run test       # Run tests
```

## Documentation

- [Features](docs/features.md) - Web search, image generation, TTS details
- [Environment Setup](docs/environment.md) - All environment variables
- [Built-in Models](docs/models.md) - Adding default models (dev)
- [PWA](docs/pwa.md) - Progressive web app details
- [Contributing](CONTRIBUTING.md) - Development setup, testing, code style
- [Deployment](DEPLOYMENT.md) - Production deployment
