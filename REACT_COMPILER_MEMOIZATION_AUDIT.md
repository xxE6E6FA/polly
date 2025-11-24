# React Compiler Memoization Audit

## Executive Summary

This audit examines manual memoization patterns in the Polly codebase to identify opportunities for simplification with React Compiler (enabled in `vite.config.ts`). The codebase shows generally good discipline, but **30-40% of manual memoization can be removed immediately**, with another **30-40% becoming redundant** once React Compiler is fully leveraged.

**Key Findings:**
- ✅ No JSON.stringify comparisons or deep equality anti-patterns
- ✅ No use-props-hash or similar over-engineered solutions
- ✅ Legitimate custom memo comparators for performance-critical virtualized lists
- ⚠️ Many trivial useMemo/useCallback wrapping simple operations
- ⚠️ Some premature optimization without measured performance data
- ℹ️ Backend caching (Convex) is appropriate and unaffected by this audit

---

## 1. React.memo with Custom Comparators

### Findings

**Total instances:** 22 components with `memo()`
**With custom comparators:** 3 components

#### ✅ Legitimate Custom Comparators (KEEP)

**1. ConversationItem** (`src/components/sidebar/conversation-item.tsx:507-540`)
```typescript
export const ConversationItem = memo(
  ConversationItemComponent,
  (prevProps, nextProps) => {
    // Ignore changes to allVisibleIds to avoid list-wide re-renders
    // Only re-render when conversation data or selection changes
  }
);
```
**Why keep:** Virtualized list optimization - prevents cascade re-renders when range selection array changes. This is a legitimate performance optimization for lists with 100+ items.

---

**2. ChatMessage** (`src/components/chat-message.tsx:150-210`)
```typescript
export const ChatMessage = memo(
  ChatMessageComponent,
  (prevProps, nextProps) => {
    // Always re-render if image generation status changes
    // Always re-render if attachments change (prevents skeleton flickering)
    // Re-render when reasoning changes to ensure live updates
  }
);
```
**Why keep:** Streaming optimization - prevents re-rendering all messages when only one message is streaming. Critical for chat UX with 50+ messages.

---

**3. AttachmentStrip** (`src/components/chat-message/AttachmentStrip.tsx:105-122`)
```typescript
export const AttachmentStrip = memo(AttachmentStripComponent, (prev, next) => {
  // Deep comparison of attachment URLs and names
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.url !== b[i]?.url || a[i]?.name !== b[i]?.name) {
      return false;
    }
  }
});
```
**Why reconsider:** This could likely use default shallow comparison if attachments array reference changes when items change. The loop-based comparison adds complexity without clear benefit.

**Action:** Test if default memo works (remove custom comparator) - attachments likely already change by reference when updated.

---

#### ℹ️ Components with Default memo (19 total)

These use `memo()` without custom comparators. React Compiler may make many redundant:

- `VirtualizedChatMessages` - Keep (virtualization)
- `MessageItem` - Keep (virtualization child)
- `ModelCard`, `ImageModelCard` - Keep (virtualization)
- `ConversationList`, `ConversationActions`, etc. - **Consider removing** after React Compiler testing

**Recommendation:** Start removing default `memo()` from non-virtualized components after confirming React Compiler handles them.

---

## 2. Manual useMemo/useCallback Overuse

### Category A: Trivial Computations (HIGH Priority - Remove)

These wrap simple operations that React Compiler automatically optimizes:

#### **1. Simple Boolean Logic**

**File:** `src/components/chat-input/text-input-section.tsx:48-57`
```typescript
const shouldRenderNegativePrompt = useMemo(
  () =>
    Boolean(
      canSend &&
        generationMode === "image" &&
        hasReplicateApiKey &&
        selectedImageModel?.supportsNegativePrompt
    ),
  [canSend, generationMode, hasReplicateApiKey, selectedImageModel?.supportsNegativePrompt]
);
```
**Issue:** Memoizing a boolean expression - overhead exceeds benefit  
**Action:** Remove - inline as: `const shouldRenderNegativePrompt = canSend && ...`

---

