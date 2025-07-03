/**
 * Chat submission strategy pattern implementation
 *
 * This hook manages different ways to submit chat messages:
 * - Direct forwarding to existing handlers (private/conversation)
 * - Creating new conversations (server-backed)
 * - Navigating to private chat with initial message
 * - Supporting conversation branching
 */

import { useCallback, useMemo } from "react";
import { useNavigate, type NavigateFunction } from "react-router";
import { useAction } from "convex/react";

import { useCreateConversation } from "@/hooks/use-conversations";
import {
  type CreateConversationParams,
  type Attachment,
  type ConversationId,
  type ReasoningConfig,
} from "@/types";
import { useUser } from "@/hooks/use-user";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { ROUTES } from "@/lib/routes";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

interface ChatSubmitStrategy {
  canSubmit(input: string, attachments: Attachment[]): boolean;
  submit(params: SubmitParams): Promise<void>;
  submitToNewConversation?(
    params: NewConversationParams
  ): Promise<ConversationId | undefined>;
}

interface SubmitParams {
  content: string;
  attachments?: Attachment[];
  useWebSearch?: boolean;
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
}

interface NewConversationParams extends SubmitParams {
  shouldNavigate: boolean;
  contextSummary?: string;
  sourceConversationId?: ConversationId;
}

// Base class with common functionality
abstract class BaseSubmitStrategy implements ChatSubmitStrategy {
  canSubmit(input: string, attachments: Attachment[]): boolean {
    return input.trim().length > 0 || attachments.length > 0;
  }

  abstract submit(params: SubmitParams): Promise<void>;
}

// Strategy for direct message forwarding (private mode or existing conversation)
class DirectMessageStrategy extends BaseSubmitStrategy {
  constructor(
    private onSendMessage: (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => void
  ) {
    super();
  }

  submit(params: SubmitParams): Promise<void> {
    this.onSendMessage(
      params.content,
      params.attachments,
      params.useWebSearch,
      params.personaId,
      params.reasoningConfig
    );
    return Promise.resolve();
  }
}

// Strategy for conversations that support branching
class ConversationWithBranchingStrategy extends DirectMessageStrategy {
  constructor(
    onSendMessage: (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => void,
    private onSendMessageToNewConversation: (
      content: string,
      shouldNavigate?: boolean,
      attachments?: Attachment[],
      contextSummary?: string,
      sourceConversationId?: ConversationId,
      personaPrompt?: string | null,
      personaId?: Id<"personas"> | null
    ) => Promise<ConversationId | undefined>
  ) {
    super(onSendMessage);
  }

  async submitToNewConversation(
    params: NewConversationParams
  ): Promise<ConversationId | undefined> {
    return await this.onSendMessageToNewConversation(
      params.content,
      params.shouldNavigate,
      params.attachments,
      params.contextSummary,
      params.sourceConversationId,
      null, // personaPrompt
      params.personaId
    );
  }
}

// Strategy for creating new conversations
class CreateConversationStrategy extends BaseSubmitStrategy {
  constructor(
    private createNewConversation: (
      params: CreateConversationParams
    ) => Promise<ConversationId>,
    private navigate: NavigateFunction,
    private userId?: Id<"users">
  ) {
    super();
  }

  async submit(params: SubmitParams): Promise<void> {
    const conversationId = await this.createNewConversation({
      firstMessage: params.content,
      personaId: params.personaId,
      userId: this.userId,
      attachments: params.attachments,
      useWebSearch: params.useWebSearch,
      generateTitle: true,
      reasoningConfig: params.reasoningConfig,
    });

    if (conversationId) {
      this.navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    }
  }
}

// Strategy for navigating to private chat with initial message
class NavigateToPrivateChatStrategy extends BaseSubmitStrategy {
  constructor(private navigate: NavigateFunction) {
    super();
  }

