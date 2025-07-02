# Polly

Modern AI chat application built with React Router v7, Convex, and Vercel's AI SDK.

## Quick Start

1. **Environment Setup**

   ```bash
   # Copy the environment template
   cp .env .env.local

   # Edit .env.local and set your Convex URL
   VITE_CONVEX_URL=your-convex-deployment-url
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Start Development**

   ```bash
   # Start Convex backend (in one terminal)
   npx convex dev

   # Start React Router dev server (in another terminal)
   pnpm dev
   ```

## Features

- Real-time chat with multiple AI providers (OpenAI, Anthropic, Google, OpenRouter)
- Unified web search powered by Exa.ai across all AI models
- Image and PDF upload support
- Conversation persistence with Convex
- User authentication and anonymous mode
- Model switching and settings management

## Environment Variables

### Frontend (.env.local)

- `VITE_CONVEX_URL` - Your Convex deployment URL (required for app to function)

### Convex Backend (Set in Convex Dashboard)

#### Core Services

- `GEMINI_API_KEY` - Google Gemini API key (required for title and summary generation)
- `EXA_API_KEY` - Exa.ai API key (enables web search for all AI models)

#### OAuth Authentication

- `AUTH_GOOGLE_ID` - Google OAuth Client ID (required for Google sign-in)
- `AUTH_GOOGLE_SECRET` - Google OAuth Client Secret (required for Google sign-in)
- `SITE_URL` - Your production URL, e.g., `https://your-app.com` (required for OAuth redirects)
- `CONVEX_SITE_URL` - Same as SITE_URL (for backward compatibility)

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Configure:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:5173` (development)
     - Your production domain
   - Authorized redirect URIs:
     - `http://localhost:5173/auth/callback` (development)
     - `https://your-domain.com/auth/callback` (production)
6. Copy the Client ID and Client Secret
7. Add them to Convex Dashboard → Settings → Environment Variables

## Web Search Integration

Polly uses [Exa.ai](https://exa.ai) as a unified web search provider for all AI models, providing consistent, high-quality neural search results.

### How It Works

The system intelligently detects when web search would enhance the response:

1. An LLM analyzes the user's query to determine if web search would be beneficial
2. If search is needed, Exa's neural search API is automatically invoked
3. Search results are injected as context for the AI model
4. Citations are displayed with the response and enriched with metadata

This contextual approach ensures web search is used only when it adds value, avoiding unnecessary searches for simple queries.

### Setup (For Administrators)

1. Get an API key from [https://dashboard.exa.ai](https://dashboard.exa.ai)
2. Add `EXA_API_KEY` to your Convex environment variables
3. Web search capability will be automatically available when needed

**Note**: Web search is a server-side feature. Users cannot configure their own Exa API keys.