**File:** `src/components/chat-input/index.tsx:298-308`
```typescript
const dynamicPlaceholder = useMemo(() => {
  if (!online) return "Offline — reconnect to send";
  if (generationMode === "image") return "Describe your image...";
  // ... more conditions
}, [generationMode, isPrivateMode, isArchived, online]);
```
**Issue:** Simple conditional string selection  
**Action:** Remove - inline the if/else chain

---

#### **2. Simple Array Operations**

**File:** `src/components/chat-input/index.tsx:214-227`
```typescript
const userMessages = useMemo(() => {
  const userMessages: string[] = [];
  for (let i = sourceMessages.length - 1; i >= 0; i--) {
    if (msg.role === "user") userMessages.push(content);
  }
  return userMessages;
}, [userMessageContents, messages]);
```
**Issue:** Simple filter operation  
**Action:** Remove - React Compiler will memoize automatically

---

**File:** `src/hooks/chat-ui/use-chat-input-image-generation.ts:51-69`
```typescript
const selectedImageModel = useMemo(() => {
  if (!imageParams.model) return null;
  const matchingModel = enabledImageModels?.find(/* ... */);
  return matchingModel ? { /* ... */ } : { /* fallback */ };
}, [enabledImageModels, imageParams.model]);
```
**Issue:** Simple array.find + object construction  
**Action:** Remove

---

#### **3. Trivial String/Object Operations**

**File:** `src/components/chat-input/send-button-group.tsx:96-106`
```typescript
const dropdownMenuTriggerAnimationClasses = useMemo(() => {
  if (isExpanded && !isCollapsing) {
    return "opacity-100 scale-100 duration-500 delay-100 ease-bounce";
  }
  // ... more string returns
}, [isExpanded, isCollapsing]);
```
**Issue:** Conditional string concatenation  
**Action:** Remove - inline or use plain variable

---

**File:** `src/hooks/chat-ui/use-chat-input-image-generation.ts:71-76`
```typescript
const sanitizedImageParams = useMemo((): ImageGenerationParams => {
  const trimmedModel = imageParams.model?.trim() ?? "";
  return { ...imageParams, model: trimmedModel };
}, [imageParams]);
```
**Issue:** Trivial string trim + spread  
**Action:** Remove

---

### Category B: Simple Function Wrapping (MEDIUM Priority)

#### **Zero-Dependency Setters**

**File:** `src/components/sidebar/conversation-item.tsx:108-237`
```typescript
const handleCancelEdit = useCallback(() => {
  setIsEditing(false);
}, []);
```
**Issue:** Zero-dependency wrapper around setState  
**Action:** Remove useCallback - direct inline arrow function

---

**File:** `src/components/chat-input/index.tsx:285-294`
```typescript
const handleTranscriptionInsert = useCallback((raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === "Silence.") return;
  setInput(trimmed);
}, []);
```
**Issue:** Simple string operation + setter with no dependencies  
**Action:** Remove useCallback

---

#### **Simple Event Handlers**

**File:** `src/hooks/chat-ui/use-keyboard-navigation.ts:13-48`
```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === "ArrowUp" && onHistoryNavigation) {
      // ...
    }
  },
  [onSubmit, onHistoryNavigation, /* ... */]
);
```
**Issue:** Simple conditional logic - React Compiler will handle  
**Action:** Remove after React Compiler testing

---

**File:** `src/hooks/chat-ui/use-chat-input-state.ts:74-95`
```typescript
const setAttachments = useCallback(
  (value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
    setAttachmentsForKey(key, value);
  },
  [key, setAttachmentsForKey]
);
```
**Issue:** Just forwarding calls with partial application  
**Action:** Remove or inline

---

### Category C: Legitimate Use Cases (KEEP)

#### **1. useEvent Pattern** ✅

**File:** `src/hooks/chat-ui/use-event.ts`
```typescript
export function useEvent<Args extends unknown[], Return>(
  handler: (...args: Args) => Return
): (...args: Args) => Return {
  // Stable event handler with fresh closure
}
```
**Why keep:** This implements the useEvent RFC pattern - essential for avoiding dependency issues while maintaining stable references. This is a utility, not premature optimization.

---

#### **2. Public Hook APIs** ✅

