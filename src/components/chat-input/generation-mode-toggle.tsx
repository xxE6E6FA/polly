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

    const handleValueChange = (value: string) => {
      if (value !== "text" && value !== "image") {
        return;
      }
      if (value === "image" && (isPrivateMode || !hasReplicateApiKey)) {
        return;
      }
      if (value !== mode) {
        onModeChange(value);
      }
    };

    return (
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={handleValueChange}
        className={cn(
          "h-8 w-16 bg-primary/20 shadow-sm p-0.5",
          "dark:bg-primary/15",
          "rounded-full transition-all duration-200 hover:shadow-md",
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
          title={
            isPrivateMode
              ? "Image generation not available in private mode"
              : hasReplicateApiKey
                ? "Image Generation"
                : "Image generation requires a Replicate API key"
          }
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

GenerationModeToggle.displayName = "GenerationModeToggle";
