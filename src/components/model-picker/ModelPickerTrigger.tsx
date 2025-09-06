import type { Doc } from "@convex/_generated/dataModel";
import { CaretDown } from "@phosphor-icons/react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

export const ModelPickerTrigger = forwardRef<
  HTMLButtonElement,
  {
    open: boolean;
    selectedModel: AvailableModel | null | undefined;
    displayLabel?: string;
    displayProvider?: string;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(
  (
    { open, selectedModel, className, displayLabel, displayProvider, ...props },
    ref
  ) => {
    const label = displayLabel || selectedModel?.name || "Select model";
    return (
      <Button
        ref={ref}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby="model-picker-label"
        variant="ghost"
        className={cn(
          // Slightly larger than other chips
          "h-8 w-auto gap-2 px-3 py-0.5 text-xs font-medium sm:h-8",
          // Distinctive, but subtle gradient pill
          "rounded-full border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 text-foreground/90",
          // Motion + focus
          "transition-all duration-200 hover:from-primary/15 hover:to-primary/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-1.5">
          <span className="max-w-[180px] truncate font-semibold tracking-tight">
            {label}
          </span>
        </div>
        <CaretDown className="h-3.5 w-3.5 opacity-70" />
      </Button>
    );
  }
);
ModelPickerTrigger.displayName = "ModelPickerTrigger";
