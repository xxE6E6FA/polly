---
globs: convex/**
---

# Domain Glossary

## Conversation & Branching
- **Conversation**: A chat thread. Has `userId`, optional `personaId`, timestamps.
- **Branch**: A new conversation forked from a message. Linked via `parentConversationId` and `branchFromMessageId`.
- **rootConversationId**: The original conversation in a branch tree (set to self for roots).
- **branchId**: UUID grouping related branches together.

## Persona
- System prompt template with name, icon, description, and optional sampling parameters.
- **Snapshotted onto messages** at creation time (`personaName`, `personaIcon`) — changing the conversation persona doesn't retroactively update existing messages.

## Streaming Model
- **currentStreamingMessageId**: The message being streamed. The streaming action's `finally` block only clears `isStreaming` if its messageId matches this field — prevents race conditions between overlapping actions.
- **stopRequested**: Timestamp set when user requests stop. The streaming action checks this periodically and stops gracefully.
- **activeImageGeneration**: Tracks in-progress Replicate image generation (`replicateId` + `messageId`).

## Private Mode
- Client-side AI processing only — no server storage of messages.
- Uses the user's own API keys (stored encrypted in `userApiKeys`).
- Handled by `usePrivateChat` hook on the frontend.

## Hydrated Model
- Base model reference (just `modelId`, `name`, `provider`) + capabilities resolved at query time from `modelsDevCache`.
- Types: `HydratedUserModel`, `HydratedBuiltInModel`, `HydratedModel`.
- Capabilities: `supportsTools`, `supportsImages`, `supportsReasoning`, `supportsFiles`, `contextLength`, `inputModalities`.

## Background Jobs
- `backgroundJobs` table with status/progress polling.
- Types: export, import, bulk_archive, bulk_delete, conversation_summary, data_migration, model_migration, backup.
- Status flow: scheduled → processing → completed | failed | cancelled.
- Jobs have priority (low/normal/high/urgent) and retry support.
