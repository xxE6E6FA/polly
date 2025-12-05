# Environment Variables

Complete reference for all environment variables used by Polly.

## Frontend (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_CONVEX_URL` | Yes | Your Convex deployment URL |

## Convex Backend

Set these in your Convex Dashboard → Settings → Environment Variables.

### Core Services

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (required for title and summary generation) |
| `OPENAI_API_KEY` | Yes | OpenAI API key (required for audio transcription) |
| `EXA_API_KEY` | No | Exa.ai API key (enables web search for all AI models) |

### OAuth Authentication

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_GOOGLE_ID` | Yes | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth Client Secret |
| `SITE_URL` | Yes | Your production URL, e.g., `https://your-app.com` |
| `CONVEX_SITE_URL` | Yes | Same as SITE_URL (for backward compatibility) |

### Built-in Models (Optional)

Required only if you're using [built-in models](models.md) for the respective providers:

| Variable | Provider |
|----------|----------|
| `GEMINI_API_KEY` | Google |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `GROQ_API_KEY` | Groq |
| `OPENROUTER_API_KEY` | OpenRouter |
| `REPLICATE_API_TOKEN` | Replicate (images) |

## Setting up Google OAuth

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

## Example .env.local

```bash
# Required
VITE_CONVEX_URL=https://your-deployment.convex.cloud

# Optional: for local development with specific features
# (Most env vars go in Convex Dashboard, not here)
```
