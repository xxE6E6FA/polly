import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useOnline } from "@/hooks/use-online";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { isUserModel } from "@/lib/type-guards";
import {
  setPersona as setPersonaAction,
  setTemperature as setTemperatureAction,
} from "@/stores/actions/chat-input-actions";
import { useChatFullscreenUI } from "@/stores/chat-ui-store";
// Fullscreen overlay toggle is handled inside the input section now
import type { ConversationId, ReasoningConfig } from "@/types";
import { ModelPicker } from "../../model-picker";
import { ReasoningPicker } from "../../reasoning-picker";
import { TemperaturePicker } from "../../temperature-picker";
import { AspectRatioDrawer } from "../aspect-ratio-drawer";
import { AspectRatioPicker } from "../aspect-ratio-picker";
import { FileUploadButton } from "../file-upload-button";
import { ImageGenerationSettings } from "../image-generation-settings";
import { ImageSettingsDrawer } from "../image-settings-drawer";
import { ModelDrawer } from "../model-drawer";
import { PersonaDrawer } from "../persona-drawer";
import { PersonaSelector } from "../persona-selector";
import { ReasoningDrawer } from "../reasoning-drawer";
import { SendButtonGroup } from "../send-button-group";
import { TemperatureDrawer } from "../temperature-drawer";

