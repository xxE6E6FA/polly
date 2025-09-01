import type { Doc } from "@convex/_generated/dataModel";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "../provider-icons";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

export const ModelPickerTrigger = forwardRef<
  HTMLButtonElement,
  {
    open: boolean;
    selectedModel: AvailableModel | null | undefined;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ open, selectedModel, className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-labelledby="model-picker-label"
      variant="ghost"
      className={cn(
        "h-6 w-auto gap-1 px-1.5 py-0.5 text-xs font-medium sm:h-7 sm:gap-1.5 sm:px-2 sm:text-xs",
        "transition-all duration-200 rounded-md border-0 focus:ring-0 shadow-none",
        // Chip style at rest for consistency
        "bg-accent/40 dark:bg-accent/20 text-foreground/90",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1">
        <ProviderIcon
          provider={selectedModel?.free ? "polly" : selectedModel?.provider}
          className="h-3 w-3"
        />
        <span className="max-w-[120px] truncate font-medium">
          {selectedModel?.name || "Select model"}
        </span>
      </div>
    </Button>
  );
});
ModelPickerTrigger.displayName = "ModelPickerTrigger";
