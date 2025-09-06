import type { Id } from "@convex/_generated/dataModel";
import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useChatAttachments } from "@/hooks/use-chat-attachments";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useNotificationDialog } from "@/hooks/use-dialog-management";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { useReplicateApiKey } from "@/hooks/use-replicate-api-key";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUI } from "@/providers/ui-provider";
import { useUserDataContext } from "@/providers/user-data-context";
import { useChatHistory } from "@/stores/chat-ui-store";
import type {
  Attachment,
  ChatMessage,
  ConversationId,
  ReasoningConfig,
} from "@/types";
import { ChatInputBottomBar } from "./components/chat-input-bottom-bar";
import { ChatInputContainer } from "./components/chat-input-container";
import {
  useChatInputDragDrop,
  useChatInputImageGeneration,
  useChatInputSubmission,
} from "./hooks";
import { TextInputSection } from "./sections/text-input-section";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => void;
  onSendAsNewConversation?: (
    content: string,
    shouldNavigate: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    temperature?: number
  ) => Promise<ConversationId | undefined>;
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  onTemperatureChange?: (temperature: number | undefined) => void;
  messages?: ChatMessage[];
  userMessageContents?: string[];
  autoFocus?: boolean;
  conversationPersonaId?: Id<"personas"> | null;
}

export type ChatInputRef = {
  focus: () => void;
  addQuote: (quote: string) => void;
  setInput: (text: string) => void;
  getCurrentReasoningConfig: () => ReasoningConfig;
};

const getNewQuotedValue = (currentValue: string, quote: string) => {
  return currentValue ? `${currentValue}\n\n${quote}\n\n` : `${quote}\n\n`;
};

