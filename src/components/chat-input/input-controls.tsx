import React, {
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PaperclipIcon } from "@phosphor-icons/react";
import { ModelPicker } from "@/components/model-picker";
import { PersonaPicker } from "@/components/persona-picker";
import { WebSearchToggle } from "@/components/web-search-toggle";
import { SendButtonGroup } from "./send-button-group";
import { AIModel } from "@/types";
import { Attachment } from "@/types";

import { Id } from "../../../convex/_generated/dataModel";
import { useUser } from "@/hooks/use-user";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";

interface InputControlsProps {
  canChat: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  selectedModel?: AIModel | null;
  currentModel?: AIModel;
  hasExistingMessages: boolean;
  conversationId?: string;
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
    personaId?: Id<"personas"> | null
  ) => void;
  onSendAsNewConversation?: (navigate: boolean) => void;
  onInputStart?: () => void;
}

export interface InputControlsRef {
  handleSubmit: () => void;
}

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
    // Internal state
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [selectedPersonaId, setSelectedPersonaId] =
      useState<Id<"personas"> | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // User settings for persona functionality
    const userInfo = useUser();
    const userSettings = useUserSettings(userInfo.user?._id);
    const personasEnabled = userSettings?.personasEnabled !== false;

    // Handle file input change
    const handleFileInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileUpload(e.target.files);
        e.target.value = "";
      },
      [handleFileUpload]
    );

    // Handle submit
    const handleSubmit = useCallback(() => {
      if (!input.trim() && attachments.length === 0) return;
      if (isLoading || !canChat) return;

      const messageContent = buildMessageContent(input);
      const binaryAttachments = getBinaryAttachments();

      onSendMessage(
        messageContent,
        binaryAttachments.length > 0 ? binaryAttachments : undefined,
        webSearchEnabled,
        selectedPersonaId
      );

      clearInput();
      clearAttachments();
      setWebSearchEnabled(false);

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
      webSearchEnabled,
      buildMessageContent,
      getBinaryAttachments,
      clearAttachments,
      clearInput,
      selectedPersonaId,
    ]);

    // Expose handleSubmit via ref
    useImperativeHandle(
      ref,
      () => ({
        handleSubmit,
      }),
      [handleSubmit]
    );

    const canSend = !!(
      (input.trim() || attachments.length > 0) &&
      !isLoading &&
      canChat
    );

    return (
      <>
        {/* Controls row */}
        <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/20 gap-2">
          {/* Left side controls - single line layout */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
            {/* Persona selector */}
            {canChat && personasEnabled && !conversationId && (
              <PersonaPicker
                compact
                selectedPersonaId={selectedPersonaId}
                onPersonaSelect={setSelectedPersonaId}
                tooltip={
                  <div className="text-xs">
                    <div className="font-medium mb-1">AI Personas</div>
                    <p>
                      Choose a specialized AI assistant with a unique
                      personality and expertise
                    </p>
                  </div>
                }
              />
            )}

            {/* Model selector - most prominent */}
            {canChat && <ModelPicker />}

            {/* Web search toggle */}
            {canChat &&
              selectedModel &&
              (selectedModel.provider === "openrouter" ||
                selectedModel.provider === "google") && (
                <WebSearchToggle
                  enabled={webSearchEnabled}
                  onToggle={setWebSearchEnabled}
                />
              )}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {canChat && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={cn(
                      "h-9 px-3 rounded-full",
                      "bg-accent/30 hover:bg-accent/50 dark:bg-accent/20 dark:hover:bg-accent/40",
                      "border border-border/50 hover:border-primary/30",
                      "transition-all duration-200",
                      "group flex items-center gap-1.5",
                      "hover:shadow-md dark:hover:shadow-lg",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    <PaperclipIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="hidden sm:inline text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      Attach
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    <div className="font-medium mb-1">
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
                      <div className="text-muted-foreground italic">
                        Select a model to see specific capabilities
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            <SendButtonGroup
              canSend={canSend}
              isStreaming={isStreaming}
              isLoading={isLoading}
              isSummarizing={false}
              hasExistingMessages={hasExistingMessages}
              conversationId={conversationId}
              onSend={handleSubmit}
              onStop={onStop}
              onSendAsNewConversation={onSendAsNewConversation}
              hasApiKeys={hasApiKeys}
              hasEnabledModels={hasEnabledModels}
            />
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.swift,.kt,.scala,.sh,.sql,.html,.css,.scss,.sass,.less,.vue,.svelte"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
      </>
    );
  }
);

InputControls.displayName = "InputControls";
