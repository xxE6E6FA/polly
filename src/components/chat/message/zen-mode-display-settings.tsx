import { TextAaIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FONT_OPTIONS, type ZenDisplaySettingsControls } from "@/hooks";
import { cn } from "@/lib/utils";

type ZenModeDisplaySettingsProps = {
  controls: ZenDisplaySettingsControls;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerClassName: string;
};

export const ZenModeDisplaySettings = ({
  controls,
  isOpen,
  onOpenChange,
  triggerClassName,
}: ZenModeDisplaySettingsProps) => {
  const {
    displaySettings,
    updateFontFamily,
    adjustFontSize,
    adjustLineHeight,
    adjustWidth,
    isFontAtMin,
    isFontAtMax,
    isLineAtMin,
    isLineAtMax,
    isWidthAtMin,
    isWidthAtMax,
  } = controls;

  const stepperButtonClass = useMemo(
    () =>
      cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/90 text-base font-semibold leading-none text-foreground/70 shadow-sm transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40"
      ),
    []
  );

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={triggerClassName}
          aria-label="Display options"
        >
          <TextAaIcon className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={16}
        className="w-[320px] rounded-2xl border border-border bg-card/95 p-5 text-foreground/75 shadow-sm backdrop-blur-xl"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Font
            </span>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map(option => {
                const isActive = displaySettings.fontFamily === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-center rounded-xl border-border bg-card/80 text-sm font-medium text-foreground/70 hover:bg-card focus-visible:ring-1 focus-visible:ring-ring",
                      isActive &&
                        "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/85 focus-visible:ring-primary"
                    )}
                    onClick={() => updateFontFamily(option.value)}
                    aria-pressed={isActive}
                  >
                    <span
                      className={cn(
                        "text-base leading-none",
                        option.value === "serif" ? "font-serif" : "font-sans"
                      )}
                    >
                      {option.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold tracking-tight text-foreground/60">
              Text size
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustFontSize(-1)}
                disabled={isFontAtMin}
                aria-label="Decrease text size"
              >
                –
              </button>
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustFontSize(1)}
                disabled={isFontAtMax}
                aria-label="Increase text size"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold tracking-tight text-foreground/60">
              Line spacing
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustLineHeight(-1)}
                disabled={isLineAtMin}
                aria-label="Tighten line spacing"
              >
                –
              </button>
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustLineHeight(1)}
                disabled={isLineAtMax}
                aria-label="Loosen line spacing"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold tracking-tight text-foreground/60">
              Width
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustWidth(-1)}
                disabled={isWidthAtMin}
                aria-label="Narrow reading width"
              >
                –
              </button>
              <button
                type="button"
                className={stepperButtonClass}
                onClick={() => adjustWidth(1)}
                disabled={isWidthAtMax}
                aria-label="Widen reading width"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
