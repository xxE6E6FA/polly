import { Minus } from "@phosphor-icons/react";
import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NegativePromptToggleProps {
  enabled: boolean;
  value: string;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onSubmit?: () => void;
}

export const NegativePromptToggle = memo<NegativePromptToggleProps>(
  ({
    enabled,
    value,
    onEnabledChange,
    onValueChange,
    disabled = false,
    className = "",
    textareaRef,
    onSubmit,
  }) => {
    const handleEnable = useCallback(() => {
      onEnabledChange(true);
    }, [onEnabledChange]);

    const handleDisable = useCallback(() => {
      onEnabledChange(false);
      onValueChange("");
    }, [onEnabledChange, onValueChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      },
      [onSubmit]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onValueChange(e.target.value);
      },
      [onValueChange]
    );

    return (
      <div className={cn("stack-xs", className)}>
        {enabled ? (
          /* Enabled State with Textarea */
          <div className="stack-sm">
            {/* Active button header */}
            <div className="py-1 flex justify-start">
              <Button
                onClick={handleDisable}
                disabled={disabled}
                variant="ghost"
                size="sm"
                className="h-6 gap-1.5 text-xs text-foreground bg-muted/70 hover:bg-muted px-2"
              >
                <Minus className="h-3.5 w-3.5" weight="bold" />
                Negative prompt
              </Button>
            </div>

            {/* Integrated Textarea */}
            <div className="animate-in slide-in-from-top-1 duration-150">
              <div className="relative w-full">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  placeholder="" // Remove native placeholder
                  rows={2}
                  className={cn(
                    "w-full resize-none bg-transparent border-0 outline-none ring-0",
                    "text-base sm:text-sm leading-relaxed",
                    "min-h-[40px] max-h-[80px] overflow-y-auto px-1.5 py-1 sm:px-2",
                    "focus:bg-background/80 focus:backdrop-blur-sm transition-colors duration-200",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                  disabled={disabled}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />

                {/* Custom animated placeholder matching main input */}
                {!value && (
                  <div
                    className={cn(
                      "absolute left-1.5 top-1 sm:left-2 pointer-events-none select-none",
                      "text-base sm:text-sm leading-relaxed text-muted-foreground/60",
                      "transition-opacity duration-300 ease-in-out"
                    )}
                  >
                    Describe what to avoid in the image...
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Enable Button - Compact and left-aligned */
          <div className="py-1 flex justify-start">
            <Button
              onClick={handleEnable}
              disabled={disabled}
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
            >
              <Minus className="h-3.5 w-3.5" weight="bold" />
              Add negative prompt
            </Button>
          </div>
        )}
      </div>
    );
  }
);

NegativePromptToggle.displayName = "NegativePromptToggle";
