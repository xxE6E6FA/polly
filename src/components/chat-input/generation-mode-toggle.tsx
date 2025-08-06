import { ChatText, Image, Plus } from "@phosphor-icons/react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { ROUTES } from "@/lib/routes";
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

    const handleModeChange = (newMode: GenerationMode) => {
      if (newMode === "image" && (isPrivateMode || !hasReplicateApiKey)) {
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
            isPrivateMode ? (
              "Image generation not available in private mode. Switch to regular mode to generate images."
            ) : hasReplicateApiKey ? (
              "Image Generation"
            ) : (
              <div className="flex flex-col gap-2 text-center">
                <p>Image generation requires a Replicate API key.</p>
                <Link
                  to={ROUTES.SETTINGS.API_KEYS}
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  <Plus size={12} />
                  Add API Key
                </Link>
              </div>
            )
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