const ChatInputInner = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      onSendMessage,
      onSendAsNewConversation,
      conversationId,
      hasExistingMessages = false,
      isLoading = false,
      isStreaming = false,
      onStop,
      placeholder = "Ask anything...",
      messages,
      userMessageContents,
      autoFocus = false,
    },
    ref
  ) => {
    const { canSendMessage } = useUserDataContext();
    const { hasReplicateApiKey } = useReplicateApiKey();
    const { isPrivateMode } = usePrivateMode();
    const { attachments, setAttachments, clearAttachments } =
      useChatAttachments(conversationId);
    const { selectedPersonaId, temperature } =
      useChatScopedState(conversationId);
    const [input, setInput] = useState<string>("");
    // clearAttachments already extracted from hook above
    const [reasoningConfig] = useReasoningConfig();
    const [generationMode, setGenerationMode] = useGenerationMode();
    const { params: imageParams } = useImageParams();

    const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const drawerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [selectedModel] = useSelectedModel();
    const notificationDialog = useNotificationDialog();
    const { isMobile } = useUI();
    const [isComposeDrawerOpen, setComposeDrawerOpen] = useState(false);
    // Focus drawer textarea on open for seamless typing
    useEffect(() => {
      if (isMobile && isComposeDrawerOpen) {
        setTimeout(() => drawerTextareaRef.current?.focus(), 0);
      }
    }, [isMobile, isComposeDrawerOpen]);

    // Use the new image generation hook
    const {
      selectedImageModel,
      handleImageGenerationSubmit,
      handleSendAsNewConversation: handleImageGenerationSendAsNew,
    } = useChatInputImageGeneration({
      conversationId,
      selectedPersonaId,
      input,
      imageParams,
      generationMode,
      onResetInputState: () => {
        setInput("");
        setAttachments([]);
      },
    });

    // Use the new submission hook
    const { isProcessing, submit, handleSendAsNewConversation } =
      useChatInputSubmission({
        conversationId,
        selectedPersonaId,
        temperature,
        onSendMessage,
        onSendAsNewConversation,
        handleImageGenerationSubmit,
        handleImageGenerationSendAsNew,
        onResetInputState: () => {
          setInput("");
          setAttachments([]);
        },
      });

    // Use the new drag and drop hook
    const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
      useChatInputDragDrop({
        canSend: canSendMessage,
        isLoading,
        isStreaming,
        onProcessFiles: async (files: FileList) => {
          const { processFilesForAttachments } = await import(
            "@/lib/process-files"
          );
          const newAttachments = await processFilesForAttachments(
            files,
            selectedModel,
            args =>
              notificationDialog.notify({
                ...args,
                description: args.description || "",
              })
          );
          if (newAttachments.length > 0) {
            const { appendAttachments } = await import(
              "@/stores/actions/chat-input-actions"
            );
            appendAttachments(conversationId, newAttachments);
          }
        },
      });

    // Handle private mode and replicate API key restrictions
    useEffect(() => {
      if (
        (isPrivateMode || !hasReplicateApiKey) &&
        generationMode === "image"
      ) {
        setGenerationMode("text");
      }
    }, [isPrivateMode, hasReplicateApiKey, generationMode, setGenerationMode]);

    // Get user messages for history navigation
    const userMessages = useMemo(() => {
      if (userMessageContents) {
        return userMessageContents;
      }

      const sourceMessages = messages || [];
      if (!sourceMessages || sourceMessages.length === 0) {
        return [];
      }

      const userMessages: string[] = [];
      for (let i = sourceMessages.length - 1; i >= 0; i--) {
        const msg = sourceMessages[i];
        if (msg.role === "user") {
          userMessages.push(msg.content);
        }
      }

      return userMessages;
    }, [userMessageContents, messages]);

    // Hydrate history from existing user messages on revisit (once per conversation)
    const history = useChatHistory(conversationId);
    const lastHydratedIdRef = useRef<ConversationId>(null);
    const lastHydratedCountRef = useRef<number>(0);
    useEffect(() => {
      if (!(conversationId && hasExistingMessages)) {
        return;
      }
      const count = userMessages?.length ?? 0;
      if (count === 0) {
        return;
      }
      // Avoid infinite loops by hydrating only when conversation changes or count changes
      if (
        lastHydratedIdRef.current === conversationId &&
        lastHydratedCountRef.current === count
      ) {
        return;
      }
      history.clear();
      for (const msg of [...userMessages].reverse()) {
        const t = msg.trim();
        if (t.length > 0) {
          history.push(t);
        }
      }
      history.resetIndex();
      lastHydratedIdRef.current = conversationId;
      lastHydratedCountRef.current = count;
    }, [
      conversationId,
      hasExistingMessages,
      userMessages,
      history.clear,
      history.push,
      history.resetIndex,
    ]);

    // Handle submission
    const handleSubmit = useCallback(async () => {
      const trimmed = input.trim();
      await submit(trimmed, [...attachments], generationMode);
      if (trimmed.length > 0) {
        history.push(trimmed);
        history.resetIndex();
      }
      // On successful submit, clear local and attachments
      setInput("");
      clearAttachments();
      // Close mobile compose drawer after sending
      if (isMobile && isComposeDrawerOpen) {
        setComposeDrawerOpen(false);
      }
    }, [
      submit,
      input,
      attachments,
      generationMode,
      clearAttachments,
      history,
      isMobile,
      isComposeDrawerOpen,
    ]);

    // Handle send as new conversation
    const handleSendAsNew = useCallback(
      async (
        shouldNavigate = true,
        personaId?: Id<"personas"> | null,
        customReasoningConfig?: ReasoningConfig
      ) => {
        await handleSendAsNewConversation(
          input,
          [...attachments],
          shouldNavigate,
          personaId,
          customReasoningConfig
        );
        // After sending as new, clear local input and attachments
        setInput("");
        clearAttachments();
      },
      [handleSendAsNewConversation, input, attachments, clearAttachments]
    );

    // Determine dynamic placeholder based on generation mode
    const dynamicPlaceholder = useMemo(() => {
      if (generationMode === "image") {
        return "Describe your image...";
      }
      return placeholder;
    }, [generationMode, placeholder]);

    // Determine chat input state class
    const chatInputStateClass = useMemo(() => {
      if (!canSendMessage) {
        return "chat-input-disabled";
      }
      if (isPrivateMode) {
        return "chat-input-private";
      }
      return "chat-input-enabled";
    }, [canSendMessage, isPrivateMode]);

    const immediateHasText = input.trim().length > 0 || attachments.length > 0;
    const deferredInputHasText = useDeferredValue(immediateHasText);

    // Show expand/fullscreen only when there's input and > 3 visual lines
    const [inlineShowExpand, setInlineShowExpand] = useState(false);
    const [drawerShowExpand, setDrawerShowExpand] = useState(false);

    const measureShouldShowExpand = useCallback(
      (el: HTMLTextAreaElement | null, value: string) => {
        if (!el) {
          return false;
        }
        if (value.trim().length === 0) {
          return false;
        }
        const style = window.getComputedStyle(el);
        const lh = parseFloat(style.lineHeight || "0");
        if (lh > 0) {
          const rows = Math.round(el.scrollHeight / lh);
          return rows > 3;
        }
        const rough = (value.match(/\n/g)?.length || 0) + 1;
        return rough > 3;
      },
      []
    );

    useLayoutEffect(() => {
      setInlineShowExpand(
        measureShouldShowExpand(inlineTextareaRef.current, input)
      );
    }, [input, measureShouldShowExpand]);

    useLayoutEffect(() => {
      setDrawerShowExpand(
        measureShouldShowExpand(drawerTextareaRef.current, input)
      );
    }, [input, measureShouldShowExpand]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const target =
            isMobile && isComposeDrawerOpen
              ? drawerTextareaRef.current
              : inlineTextareaRef.current;
          target?.focus();
        },
        addQuote: (quote: string) => {
          const target =
            isMobile && isComposeDrawerOpen
              ? drawerTextareaRef.current
              : inlineTextareaRef.current;
          const currentValue = target?.value.trim() || "";
          const newValue = getNewQuotedValue(currentValue, quote);
          setInput(newValue);
          setTimeout(() => target?.focus(), 0);
        },
        setInput,
        getCurrentReasoningConfig: () => reasoningConfig,
      }),
      [reasoningConfig, isMobile, isComposeDrawerOpen]
    );

    return (
      <>
        <div
          className={
            isMobile && isComposeDrawerOpen
              ? "invisible pointer-events-none"
              : undefined
          }
        >
          <ChatInputContainer
            className={chatInputStateClass}
            isDragOver={isDragOver}
            canSend={canSendMessage}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <TextInputSection
              onSubmit={handleSubmit}
              textareaRef={inlineTextareaRef}
              placeholder={selectedPersonaId ? "" : dynamicPlaceholder}
              disabled={
                isLoading || isStreaming || isProcessing || !canSendMessage
              }
              autoFocus={autoFocus}
              value={input}
              onValueChange={setInput}
              hasExistingMessages={hasExistingMessages}
              conversationId={conversationId}
              canSend={canSendMessage}
              generationMode={generationMode}
              hasReplicateApiKey={hasReplicateApiKey}
              selectedImageModel={selectedImageModel}
              onMobileFullscreenToggle={() => setComposeDrawerOpen(true)}
              hideExpandToggle={isMobile && isComposeDrawerOpen}
              disableAutoResize={isMobile && isComposeDrawerOpen}
              textareaClassNameOverride={
                isMobile && isComposeDrawerOpen ? "h-11 max-h-11" : undefined
              }
              showExpandToggle={inlineShowExpand}
            />

            <ChatInputBottomBar
              canSend={canSendMessage}
              isStreaming={isStreaming}
              isLoading={isLoading}
              isProcessing={isProcessing}
              hasExistingMessages={
                isMobile && isComposeDrawerOpen ? false : hasExistingMessages
              }
              conversationId={conversationId}
              hasInputText={
                isMobile && isComposeDrawerOpen ? false : deferredInputHasText
              }
              onSend={handleSubmit}
              onStop={onStop}
              onSendAsNewConversation={handleSendAsNew}
              hasReplicateApiKey={hasReplicateApiKey}
              isPrivateMode={isPrivateMode}
              onSubmit={handleSubmit}
              compact={isMobile && isComposeDrawerOpen}
            />
          </ChatInputContainer>
        </div>

        {/* Mobile Fullscreen Drawer */}
        <Drawer
          shouldScaleBackground={false}
          open={isMobile && isComposeDrawerOpen}
          onOpenChange={open => setComposeDrawerOpen(open)}
        >
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Compose message</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="stack-md">
              <TextInputSection
                onSubmit={handleSubmit}
                textareaRef={drawerTextareaRef}
                placeholder={selectedPersonaId ? "" : dynamicPlaceholder}
                disabled={
                  isLoading || isStreaming || isProcessing || !canSendMessage
                }
                autoFocus={autoFocus}
                value={input}
                onValueChange={setInput}
                hasExistingMessages={hasExistingMessages}
                conversationId={conversationId}
                canSend={canSendMessage}
                generationMode={generationMode}
                hasReplicateApiKey={hasReplicateApiKey}
                selectedImageModel={selectedImageModel}
                textareaClassNameOverride="h-[68svh] max-h-[68svh]"
                hideExpandToggle
                disableAutoResize
                showExpandToggle={drawerShowExpand}
              />
            </DrawerBody>
            <DrawerFooter
              className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-2 pt-3 gap-1"
              style={{
                paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
              }}
            >
              <ChatInputBottomBar
                canSend={canSendMessage}
                isStreaming={isStreaming}
                isLoading={isLoading}
                isProcessing={isProcessing}
                hasExistingMessages={hasExistingMessages}
                conversationId={conversationId}
                hasInputText={immediateHasText}
                onSend={handleSubmit}
                onStop={onStop}
                onSendAsNewConversation={handleSendAsNew}
                hasReplicateApiKey={hasReplicateApiKey}
                isPrivateMode={isPrivateMode}
                onSubmit={handleSubmit}
                compact
                dense
              />
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
);

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (props, ref) => {
    const { user } = useUserDataContext();

    if (user === undefined) {
      return null;
    }

    return <ChatInputInner {...props} ref={ref} />;
  }
);

ChatInput.displayName = "ChatInput";
