# Chat State Architecture

This app uses two small Zustand stores for chat features:

- `useChatUIStore` (UI-only): fullscreen, multiline, and per-conversation input history.
- `useChatInputStore` (domain state): per-conversation persona, temperature, and attachments.

Preferred hooks:

- `useChatScopedState(conversationId)`: minimal read/write accessors for persona, temperature, and attachments (append). Use in UI entry points (bottom bar, upload button, drag/drop).
- `useChatAttachments(conversationId)`: read + set full attachments list. Use where attachments are rendered or removed (lists/strips).
- `useChatHistory(conversationId)`: hydrate from existing user messages on revisit; append trimmed input on send. Keyboard Up/Down is caret-aware via `useKeyboardNavigation`.

Guidelines:

- Keep hooks small and stable; place volatile logic in pure utilities (e.g., file processing in `src/lib/process-files.ts`).
- Prefer narrow selectors over broad store subscriptions to reduce re-renders.
- Avoid prop drilling for shared chat state; read from hooks directly.

Examples

Selector usage

```ts
// Prefer narrow selectors
const temperature = useChatInputStore(s => s.temperatureByKey[key]);

// Avoid selecting large objects when only one field is needed
const selectedPersonaId = useChatInputStore(s => s.selectedByKey[key] ?? null);
```

Scoped helper

```ts
const { selectedPersonaId, setSelectedPersonaIdForKey } = useChatScopedState(conversationId);
```

Actions (no re-render)

```ts
import { appendAttachments, setPersona } from "@/stores/actions/chat-input-actions";

appendAttachments(conversationId, newAttachments);
setPersona(conversationId, personaId);
```

File processing

```ts
import { processFilesForAttachments } from "@/lib/process-files";

const atts = await processFilesForAttachments(files, selectedModel, notify);
appendAttachments(conversationId, atts);
```
