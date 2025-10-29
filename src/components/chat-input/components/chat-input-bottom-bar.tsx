import type { Id } from "@convex/_generated/dataModel";
import { useCallback, useMemo } from "react";
import { useChatScopedState } from "@/hooks/use-chat-scoped-state";
import { useGenerationMode, useImageParams } from "@/hooks/use-generation";
import { useOnline } from "@/hooks/use-online";
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
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
import { SpeechInputButton } from "../speech-input-button";
import { useSpeechInputContext } from "../speech-input-context";
import { TemperatureDrawer } from "../temperature-drawer";

const TRANSITION_CLASS = "transform transition duration-200 ease-out";

type SpeechInputButtonSlotProps = {
  disabled: boolean;
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  waveform: number[];
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
  onSubmit: () => Promise<void>;
};

function SpeechInputButtonSlot({
  disabled,
  isSupported,
  isRecording,
  isTranscribing,
  waveform,
  onStart,
  onCancel,
  onSubmit,
}: SpeechInputButtonSlotProps) {
  if (!isSupported) {
    return <div className="h-8 w-[132px]" aria-hidden="true" />;
  }

  return (
    <SpeechInputButton
      disabled={disabled}
      isSupported
      isRecording={isRecording}
      isTranscribing={isTranscribing}
      waveform={waveform}
      onStart={onStart}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />
  );
}

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

  const speech = useSpeechInputContext();

  const isTranscribeMode = speech.isRecording || speech.isTranscribing;

  const speechButtonDisabled =
    !(canSend && online) || isLoading || isStreaming || isProcessing;

  return (
    <div className="relative">
      <div
        className={cn(
          "chat-input-bottom-bar flex items-center justify-between p-1.5",
          TRANSITION_CLASS,
          isTranscribeMode && "pointer-events-none opacity-0 translate-y-1"
        )}
        aria-hidden={isTranscribeMode}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {canSend && <ModelDrawer disabled={disabled} />}

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

          {canSend &&
            generationMode === "image" &&
            !isPrivateMode &&
            hasReplicateApiKey && (
              <>
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
          <SpeechInputButtonSlot
            disabled={speechButtonDisabled}
            isSupported={speech.isSupported}
            isRecording={speech.isRecording}
            isTranscribing={speech.isTranscribing}
            waveform={speech.waveform}
            onStart={speech.startRecording}
            onCancel={speech.cancelRecording}
            onSubmit={speech.acceptRecording}
          />
          {canSend && (
            <FileUploadButton
              disabled={disabled}
              isSubmitting={isProcessing}
              conversationId={conversationId}
            />
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
          />
        </div>
      </div>
      <div
        className={cn(
          "chat-input-bottom-bar pointer-events-none absolute inset-0 flex items-center justify-end p-1.5",
          TRANSITION_CLASS,
          isTranscribeMode
            ? "pointer-events-auto opacity-100 translate-y-0"
            : "opacity-0 translate-y-1"
        )}
        aria-hidden={!isTranscribeMode}
      >
        <div className="flex w-full justify-end">
          <SpeechInputButtonSlot
            disabled={speechButtonDisabled}
            isSupported={speech.isSupported}
            isRecording={speech.isRecording}
            isTranscribing={speech.isTranscribing}
            waveform={speech.waveform}
            onStart={speech.startRecording}
            onCancel={speech.cancelRecording}
            onSubmit={speech.acceptRecording}
          />
        </div>
      </div>
    </div>
  );
}
