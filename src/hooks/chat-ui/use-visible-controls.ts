import type { Doc } from "@convex/_generated/dataModel";
import { isUserModel } from "@/lib/type-guards";

type Model = Doc<"userModels"> | Doc<"builtInModels">;

interface UseVisibleControlsProps {
  generationMode: "text" | "image";
  isPrivateMode: boolean;
  hasReplicateApiKey: boolean;
  canSend: boolean;
  selectedModel?: Model | null;
}

interface VisibleControls {
  showModelPicker: boolean;
  showPersonaSelector: boolean;
  showTemperaturePicker: boolean;
  showReasoningPicker: boolean;
  showAspectRatioPicker: boolean;
  showImageSettings: boolean;
}

export function useVisibleControls({
  generationMode,
  isPrivateMode,
  hasReplicateApiKey,
  canSend,
  selectedModel,
}: UseVisibleControlsProps): VisibleControls {
  const isImageMode = generationMode === "image";
  const isTextMode = generationMode === "text";

  // Text Mode Controls
  const showTextControls = canSend && isTextMode;

  // Image Mode Controls
  // Image generation requires Replicate API key and cannot be in private mode
  const canGenerateImages =
    canSend && isImageMode && !isPrivateMode && hasReplicateApiKey;

  return {
    showModelPicker: showTextControls || canGenerateImages,
    showPersonaSelector: showTextControls,
    showTemperaturePicker: showTextControls,
    showReasoningPicker:
      showTextControls && !!selectedModel && isUserModel(selectedModel),
    showAspectRatioPicker: canGenerateImages,
    showImageSettings: canGenerateImages,
  };
}
