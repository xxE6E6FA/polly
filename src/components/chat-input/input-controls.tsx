import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { PaperclipIcon } from "@phosphor-icons/react";

import { ModelPicker } from "@/components/model-picker";
import { PersonaPicker } from "@/components/persona-picker";
import { ReasoningConfigSelect } from "@/components/reasoning-config-select";
import {
  type ReasoningConfig,
  type AIModel,
  type Attachment,
  type ConversationId,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-user";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";

import { SendButtonGroup } from "./send-button-group";
import { type Id } from "../../../convex/_generated/dataModel";

type InputControlsProps = {
  canChat: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  selectedModel?: AIModel | null;
  currentModel?: AIModel;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;

  onStop?: () => void;
  hasApiKeys?: boolean;
  hasEnabledModels?: boolean | null;
  // Data and actions from parent
  input: string;
  attachments: Attachment[];
  buildMessageContent: (input: string) => string;
  getBinaryAttachments: () => Attachment[];
  clearAttachments: () => void;
  clearInput: () => void;
  handleFileUpload: (files: FileList | null) => void;
  // Parent callbacks
  onSendMessage: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  onSendAsNewConversation?: (navigate: boolean) => void;
  onInputStart?: () => void;
};

export type InputControlsRef = {
  handleSubmit: () => void;
};

export const InputControls = forwardRef<InputControlsRef, InputControlsProps>(
  (
    {
      canChat,
      isLoading,
      isStreaming,
      selectedModel,
      currentModel,
      hasExistingMessages,
      conversationId,
      onStop,
      hasApiKeys,
      hasEnabledModels,
      input,
      attachments,
      buildMessageContent,
      getBinaryAttachments,
      clearAttachments,
      clearInput,
      handleFileUpload,
      onSendMessage,
      onSendAsNewConversation,
      onInputStart,
    },
    ref
  ) => {
    const [selectedPersonaId, setSelectedPersonaId] =
      useState<Id<"personas"> | null>(null);
    const [reasoningConfig, setReasoningConfig] = useState<ReasoningConfig>({
      enabled: false,
      effort: "medium",
    });
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const userInfo = useUser();
    const userSettings = useUserSettings(userInfo.user?._id);
    const personasEnabled = userSettings?.personasEnabled !== false;

    const handleFileInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileUpload(e.target.files);
        e.target.value = "";
      },
      [handleFileUpload]
    );

    const handleSubmit = useCallback(() => {
      if (!input.trim() && attachments.length === 0) {
        return;
      }
      if (isLoading || !canChat) {
        return;
      }

      const messageContent = buildMessageContent(input);
      const binaryAttachments = getBinaryAttachments();

      onSendMessage(
        messageContent,
        binaryAttachments.length > 0 ? binaryAttachments : undefined,
        undefined, // Always let AI decide (backend uses Gemini for intelligent detection)
        selectedPersonaId,
        reasoningConfig.enabled ? reasoningConfig : undefined
      );

      clearInput();
      clearAttachments();

      if (onInputStart && messageContent.trim()) {
        onInputStart();
      }
    }, [
      input,
      attachments,
      isLoading,
      canChat,
      onSendMessage,
      onInputStart,
      buildMessageContent,
      getBinaryAttachments,
      clearAttachments,
      clearInput,
      selectedPersonaId,
      reasoningConfig,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        handleSubmit,
      }),
      [handleSubmit]
    );

    const canSend = Boolean(
      (input.trim() || attachments.length > 0) && !isLoading && canChat
    );

    return (
      <>
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/20 pt-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            {canChat && personasEnabled && !conversationId && (
              <PersonaPicker
                compact
                selectedPersonaId={selectedPersonaId}
                tooltip={
                  <div className="text-xs">
                    <div className="mb-1 font-medium">AI Personas</div>
                    <p>
                      Choose a specialized AI assistant with a unique
                      personality and expertise
                    </p>
                  </div>
                }
                onPersonaSelect={setSelectedPersonaId}
              />
            )}

            {canChat && <ModelPicker />}

            {canChat && selectedModel && (
              <ReasoningConfigSelect
                model={selectedModel}
                config={reasoningConfig}
                onConfigChange={setReasoningConfig}
              />
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {canChat && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    disabled={isLoading}
                    size="sm"
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-9 px-3 rounded-full",
                      "bg-accent/30 hover:bg-accent/50 dark:bg-accent/20 dark:hover:bg-accent/40",
                      "border border-border/50 hover:border-primary/30",
                      "transition-all duration-200",
                      "group flex items-center gap-1.5",
                      "hover:shadow-md dark:hover:shadow-lg",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <PaperclipIcon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    <span className="hidden text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:inline">
                      Attach
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="mb-1 font-medium">
                      Supported file types:
                    </div>
                    <div>• Text files</div>
                    {currentModel?.supportsImages && (
                      <div>• Images (PNG, JPEG, GIF, WebP, HEIC)</div>
                    )}
                    {(currentModel?.provider === "openrouter" ||
                      (currentModel?.contextLength &&
                        currentModel.contextLength >= 100000)) && (
                      <div>• PDF documents</div>
                    )}
                    {!currentModel && (
                      <div className="italic text-muted-foreground">
                        Select a model to see specific capabilities
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            <SendButtonGroup
              canSend={canSend}
              conversationId={conversationId}
              hasApiKeys={hasApiKeys}
              hasEnabledModels={hasEnabledModels}
              hasExistingMessages={hasExistingMessages}
              isLoading={isLoading}
              isStreaming={isStreaming}
              isSummarizing={false}
              onSend={handleSubmit}
              onSendAsNewConversation={onSendAsNewConversation}
              onStop={onStop}
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          multiple
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.scala,.sh,.sql,.html,.css,.scss,.sass,.less,.vue,.svelte"
          className="hidden"
          type="file"
          onChange={handleFileInputChange}
        />
      </>
    );
  }
);

InputControls.displayName = "InputControls";
