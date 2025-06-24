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

## Environment Variables

### Frontend (.env.local)

- `VITE_CONVEX_URL` - Your Convex deployment URL (required for app to function)

### Convex Backend (Set in Convex Dashboard)

- `GEMINI_API_KEY` - Google Gemini API key (required for title and summary generation)

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

## Features

- Real-time chat with multiple AI providers (OpenAI, Anthropic, Google, OpenRouter)
- Image and PDF upload support
- Conversation persistence with Convex
- User authentication and anonymous mode
- Model switching and settings management
