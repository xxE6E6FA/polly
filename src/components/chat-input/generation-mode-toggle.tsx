import { ChatTextIcon, ImageIcon, PlusIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
          "h-8 w-16 border border-primary/30 bg-primary/20 shadow-sm p-0.5",
          "dark:bg-primary/15 dark:border-primary/25",
          "rounded-full transition-all duration-200 hover:shadow-md",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="text"
              disabled={disabled}
              aria-pressed={mode === "text"}
            >
              <ChatTextIcon
                size={14}
                weight={mode === "text" ? "fill" : "regular"}
              />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Text Generation</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value="image"
              disabled={isImageModeDisabled}
              aria-pressed={mode === "image"}
              title="Image Generation"
            >
              <ImageIcon
                size={14}
                weight={mode === "image" ? "fill" : "regular"}
              />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>
            {isPrivateMode ? (
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
                  <PlusIcon size={12} />
                  Add API Key
                </Link>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </ToggleGroup>
    );
  }
);

GenerationModeToggle.displayName = "GenerationModeToggle";
