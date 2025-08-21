import type { Doc } from "@convex/_generated/dataModel";
import { isUserModel } from "@/lib/type-guards";
import type { ConversationId } from "@/types";
import { ModelPicker } from "../../model-picker";
import { ReasoningPicker } from "../../reasoning-picker";
import { TemperaturePicker } from "../../temperature-picker";
import { AspectRatioDrawer } from "../aspect-ratio-drawer";
import { AspectRatioPicker } from "../aspect-ratio-picker";
import { useChatInputContext } from "../context/chat-input-context";
import { GenerationModeToggle } from "../generation-mode-toggle";
import { ImageGenerationSettings } from "../image-generation-settings";
import { ImageModelDrawer } from "../image-model-drawer";
import { ImageModelPicker } from "../image-model-picker";
import { ImageSettingsDrawer } from "../image-settings-drawer";
import { ModelDrawer } from "../model-drawer";
import { NegativePromptDrawer } from "../negative-prompt-drawer";
import { PersonaDrawer } from "../persona-drawer";
import { PersonaSelector } from "../persona-selector";
import { ReasoningDrawer } from "../reasoning-drawer";
import { TemperatureDrawer } from "../temperature-drawer";

interface ControlsSectionProps {
  canSend: boolean;
  disabled: boolean;
  conversationId?: ConversationId;
  hasExistingMessages: boolean;
  selectedModel: Doc<"userModels"> | null;
  hasReplicateApiKey: boolean;
  isPrivateMode: boolean;
  onSubmit: () => void;
}

export function ControlsSection({
  canSend,
  disabled,
  conversationId,
  hasExistingMessages,
  selectedModel,
  hasReplicateApiKey,
  isPrivateMode,
  onSubmit,
}: ControlsSectionProps) {
  const {
    selectedPersonaId,
    reasoningConfig,
    temperature,
    generationMode,
    imageParams,
    negativePromptEnabled,
    enabledImageModels,
    setSelectedPersonaId,
    setReasoningConfig,
    setTemperature,
    setGenerationMode,
    setImageParams,
    handleNegativePromptEnabledChange,
  } = useChatInputContext();

  if (!canSend) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
      {/* Generation Mode Toggle */}
      <GenerationModeToggle
        mode={generationMode}
        onModeChange={setGenerationMode}
        disabled={disabled}
        hasReplicateApiKey={hasReplicateApiKey}
      />

      {/* Mobile: Individual drawer controls for text */}
      {generationMode === "text" && (
        <>
          <PersonaDrawer
            conversationId={conversationId}
            hasExistingMessages={hasExistingMessages}
            selectedPersonaId={selectedPersonaId}
            onPersonaSelect={setSelectedPersonaId}
            disabled={disabled}
          />
          <ModelDrawer disabled={disabled} />
          <TemperatureDrawer
            temperature={temperature}
            onTemperatureChange={setTemperature}
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
      {generationMode === "image" && !isPrivateMode && hasReplicateApiKey && (
        <>
          <ImageModelDrawer
            model={imageParams.model || ""}
            onModelChange={model =>
              setImageParams(prev => ({ ...prev, model }))
            }
            enabledImageModels={enabledImageModels || []}
            disabled={disabled}
          />
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
            selectedModel={
              enabledImageModels?.find(m => m.modelId === imageParams.model)
                ? {
                    modelId: imageParams.model || "",
                    supportsMultipleImages:
                      enabledImageModels.find(
                        m => m.modelId === imageParams.model
                      )?.supportsMultipleImages ?? false,
                  }
                : undefined
            }
            disabled={disabled}
          />
          {enabledImageModels?.find(m => m.modelId === imageParams.model)
            ?.supportsNegativePrompt && (
            <NegativePromptDrawer
              enabled={negativePromptEnabled}
              value={imageParams.negativePrompt || ""}
              onEnabledChange={handleNegativePromptEnabledChange}
              onValueChange={(value: string) =>
                setImageParams(prev => ({ ...prev, negativePrompt: value }))
              }
              disabled={disabled}
              onSubmit={onSubmit}
            />
          )}
        </>
      )}

      {/* Desktop: Image generation controls */}
      {generationMode === "image" && !isPrivateMode && hasReplicateApiKey && (
        <div className="hidden sm:flex items-center gap-0.5 sm:gap-1">
          <ImageModelPicker
            model={imageParams.model || ""}
            onModelChange={model =>
              setImageParams(prev => ({ ...prev, model }))
            }
            enabledImageModels={enabledImageModels || []}
          />
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
            selectedModel={
              enabledImageModels?.find(m => m.modelId === imageParams.model)
                ? {
                    modelId: imageParams.model || "",
                    supportsMultipleImages:
                      enabledImageModels.find(
                        m => m.modelId === imageParams.model
                      )?.supportsMultipleImages ?? false,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Desktop: Text generation controls */}
      {generationMode === "text" && (
        <div className="hidden sm:flex items-center gap-0.5 sm:gap-1">
          <PersonaSelector
            conversationId={conversationId}
            hasExistingMessages={hasExistingMessages}
            selectedPersonaId={selectedPersonaId}
            onPersonaSelect={setSelectedPersonaId}
          />
          <ModelPicker />
          <TemperaturePicker
            temperature={temperature}
            onTemperatureChange={setTemperature}
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
  );
}
