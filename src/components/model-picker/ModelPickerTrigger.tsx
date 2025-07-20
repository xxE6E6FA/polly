import { CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/types";
import { ProviderIcon } from "../provider-icons";

export const ModelPickerTrigger = ({
  open,
  selectedModel,
}: {
  open: boolean;
  selectedModel: AIModel | null | undefined;
}) => {
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
            provider={selectedModel?.provider}
            className="h-3.5 w-3.5"
          />
          <span className="max-w-[150px] truncate font-medium">
            {selectedModel?.name || "Select model"}
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