  submit(params: SubmitParams): Promise<void> {
    this.navigate(ROUTES.PRIVATE_CHAT, {
      state: {
        initialMessage: params.content,
        attachments: params.attachments,
        useWebSearch: params.useWebSearch,
        personaId: params.personaId,
        reasoningConfig: params.reasoningConfig,
      },
    });

    return Promise.resolve();
  }
}

interface UseChatSubmitOptions {
  conversationId?: ConversationId;
  onSendMessage?: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onSendMessageToNewConversation?: (
    content: string,
    shouldNavigate?: boolean,
    attachments?: Attachment[],
    contextSummary?: string,
    sourceConversationId?: ConversationId,
    personaPrompt?: string | null,
    personaId?: Id<"personas"> | null
  ) => Promise<ConversationId | undefined>;
  onAfterSubmit?: () => void;
}

/**
 * Hook for handling chat form submission with different strategies
 *
 * Strategy selection logic:
 * 1. If onSendMessage provided + branching support → ConversationWithBranchingStrategy
 * 2. If onSendMessage provided only → DirectMessageStrategy
 * 3. If private mode without handler → NavigateToPrivateChatStrategy
 * 4. Otherwise → CreateConversationStrategy
 */
export function useChatSubmit({
  conversationId,
  onSendMessage,
  onSendMessageToNewConversation,
  onAfterSubmit,
}: UseChatSubmitOptions) {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isPrivateMode } = usePrivateMode();
  const { createConversation } = useCreateConversation();
  const generateConversationSummary = useAction(
    api.conversationSummary.generateConversationSummary
  );

  // Memoize strategy creation to prevent recreation on every render
  const strategy = useMemo<ChatSubmitStrategy>(() => {
    if (onSendMessage) {
      // Either private mode or existing conversation
      if (conversationId && onSendMessageToNewConversation) {
        return new ConversationWithBranchingStrategy(
          onSendMessage,
          onSendMessageToNewConversation
        );
      } else {
        return new DirectMessageStrategy(onSendMessage);
      }
    } else if (isPrivateMode) {
      // In private mode without a handler - navigate to private chat page
      return new NavigateToPrivateChatStrategy(navigate);
    } else {
      // Regular mode - new conversation
      return new CreateConversationStrategy(
        createConversation,
        navigate,
        user?._id
      );
    }
  }, [
    onSendMessage,
    conversationId,
    onSendMessageToNewConversation,
    isPrivateMode,
    navigate,
    createConversation,
    user?._id,
  ]);

  const canSubmit = useCallback(
    (input: string, attachments: Attachment[]) => {
      return strategy.canSubmit(input, attachments);
    },
    [strategy]
  );

  const submit = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      useWebSearch?: boolean,
      personaId?: Id<"personas"> | null,
      reasoningConfig?: ReasoningConfig
    ) => {
      await strategy.submit({
        content,
        attachments,
        useWebSearch,
        personaId,
        reasoningConfig,
      });

      onAfterSubmit?.();
    },
    [strategy, onAfterSubmit]
  );

  const submitToNewConversation = useCallback(
    async (
      content: string,
      attachments: Attachment[],
      shouldNavigate: boolean
    ) => {
      if (!strategy.submitToNewConversation || !conversationId) {
        return;
      }

      // Generate conversation summary for context
      let contextSummary: string | undefined;
      try {
        contextSummary = await generateConversationSummary({
          conversationId: conversationId as Id<"conversations">,
          maxTokens: 150,
        });
      } catch (_error) {
        // Silently ignore summary generation errors
      }

      const result = await strategy.submitToNewConversation({
        content,
        attachments,
        shouldNavigate,
        contextSummary,
        sourceConversationId: conversationId as ConversationId,
        useWebSearch: false,
        personaId: null,
        reasoningConfig: undefined,
      });

      onAfterSubmit?.();

      return result;
    },
    [strategy, conversationId, generateConversationSummary, onAfterSubmit]
  );

  return {
    canSubmit,
    submit,
    submitToNewConversation,
  };
}
