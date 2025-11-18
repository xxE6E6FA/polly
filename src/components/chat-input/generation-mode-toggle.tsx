import { ChatTextIcon, ImageIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { GenerationMode } from "@/types";

interface GenerationModeToggleProps {
  mode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  disabled?: boolean;
  hasReplicateApiKey?: boolean;
  className?: string;
}

export const GenerationModeToggle = memo<GenerationModeToggleProps>(
  ({
    mode,
    onModeChange,
    disabled = false,
    hasReplicateApiKey = true,
    className = "",
  }) => {
    const { isPrivateMode } = usePrivateMode();
    const isImageModeDisabled =
      disabled || isPrivateMode || !hasReplicateApiKey;

    const handleValueChange = (value: string | readonly string[]) => {
      // Convert array to string if needed (for single mode)
      const stringValue = Array.isArray(value) ? value[0] : value;
      if (stringValue !== "text" && stringValue !== "image") {
        return;
      }
      if (stringValue === "image" && (isPrivateMode || !hasReplicateApiKey)) {
        return;
      }
      if (stringValue !== mode) {
        onModeChange(stringValue);
      }
    };

    return (
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={handleValueChange}
        className={cn(
          "h-8 w-16 bg-primary/20 shadow-sm p-0.5",
          "dark:bg-muted dark:ring-border",
          "chat-input-control transition-all duration-200 hover:shadow-md",
          "ring-1 ring-primary/25",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <ToggleGroupItem
          value="text"
          disabled={disabled}
          aria-pressed={mode === "text"}
          title="Text Generation"
        >
          <ChatTextIcon
            size={16}
            weight={mode === "text" ? "fill" : "regular"}
            className="h-4 w-4 text-current"
          />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="image"
          disabled={isImageModeDisabled}
          aria-pressed={mode === "image"}
          title={getImageGenerationTitle(isPrivateMode, hasReplicateApiKey)}
        >
          <ImageIcon
            size={16}
            weight={mode === "image" ? "fill" : "regular"}
            className="h-4 w-4 text-current"
          />
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }
);

function getImageGenerationTitle(
  isPrivateMode: boolean,
  hasReplicateApiKey: boolean
): string {
  if (isPrivateMode) {
    return "Image generation not available in private mode";
  }
  if (hasReplicateApiKey) {
    return "Image Generation";
  }
  return "Image generation requires a Replicate API key";
}

GenerationModeToggle.displayName = "GenerationModeToggle";
