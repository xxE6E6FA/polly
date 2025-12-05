# Built-in Models

Polly supports config-based built-in models for both text and image generation. This allows administrators to pre-configure models that are available to all users without requiring them to add their own API keys.

## Overview

Built-in models are defined in `config/models/` with minimal configuration. Model capabilities (context length, image support, etc.) are auto-discovered from provider APIs at seed time.

```
config/
└── models/
    ├── text-models.ts    # Text/chat models
    ├── image-models.ts   # Image generation models
    └── index.ts          # Barrel export
```

## Adding Text Models

Edit `config/models/text-models.ts`:

```typescript
export const builtInTextModels: TextModelConfig[] = [
  {
    modelId: "gemini-2.5-flash-lite",
    provider: "google",
    free: true,
  },
  {
    modelId: "gpt-4o-mini",
    provider: "openai",
    free: true,
  },
  {
    modelId: "claude-3-haiku-20240307",
    provider: "anthropic",
    free: false, // Requires user API key
  },
];
```

### Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `modelId` | Yes | Model ID as recognized by the provider |
| `provider` | Yes | `"google"`, `"openai"`, `"anthropic"`, `"groq"`, or `"openrouter"` |
| `free` | Yes | If `true`, uses server-side API key; if `false`, requires user's key |
| `name` | No | Display name override (auto-discovered if not set) |
| `isActive` | No | Set to `false` to disable without removing |

### Auto-discovered Capabilities

The following are fetched from provider APIs:

- `contextLength` - Maximum tokens the model can process
- `maxOutputTokens` - Maximum tokens the model can generate
- `supportsImages` - Whether the model accepts image inputs
- `supportsTools` - Whether the model supports function calling
- `supportsReasoning` - Whether the model has reasoning/thinking capabilities
- `supportsFiles` - Whether the model can process file attachments

## Adding Image Models

Edit `config/models/image-models.ts`:

```typescript
export const builtInImageModels: ImageModelConfig[] = [
  {
    modelId: "black-forest-labs/flux-schnell",
    provider: "replicate",
    free: true,
  },
  {
    modelId: "stability-ai/sdxl",
    provider: "replicate",
    free: true,
  },
];
```

### Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `modelId` | Yes | Model ID in `owner/name` format |
| `provider` | Yes | Currently only `"replicate"` is supported |
| `free` | Yes | If `true`, uses server-side API key |
| `name` | No | Display name override |
| `isActive` | No | Set to `false` to disable |

### Auto-discovered Capabilities

From the Replicate API:

- `description` - Model description
- `supportedAspectRatios` - Available aspect ratios
- `supportsUpscaling`, `supportsInpainting`, `supportsOutpainting`
- `supportsImageToImage`, `supportsMultipleImages`
- `supportsNegativePrompt`
- `modelVersion`, `owner`, `tags`

## Running the Seed Migration

After adding models to the config, run the seed migration to populate the database:

```bash
# Using npx
npx convex run migrations/seedBuiltInModels:runMigration

# Or via Convex dashboard
# Navigate to Functions → migrations/seedBuiltInModels → runMigration
```

The migration:
1. Reads model configs from `config/models/`
2. Fetches capabilities from each provider's API
3. Upserts models into `builtInModels` and `builtInImageModels` tables

### Required Environment Variables

Set these in your Convex dashboard for auto-discovery to work:

| Provider | Environment Variable |
|----------|---------------------|
| Google | `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Replicate | `REPLICATE_API_TOKEN` |

Models for providers without API keys will be skipped with a warning.

## How Auto-discovery Works

### Text Models

- **Google**: Fetches individual model details via `generativelanguage.googleapis.com/v1beta/models/{modelId}`
- **OpenAI, Anthropic, Groq, OpenRouter**: Fetches all available models, then filters to match config entries

### Image Models

- **Replicate**: Fetches model details via `api.replicate.com/v1/models/{owner}/{name}`
- Parses the OpenAPI schema to detect supported parameters and capabilities

## Database Tables

### `builtInModels` (Text)

Stores text model data with auto-discovered capabilities. Schema defined in `convex/lib/schemas.ts`.

### `builtInImageModels` (Images)

Stores image model data. Added alongside the config system.

## Precedence Rules

When a user has added their own model with the same `modelId` and `provider`:

- **Text models**: User's model takes precedence
- **Image models**: User's model takes precedence (via `getAvailableImageModels` query)

This allows users to override built-in models with custom configurations if needed.