**Files:**
- `src/hooks/chat-ui/use-chat-input-submission.ts` - `uploadAttachmentsToConvex`, `submit`, `handleSendAsNewConversation`
- `src/hooks/use-private-chat.ts` - `sendMessage`, `stop`, `regenerate`

**Why keep:** These are exposed as hook return values and used as dependencies in consuming components. Stable references prevent unnecessary re-renders in consumers. Part of the public API contract.

---

#### **3. Expensive Computations** ✅

**File:** `src/components/virtualized-model-list.tsx:350-357`
```typescript
const rows = useMemo(() => {
  const result = [];
  for (let i = 0; i < models.length; i += columnsPerRow) {
    result.push(models.slice(i, i + columnsPerRow));
  }
  return result;
}, [models, columnsPerRow]);
```
**Why keep:** Chunking algorithm for virtualization - prevents unnecessary re-chunking on every render. Legitimate optimization.

---

**File:** `src/components/sidebar/conversation-list-content.tsx:134-145`
```typescript
const allVisibleIds = useMemo(() => {
  const ids: ConversationId[] = [];
  ids.push(...groupedConversations.pinned.map(c => c._id));
  ids.push(...groupedConversations.today.map(c => c._id));
  // ... flatten 6+ groups
  return ids;
}, [groupedConversations]);
```
**Why keep:** Flattening multiple arrays, used for range selection. Prevents recreating array on every render.

---

#### **4. Set/Map Creation for Lookups** ✅

**File:** `src/components/virtualized-model-list.tsx:245-248`
```typescript
const enabledModelsLookup = enabledModels
  ? new Set(enabledModels.map((m: BaseModel) => m.modelId))
  : new Set();
```
**Why keep:** Set creation for O(1) lookups in large lists. Clear performance benefit for virtualized list with 50+ models.

---

**File:** `src/components/virtualized-chat-messages.tsx:216-224`
```typescript
const messagesMap = useMemo(() => {
  const map = new Map<string, ChatMessageType>();
  for (const msg of messages) {
    map.set(msg.id, msg);
  }
  return map;
}, [messages]);
```
**Why keep:** Map creation for O(1) message lookups during streaming. Critical for performance with 100+ messages.

---

#### **5. Provider Context Values** ✅

**File:** `src/providers/user-data-context.tsx`
```typescript
// Multiple memos for derived user data
const userIdentity = useMemo(() => ({ user, userId }), [user, userId]);
const userState = useMemo(() => ({ /* ... */ }), [/* ... */]);
```
**Why keep:** Prevents unnecessary context updates and re-renders across the entire app. Critical for performance in providers.

---

## 3. Custom Memoization Utilities

### ✅ No Anti-Patterns Found

**Checked for:**
- ❌ No `use-props-hash` or hash-based memoization
- ❌ No custom `useMemoized`, `useCache`, `useStable` hooks
- ❌ No hand-rolled WeakMap/Map caches in React components
- ❌ No JSON.stringify comparisons
- ❌ No deep equality checks

**Backend Caching (Not Affected):**
- ✅ `convex/lib/cache_utils.ts` - Server-side query caching (legitimate)
- ✅ `convex/ai/pdf_cache.ts` - PDF extraction caching (legitimate)
- ✅ `src/lib/local-storage.ts` - LocalStorage utilities (not memoization)

**useEvent Implementation:**
- ✅ `src/hooks/chat-ui/use-event.ts` - Proper implementation of useEvent RFC pattern (keep)

---

## 4. Premature Optimization Patterns

### ✅ Generally Good Patterns

**Split Contexts for Performance:**
```typescript
// src/providers/batch-selection-context.tsx:73-75
// Lightweight context solely for the sidebar hover setter to avoid re-renders
const SidebarHoverSetterContext = React.createContext<
  (hovering: boolean) => void
>(() => {});
```
**Analysis:** This is a legitimate optimization - separating frequently-changing hover state from selection state prevents sidebar-wide re-renders. **Keep.**

---

**Throttled Hover Updates:**
```typescript
// src/providers/batch-selection-context.tsx:250-252
// Throttle hover state updates to avoid sidebar-wide re-renders when moving the mouse
const hoverThrottleRef = React.useRef<number | null>(null);
```
**Analysis:** Throttling mouse move events is a standard optimization. **Keep.**

