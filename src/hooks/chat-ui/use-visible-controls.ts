import type { Doc } from "@convex/_generated/dataModel";
import { isUserModel } from "@/lib/type-guards";

type Model = Doc<"userModels"> | Doc<"builtInModels">;

interface UseVisibleControlsProps {
  generationMode: "text" | "image";
  isPrivateMode: boolean;
  hasReplicateApiKey: boolean;
  canSend: boolean;
  selectedModel?: Model | null;
  selectedImageModelSupportsInput?: boolean;
  selectedImageModelIsFree?: boolean;
  isAnonymous?: boolean;
  hideTemperaturePicker?: boolean;
}

interface VisibleControls {
  showModelPicker: boolean;
  showPersonaSelector: boolean;
  showTemperaturePicker: boolean;
  showReasoningPicker: boolean;
  showAspectRatioPicker: boolean;
  showImageSettings: boolean;
  showFileUpload: boolean;
}

export function useVisibleControls({
  generationMode,
  isPrivateMode,
  hasReplicateApiKey,
  canSend,
  selectedModel,
  selectedImageModelSupportsInput = false,
  selectedImageModelIsFree = false,
  isAnonymous = false,
  hideTemperaturePicker = false,
}: UseVisibleControlsProps): VisibleControls {
  const isImageMode = generationMode === "image";
  const isTextMode = generationMode === "text";

  // Text Mode Controls
  const showTextControls = canSend && isTextMode;

  // Image Mode Controls
  // Image generation requires either:
  // - User's own Replicate API key, OR
  // - A free/built-in image model (uses server-side key)
  // Cannot be in private mode (no server-side storage)
  const canGenerateImages =
    canSend &&
    isImageMode &&
    !isPrivateMode &&
    (hasReplicateApiKey || selectedImageModelIsFree);

  // File Upload Controls
  // Show in text mode (for multimodal models) OR in image mode when model supports image input
  const showFileUpload =
    canSend && (isTextMode || (isImageMode && selectedImageModelSupportsInput));

  return {
    showModelPicker: showTextControls || canGenerateImages,
    showPersonaSelector: showTextControls,
    // Hide temperature picker for anonymous users (simplified experience) or if user disabled it
    showTemperaturePicker:
      showTextControls && !isAnonymous && !hideTemperaturePicker,
    showReasoningPicker:
      showTextControls && !!selectedModel && isUserModel(selectedModel),
    showAspectRatioPicker: canGenerateImages,
    showImageSettings: canGenerateImages,
    showFileUpload,
  };
}
