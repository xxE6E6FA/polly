# Environment Variables

## Frontend (.env.local)

```
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

## Convex Backend

Set in Convex Dashboard → Settings → Environment Variables.

### Required

| Variable                    | Description               |
| --------------------------- | ------------------------- |
| `API_KEY_ENCRYPTION_SECRET` | `openssl rand -base64 32` |
| `GEMINI_API_KEY`            | Title/summary generation  |
| `OPENAI_API_KEY`            | Audio transcription       |
| `AUTH_GOOGLE_ID`            | Google OAuth              |
| `AUTH_GOOGLE_SECRET`        | Google OAuth              |
| `SITE_URL`                  | Production URL            |
| `CONVEX_SITE_URL`           | Same as SITE_URL          |

### Optional

| Variable             | Description           |
| -------------------- | --------------------- |
| `EXA_API_KEY`        | Web search            |
| `ANTHROPIC_API_KEY`  | Built-in models       |
| `GROQ_API_KEY`       | Built-in models       |
| `OPENROUTER_API_KEY` | Built-in models       |
| `REPLICATE_API_KEY`  | Built-in image models |

## Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → Credentials → OAuth 2.0 Client ID
2. Origins: `http://localhost:5173`, production domain
3. Redirects: `http://localhost:5173/auth/callback`, `https://your-domain.com/auth/callback`
