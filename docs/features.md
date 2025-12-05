# Features

Polly includes several AI-powered features beyond basic chat.

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

## Image Generation (Replicate)

Generate images using models hosted on Replicate.

### User Setup

1. Add your Replicate API key in Settings → API Keys
2. Go to Settings → Models → Image to:
   - Browse curated text-to-image models from Replicate
   - Search all Replicate models
   - Add a custom model by ID (e.g., `stability-ai/sdxl`)

### Admin Setup

To provide built-in image models that don't require user API keys, see [Built-in Models](models.md).

## Text-to-Speech (ElevenLabs)

Play any message aloud using ElevenLabs voices.

### User Setup

1. Add your ElevenLabs API key in Settings → API Keys
2. Configure in Settings → Models → Text-to-Speech:
   - Pick model and voice (your ElevenLabs voices are listed)
   - Choose stability mode and enhanced processing
3. Play any message via the speaker icon in message actions

### Per-Persona Voice

Per-persona voice override is available in Persona settings, allowing different AI personas to use different voices.

## AI Providers

Polly supports multiple AI providers for chat:

- **OpenAI** - GPT-4o, GPT-4o-mini, o1, etc.
- **Anthropic** - Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google** - Gemini 2.0 Flash, Gemini Pro
- **OpenRouter** - Access to 100+ models from various providers

Users can add their own API keys for any provider in Settings → API Keys.

## File Uploads

- **Images**: Attach images to messages for vision-capable models
- **PDFs**: Upload PDFs for models that support document analysis
- **Audio**: Voice input with automatic transcription (requires OpenAI API key)