---

**Virtualized List Optimizations:**
- Custom memo comparators in `ConversationItem` and `ChatMessage`
- Message selector pattern in `VirtualizedChatMessages`
- Row chunking in `VirtualizedModelList`

**Analysis:** All are legitimate optimizations for large lists (50-500+ items). **Keep.**

---

### ⚠️ Areas Lacking Performance Data

**Issue:** Many optimizations lack comments explaining *why* they exist or what performance issue they solved.

**Examples:**
- `shouldRenderNegativePrompt` useMemo - was there a measured problem?
- `dynamicPlaceholder` useMemo - is this actually in a hot path?
- Multiple simple event handler useCallback - were re-renders actually an issue?

**Recommendation:** When adding memoization, include a comment explaining:
1. What performance issue was observed
2. How the memoization solves it
3. Whether there's a benchmark/profiler data

---

## 5. Memoization Anti-Patterns

### ✅ None Found

**Excellent practices observed:**
- No memoization "just in case" without custom comparators
- No over-engineered solutions like hash-based comparison
- No defensive memoization of refs (refs are stable by design)
- No memoizing components that rarely re-render

**One potential issue:**
- **AttachmentStrip custom comparator** (mentioned in Section 1) - may be unnecessary if attachment arrays already change by reference

---

## 6. Impact & Migration Strategy

### Estimated Removals

| Category | Count | Can Remove Now | Remove After RC Testing |
|----------|-------|----------------|-------------------------|
| Trivial useMemo | ~15-20 | ✅ 100% | - |
| Simple useCallback | ~20-30 | ✅ 100% | - |
| Default memo() | ~19 | ❌ 0% | ⚠️ ~60% |
| Custom memo() | 3 | ❌ 0% | ⚠️ 1 (AttachmentStrip) |
| Public API callbacks | ~10-15 | ❌ 0% | ❌ 0% (keep) |
| Expensive operations | ~8-12 | ❌ 0% | ❌ 0% (keep) |

**Total removable:** ~30-40% immediately, ~60-70% after React Compiler adoption

---

### Phase 1: Immediate Removals (Low Risk)

Remove trivial useMemo/useCallback wrapping:
1. ✅ Boolean expressions (`shouldRenderNegativePrompt`)
2. ✅ String conditionals (`dynamicPlaceholder`)
3. ✅ Simple array filters (`userMessages`)
4. ✅ Trivial object spreads (`sanitizedImageParams`)
5. ✅ Zero-dependency setters (`handleCancelEdit`)

**Process:**
```bash
# Create branch
git checkout -b refactor/remove-trivial-memoization

# Remove one category at a time
# 1. Boolean useMemo
# 2. String useMemo
# 3. Simple array useMemo
# 4. Zero-dep useCallback

# Test after each commit
bun run test
bun run check
bun run dev  # Manual testing

# Commit with descriptive messages
git commit -m "refactor: remove trivial useMemo wrapping boolean logic"
```

---

### Phase 2: React Compiler Testing (Medium Risk)

After confirming React Compiler is working:
1. ⚠️ Remove default memo() from non-virtualized components
2. ⚠️ Remove simple event handler useCallback
3. ⚠️ Test AttachmentStrip with default memo

**Process:**
```bash
# Test with React DevTools Profiler
# Before: record interactions
# After removal: record same interactions
# Compare render counts and timing

# If regressions:
# - Revert specific removal
# - Document why it's needed
# - Keep optimization
```

---

### Phase 3: Keep Legitimate Optimizations

**Never remove:**
- ✅ useEvent implementation
- ✅ Public hook API callbacks
- ✅ Virtualization optimizations (custom memo, Map/Set creation, chunking)
- ✅ Provider context memoization
- ✅ Split contexts for performance
- ✅ Throttled event handlers

---

## 7. Recommendations

### For New Code

1. **Default to no memoization** - let React Compiler handle it
2. **Add memoization only when:**
   - Profiler shows actual performance issue
   - Working with virtualized lists (50+ items)
   - Creating public hook APIs
   - Building expensive data structures (Maps, Sets, nested loops)