interface ChatInputBottomBarProps {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  hasInputText: boolean;

  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (
    shouldNavigate?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  hasReplicateApiKey: boolean;
  isPrivateMode: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null;
}

export function ChatInputBottomBar({
  canSend,
  isStreaming,
  isLoading,
  isProcessing,
  hasExistingMessages,
  conversationId,
  hasInputText,
  onSend,
  onStop,
  onSendAsNewConversation,
  hasReplicateApiKey,
  isPrivateMode,
  selectedImageModel,
}: ChatInputBottomBarProps) {
  const [selectedModel] = useSelectedModel();
  const online = useOnline();
  const disabled = isLoading || isStreaming || isProcessing || !online;
  const [reasoningConfig, setReasoningConfig] = useReasoningConfig();
  const { selectedPersonaId, temperature } = useChatScopedState(conversationId);
  const [generationMode] = useGenerationMode();
  const { params: imageParams, setParams: setImageParams } = useImageParams();
  const { clearOnSend } = useChatFullscreenUI();
  const normalizedSelectedImageModel = useMemo(() => {
    if (!selectedImageModel) {
      return undefined;
    }

    return {
      modelId: selectedImageModel.modelId,
      supportsMultipleImages:
        selectedImageModel.supportsMultipleImages ?? false,
    };
  }, [selectedImageModel]);

  const handlePersonaSelect = useCallback(
    (id: Id<"personas"> | null) => setPersonaAction(conversationId, id),
    [conversationId]
  );

  const handleTemperatureChange = useCallback(
    (value: number | undefined) => setTemperatureAction(conversationId, value),
    [conversationId]
  );

  return (
    <div className="chat-input-bottom-bar flex items-center justify-between p-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* Unified model picker first: mobile drawer trigger */}
        {canSend && <ModelDrawer disabled={disabled} />}

        {/* Mobile: Individual drawer controls for text */}
        {canSend && generationMode === "text" && (
          <>
            <PersonaDrawer
              conversationId={conversationId}
              hasExistingMessages={hasExistingMessages}
              selectedPersonaId={selectedPersonaId}
              onPersonaSelect={handlePersonaSelect}
              disabled={disabled}
            />
            <TemperatureDrawer
              temperature={temperature}
              onTemperatureChange={handleTemperatureChange}
              disabled={disabled}
            />
            {selectedModel &&
              isUserModel(selectedModel) &&
              selectedModel.supportsReasoning && (
                <ReasoningDrawer
                  model={selectedModel}
                  config={reasoningConfig}
                  onConfigChange={setReasoningConfig}
                  disabled={disabled}
                />
              )}
          </>
        )}

        {/* Mobile: Image generation drawer controls */}
        {canSend &&
          generationMode === "image" &&
          !isPrivateMode &&
          hasReplicateApiKey && (
            <>
              {/* Model selection handled by unified ModelDrawer above */}
              <AspectRatioDrawer
                aspectRatio={imageParams.aspectRatio || "1:1"}
                onAspectRatioChange={aspectRatio =>
                  setImageParams(prev => ({
                    ...prev,
                    aspectRatio: aspectRatio as
                      | "1:1"
                      | "16:9"
                      | "9:16"
                      | "4:3"
                      | "3:4",
                  }))
                }
                disabled={disabled}
              />
              <ImageSettingsDrawer
                params={{
                  ...imageParams,
                  prompt: "",
                  model: imageParams.model || "",
                  aspectRatio: imageParams.aspectRatio as
                    | "1:1"
                    | "16:9"
                    | "9:16"
                    | "4:3"
                    | "3:4"
                    | undefined,
                }}
                onParamsChange={updates =>
                  setImageParams(prev => ({ ...prev, ...updates }))
                }
                selectedModel={normalizedSelectedImageModel}
                disabled={disabled}
              />
            </>
          )}

        {/* Desktop: Image generation controls */}
        {canSend &&
          generationMode === "image" &&
          !isPrivateMode &&
          hasReplicateApiKey && (
            <div className="hidden sm:flex items-center gap-1 sm:gap-3">
              <ModelPicker />
              <AspectRatioPicker
                aspectRatio={imageParams.aspectRatio}
                onAspectRatioChange={aspectRatio =>
                  setImageParams(prev => ({
                    ...prev,
                    aspectRatio: aspectRatio as
                      | "1:1"
                      | "16:9"
                      | "9:16"
                      | "4:3"
                      | "3:4",
                  }))
                }
              />
              <ImageGenerationSettings
                params={{
                  ...imageParams,
                  prompt: "",
                  model: imageParams.model || "",
                  aspectRatio: imageParams.aspectRatio as
                    | "1:1"
                    | "16:9"
                    | "9:16"
                    | "4:3"
                    | "3:4"
                    | undefined,
                }}
                onParamsChange={updates =>
                  setImageParams(prev => ({ ...prev, ...updates }))
                }
                selectedModel={normalizedSelectedImageModel}
              />
            </div>
          )}

        {/* Desktop: Text generation controls */}
        {canSend && generationMode === "text" && (
          <div className="hidden sm:flex items-center gap-1 sm:gap-3">
            <ModelPicker />
            <PersonaSelector
              conversationId={conversationId}
              hasExistingMessages={hasExistingMessages}
              selectedPersonaId={selectedPersonaId}
              onPersonaSelect={handlePersonaSelect}
            />
            <TemperaturePicker
              temperature={temperature}
              onTemperatureChange={handleTemperatureChange}
              disabled={disabled}
            />
            {selectedModel && isUserModel(selectedModel) ? (
              <ReasoningPicker
                model={selectedModel}
                config={reasoningConfig}
                onConfigChange={setReasoningConfig}
              />
            ) : null}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-3">
        {canSend && (
          <FileUploadButton
            disabled={disabled}
            isSubmitting={isProcessing}
            conversationId={conversationId}
          />
        )}
        {/* Desktop fullscreen toggle: integrates with bottom bar */}
        {/* Desktop fullscreen toggle removed to match Gemini: use top-right overlay */}
        <SendButtonGroup
          canSend={canSend}
          isStreaming={Boolean(isStreaming)}
          isLoading={Boolean(isLoading || isProcessing)}
          isSummarizing={false}
          hasExistingMessages={Boolean(hasExistingMessages)}
          conversationId={conversationId}
          hasInputText={hasInputText}
          onSend={() => {
            clearOnSend?.();
            onSend();
          }}
          onStop={onStop}
          onSendAsNewConversation={async (
            shouldNavigate?: boolean,
            personaId?: Id<"personas"> | null
          ) => {
            clearOnSend?.();
            await onSendAsNewConversation?.(shouldNavigate, personaId);
          }}
          personaId={selectedPersonaId}
        />
      </div>
    </div>
  );
}
