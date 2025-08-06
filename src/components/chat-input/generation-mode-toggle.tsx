import { ChatText, Image } from "@phosphor-icons/react";
import { memo } from "react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";
import type { GenerationMode } from "@/types";

interface GenerationModeToggleProps {
  mode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
  disabled?: boolean;
  className?: string;
}

export const GenerationModeToggle = memo<GenerationModeToggleProps>(
  ({ mode, onModeChange, disabled = false, className = "" }) => {
    const { isPrivateMode } = usePrivateMode();
    const isImageModeDisabled = disabled || isPrivateMode;

    const handleModeChange = (newMode: GenerationMode) => {
      if (newMode === "image" && isPrivateMode) {
        return;
      }
      onModeChange(newMode);
    };

    return (
      <div
        className={cn(
          "relative inline-flex items-center h-8 rounded-full bg-muted border shadow-sm transition-all duration-200 p-0.5",
          disabled && "opacity-50 cursor-not-allowed",
          "hover:shadow-md",
          className
        )}
      >
        {/* Sliding background indicator */}
        <div
          className={cn(
            "absolute top-0.5 bottom-0.5 w-7 rounded-full bg-background shadow-sm transition-all duration-300 ease-out border",
            mode === "text" ? "left-0.5" : "left-[calc(100%-1.875rem)]"
          )}
        />

        {/* Text mode button */}
        <button
          type="button"
          onClick={() => handleModeChange("text")}
          disabled={disabled}
          className={cn(
            "relative z-10 flex items-center justify-center w-7 h-7 rounded-full transition-colors duration-200",
            mode === "text"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed"
          )}
          title="Text Generation"
        >
          <ChatText size={16} weight={mode === "text" ? "fill" : "regular"} />
        </button>

        {/* Image mode button */}
        <TooltipWrapper
          content={
            isPrivateMode
              ? "Image generation not available in private mode. Switch to regular mode to generate images."
              : "Image Generation"
          }
        >
          <button
            type="button"
            onClick={() => handleModeChange("image")}
            disabled={isImageModeDisabled}
            className={cn(
              "relative z-10 flex items-center justify-center w-7 h-7 rounded-full transition-colors duration-200",
              mode === "image"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              isImageModeDisabled && "cursor-not-allowed opacity-40"
            )}
          >
            <Image size={16} weight={mode === "image" ? "fill" : "regular"} />
          </button>
        </TooltipWrapper>
      </div>
    );
  }
);

GenerationModeToggle.displayName = "GenerationModeToggle";