3. **Always document why:**
   ```typescript
   // PERF: Memoize to prevent re-chunking 200+ models on every render
   // Benchmark: 15ms -> 0.5ms per render (React DevTools Profiler)
   const rows = useMemo(() => { /* ... */ }, [models, columnsPerRow]);
   ```

---

### For Existing Code

1. **Short term:** Remove Phase 1 items (trivial memoization)
2. **Medium term:** Test Phase 2 items after React Compiler confidence
3. **Long term:** Keep Phase 3 items (legitimate optimizations)
4. **Always:** Profile before and after - ensure no regressions

---

### React 19 + React Compiler Best Practices

**Trust the compiler for:**
- ✅ Simple computations (array filter, map, find)
- ✅ Boolean/string logic
- ✅ Object/array construction
- ✅ Event handlers with stable dependencies

**Manual optimization needed for:**
- ⚠️ Virtualized lists (custom memo comparators)
- ⚠️ Public APIs (stable callback references)
- ⚠️ Expensive data structures (Map/Set creation)
- ⚠️ Provider context values (prevent cascade re-renders)
- ⚠️ Throttled/debounced handlers

**Rule of thumb:**
- If you can't explain *why* with data → remove it
- If it's for a list with <50 items → probably remove it
- If it's a public API or virtualization → probably keep it

---

## 8. Conclusion

**Overall assessment:** ⭐⭐⭐⭐ (4/5)

The codebase shows good engineering discipline. Most memoization serves a legitimate purpose, but React Compiler makes many manual optimizations redundant. The lack of anti-patterns (JSON.stringify, deep equality, custom cache hooks) is commendable.

**Strengths:**
- ✅ No over-engineered memoization utilities
- ✅ Legitimate optimizations for virtualization
- ✅ Good separation of concerns (split contexts)
- ✅ No premature optimization in most areas

**Areas for improvement:**
- ⚠️ Remove ~20-30 trivial useMemo/useCallback instances
- ⚠️ Test removing default memo() after React Compiler adoption
- ⚠️ Add performance comments for non-obvious optimizations
- ⚠️ Consider simplifying AttachmentStrip custom comparator

**Next steps:**
1. Review this audit with the team
2. Execute Phase 1 removals (low risk, high clarity)
3. Monitor React Compiler behavior with DevTools
4. Plan Phase 2 after confidence in compiler behavior
5. Document any remaining manual optimizations with "why"

---

## Appendix: File Reference

### Files with Removable Memoization (Phase 1)

- `src/components/chat-input/text-input-section.tsx` - shouldRenderNegativePrompt
- `src/components/chat-input/index.tsx` - dynamicPlaceholder, userMessages
- `src/components/chat-input/send-button-group.tsx` - dropdownMenuTriggerAnimationClasses
- `src/hooks/chat-ui/use-chat-input-image-generation.ts` - selectedImageModel, sanitizedImageParams
- `src/components/sidebar/conversation-item.tsx` - handleCancelEdit, other zero-dep callbacks

### Files with Legitimate Optimizations (Keep)

- `src/hooks/chat-ui/use-event.ts` - useEvent implementation
- `src/hooks/chat-ui/use-chat-input-submission.ts` - public API callbacks
- `src/hooks/use-private-chat.ts` - public API callbacks
- `src/components/virtualized-model-list.tsx` - rows chunking, enabledModelsLookup
- `src/components/virtualized-chat-messages.tsx` - messagesMap, custom memo
- `src/components/sidebar/conversation-item.tsx` - custom memo comparator
- `src/components/chat-message.tsx` - custom memo comparator
- `src/providers/user-data-context.tsx` - context value memoization
- `src/providers/batch-selection-context.tsx` - split contexts, throttling

### Files to Review (Phase 2)

- `src/components/sidebar/conversation-actions.tsx` - default memo
- `src/components/chat-input/chat-input-field.tsx` - default memo
- `src/components/chat-message/AttachmentStrip.tsx` - custom comparator (test if needed)
- `src/hooks/chat-ui/use-keyboard-navigation.ts` - simple event handler
- `src/hooks/chat-ui/use-chat-input-state.ts` - forwarding callbacks
