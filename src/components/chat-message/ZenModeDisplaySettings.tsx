import { TextAaIcon } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  FONT_OPTIONS,
  type ZenDisplaySettingsControls,
} from "./use-zen-display-settings";

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
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white/90 text-base font-semibold leading-none text-black/70 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 dark:border-white/15 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20 dark:focus-visible:ring-white/25",
        "disabled:pointer-events-none disabled:opacity-40"
      ),
    []
  );

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={triggerClassName}
          aria-label="Display options"
        >
          <TextAaIcon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={16}
        className="w-[320px] rounded-2xl border border-black/10 bg-white/95 p-5 text-black/75 shadow-sm backdrop-blur-xl dark:border-white/15 dark:bg-[#171320]/90 dark:text-white/85"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-black/50 dark:text-white/60">
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
                      "h-9 w-full justify-center rounded-xl border-black/15 bg-white/80 text-sm font-medium text-black/70 hover:bg-white focus-visible:ring-1 focus-visible:ring-black/25 dark:border-white/20 dark:bg-transparent dark:text-white/80 dark:hover:bg-white/10",
                      isActive &&
                        "border-black/60 bg-black/90 text-white shadow-sm hover:bg-black/85 hover:text-white focus-visible:ring-black/35 dark:border-white/60 dark:bg-white/85 dark:text-black dark:hover:bg-white/85 dark:hover:text-black"
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
            <span className="text-sm font-semibold tracking-tight text-black/60 dark:text-white/75">
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
            <span className="text-sm font-semibold tracking-tight text-black/60 dark:text-white/75">
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
            <span className="text-sm font-semibold tracking-tight text-black/60 dark:text-white/75">
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
