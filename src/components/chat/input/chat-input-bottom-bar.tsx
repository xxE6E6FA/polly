import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
import { useVisibleControls } from "@/hooks/chat-ui/use-visible-controls";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useLastGeneratedImageSeed } from "@/hooks/use-last-generated-image-seed";
import { useOnline } from "@/hooks/use-online";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isUserModel } from "@/lib/type-guards";
import { useUserDataContext } from "@/providers/user-data-context";
import { useChatFullscreenUI } from "@/stores/chat-ui-store";
// Fullscreen overlay toggle is handled inside the input section now
import type { ConversationId, ReasoningConfig } from "@/types";
import { FileLibraryButton } from "./file-library-button";
import { FileUploadButton } from "./file-upload-button";
import { PersonaSelector } from "./persona-selector";
import { AspectRatioPicker } from "./pickers/aspect-ratio-picker";
import { ImageGenerationSettings } from "./pickers/image-generation-settings";
import { ModelPicker } from "./pickers/model-picker";
import { ReasoningPicker } from "./pickers/reasoning-picker";
import { TemperaturePicker } from "./pickers/temperature-picker";
import { SendButtonGroup } from "./send-button-group";
import { useSpeechInputContext } from "./speech-input-context";

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
    supportsImageToImage?: boolean;
    supportsImages?: boolean;
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
  const { user } = useUserDataContext();
  const userSettings = useUserSettings();
  const online = useOnline();
  const speech = useSpeechInputContext();
  const isRecordingOrTranscribing = speech.isRecording || speech.isTranscribing;
  const disabled =
    isLoading || isProcessing || !online || isRecordingOrTranscribing;
  const [reasoningConfig, setReasoningConfig] = useReasoningConfig();
  const { selectedPersonaId, temperature } = useChatScopedState(conversationId);
  const lastGeneratedImageSeed = useLastGeneratedImageSeed(conversationId);
  const [generationMode] = useGenerationMode();
  const { params: imageParams, setParams: setImageParams } = useImageParams();
  const { clearOnSend } = useChatFullscreenUI();
  // Simple object creation - React Compiler will optimize if needed
  const normalizedSelectedImageModel = selectedImageModel
    ? {
        modelId: selectedImageModel.modelId,
        supportsMultipleImages:
          selectedImageModel.supportsMultipleImages ?? false,
      }
    : undefined;

  const {
    showModelPicker,
    showPersonaSelector,
    showTemperaturePicker,
    showReasoningPicker,
    showAspectRatioPicker,
    showImageSettings,
    showFileUpload,
  } = useVisibleControls({
    generationMode,
    isPrivateMode,
    hasReplicateApiKey,
    canSend,
    selectedModel,
    selectedImageModelSupportsInput: selectedImageModel?.supportsImageToImage,
    isAnonymous: user?.isAnonymous,
    hideTemperaturePicker: userSettings?.showTemperaturePicker === false,
  });

  // Determine which model to use for file upload/library checks
  // If in image mode, use the selected image model (with fresh schema capabilities)
  // If in text mode, use the selected LLM
  const activeModel =
    generationMode === "image" ? selectedImageModel : selectedModel;

  const handlePersonaSelect = useCallback(
    async (id: Id<"personas"> | null) => {
      const { setPersona } = await import(
        "@/stores/actions/chat-input-actions"
      );
      setPersona(conversationId, id);
    },
    [conversationId]
  );

  const handleTemperatureChange = useCallback(
    async (value: number | undefined) => {
      const { setTemperature } = await import(
        "@/stores/actions/chat-input-actions"
      );
      setTemperature(conversationId, value);
    },
    [conversationId]
  );

  return (
    <div className="relative">
      <div className="chat-input-bottom-bar flex items-center justify-between p-1">
        <div className="flex min-w-0 flex-1 items-center">
          {showAspectRatioPicker && (
            <div className="flex items-center gap-1 sm:gap-2">
              {showModelPicker && <ModelPicker disabled={disabled} />}
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
                disabled={disabled}
              />
              {showImageSettings && (
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
                  lastGeneratedImageSeed={lastGeneratedImageSeed}
                  disabled={disabled}
                />
              )}
            </div>
          )}

          {generationMode === "text" && (
            <div className="flex items-center gap-1 sm:gap-2">
              {showModelPicker && <ModelPicker disabled={disabled} />}

              {showPersonaSelector && (
                <PersonaSelector
                  conversationId={conversationId}
                  hasExistingMessages={hasExistingMessages}
                  selectedPersonaId={selectedPersonaId}
                  onPersonaSelect={handlePersonaSelect}
                  disabled={disabled}
                />
              )}

              {showTemperaturePicker && (
                <TemperaturePicker
                  temperature={temperature}
                  onTemperatureChange={handleTemperatureChange}
                  disabled={disabled}
                />
              )}

              {showReasoningPicker &&
                selectedModel &&
                isUserModel(selectedModel) && (
                  <ReasoningPicker
                    model={selectedModel}
                    config={reasoningConfig}
                    onConfigChange={setReasoningConfig}
                    disabled={disabled}
                  />
                )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 sm:gap-2">
          {showFileUpload && (
            <>
              <FileUploadButton
                disabled={disabled}
                isSubmitting={isProcessing}
                conversationId={conversationId}
                selectedModel={activeModel ?? undefined}
              />
              <FileLibraryButton
                disabled={disabled}
                isSubmitting={isProcessing}
                conversationId={conversationId}
                selectedModel={activeModel ?? undefined}
              />
            </>
          )}
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
            isSupported={speech.isSupported}
            isRecording={speech.isRecording}
            isTranscribing={speech.isTranscribing}
            waveform={speech.waveform}
            onStartTranscribe={speech.startRecording}
            onCancelTranscribe={speech.cancelRecording}
            onAcceptTranscribe={speech.acceptRecording}
          />
        </div>
      </div>
    </div>
  );
}
