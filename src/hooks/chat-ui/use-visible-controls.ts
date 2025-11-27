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
  isAnonymous?: boolean;
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
  isAnonymous = false,
}: UseVisibleControlsProps): VisibleControls {
  const isImageMode = generationMode === "image";
  const isTextMode = generationMode === "text";

  // Text Mode Controls
  const showTextControls = canSend && isTextMode;

  // Image Mode Controls
  // Image generation requires Replicate API key and cannot be in private mode
  const canGenerateImages =
    canSend && isImageMode && !isPrivateMode && hasReplicateApiKey;

  // File Upload Controls
  // Show in text mode (for multimodal models) OR in image mode when model supports image input
  const showFileUpload =
    canSend && (isTextMode || (isImageMode && selectedImageModelSupportsInput));

  return {
    showModelPicker: showTextControls || canGenerateImages,
    showPersonaSelector: showTextControls,
    // Hide temperature picker for anonymous users (simplified experience)
    showTemperaturePicker: showTextControls && !isAnonymous,
    showReasoningPicker:
      showTextControls && !!selectedModel && isUserModel(selectedModel),
    showAspectRatioPicker: canGenerateImages,
    showImageSettings: canGenerateImages,
    showFileUpload,
  };
}
