import { CaretDownIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/types";
import { ProviderIcon } from "../provider-icons";

const ModelPickerTriggerComponent = ({
  open,
  selectedModel,
  hasReachedPollyLimit,
  isAuthenticated,
}: {
  open: boolean;
  selectedModel: AIModel | null | undefined;
  hasReachedPollyLimit: boolean;
  isAuthenticated: boolean;
}) => {
  const displayName = useMemo(
    () =>
      isAuthenticated
        ? selectedModel?.name || "Select model"
        : "Gemini 2.5 Flash Lite",
    [isAuthenticated, selectedModel?.name]
  );

  return (
    <>
      <label id="model-picker-label" className="sr-only">
        Select a model
      </label>
      <Button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby="model-picker-label"
        variant="ghost"
        className={cn(
          "h-7 w-auto gap-1 px-2 py-1 text-xs font-medium sm:h-8 sm:gap-2 sm:px-3 sm:text-sm",
          "text-muted-foreground/80 hover:text-foreground",
          "hover:bg-accent/50 dark:hover:bg-accent/30",
          "transition-all duration-200",
          open && "bg-accent/50 dark:bg-accent/30 text-foreground"
        )}
      >
        <div className="flex items-center gap-1.5">
          <ProviderIcon
            provider={
              selectedModel?.free &&
              (selectedModel.provider === "polly" ||
                selectedModel.modelId === "gemini-2.5-flash-lite-preview-06-17")
                ? "polly"
                : (selectedModel?.provider ?? "openai")
            }
            className="h-3.5 w-3.5"
          />
          {selectedModel?.free &&
            !hasReachedPollyLimit &&
            selectedModel.provider !== "polly" &&
            selectedModel.modelId !== "gemini-2.5-flash-lite-preview-06-17" && (
              <Badge
                className="h-4 border-success/20 bg-success/10 px-1.5 py-0 text-[10px] text-success hover:bg-success/10"
                variant="secondary"
              >
                Free
              </Badge>
            )}
          {selectedModel?.free && hasReachedPollyLimit && (
            <Badge
              className="h-4 border-orange-200 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-400"
              variant="secondary"
            >
              Limit
            </Badge>
          )}
          <span className="max-w-[150px] truncate font-medium">
            {displayName}
          </span>
          <CaretDownIcon
            className={cn(
              "h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-all duration-200 shrink-0",
              open && "rotate-180 text-foreground"
            )}
          />
        </div>
      </Button>
    </>
  );
};

export const ModelPickerTrigger = memo(ModelPickerTriggerComponent);
