import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { forwardRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ZenDisplaySettingsControls } from "./use-zen-display-settings";
import { ZenModeDisplaySettings } from "./ZenModeDisplaySettings";

type NavigationHandler = (direction: "prev" | "next") => boolean;

type ZenModeHeaderProps = {
  conversationTitle?: string;
  showNavigation: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate?: NavigationHandler;
  showCounter: boolean;
  position?: number;
  totalMessages?: number;
  estimatedReadingMinutes: number;
  isHeaderCondensed: boolean;
  isHeaderHidden: boolean;
  baseHeaderHeight: number;
  onClose: () => void;
  displaySettingsControls: ZenDisplaySettingsControls;
  isDisplayOptionsOpen: boolean;
  onDisplayOptionsOpenChange: (open: boolean) => void;
};

export const ZenModeHeader = forwardRef<HTMLDivElement, ZenModeHeaderProps>(
  (
    {
      conversationTitle,
      showNavigation,
      hasPrev,
      hasNext,
      onNavigate,
      showCounter,
      position,
      totalMessages,
      estimatedReadingMinutes,
      isHeaderCondensed,
      isHeaderHidden,
      baseHeaderHeight,
      onClose,
      displaySettingsControls,
      isDisplayOptionsOpen,
      onDisplayOptionsOpenChange,
    },
    ref
  ) => {
    const headerButtonClass = cn(
      "h-8 w-8 rounded-full border border-black/10 text-base transition focus-visible:ring-black/25 disabled:opacity-40 disabled:pointer-events-none dark:border-white/15 dark:focus-visible:ring-white/25",
      isHeaderCondensed
        ? "bg-black/5 text-black/70 hover:bg-black/10 hover:text-black/90 dark:bg-white/10 dark:text-white/85 dark:hover:bg-white/20 dark:hover:text-white"
        : "bg-white/60 text-black/60 hover:bg-black/10 hover:text-black/80 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20 dark:hover:text-white/90"
    );

    return (
      <header
        ref={ref}
        className={cn(
          "fixed inset-x-0 z-modal flex items-center justify-between gap-3 border-b border-black/5 px-5 transition-[top,opacity,padding] duration-500 ease-smooth sm:px-10 dark:border-white/10",
          "transform-gpu backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-xl",
          isHeaderCondensed
            ? "bg-white/70 supports-[backdrop-filter]:bg-white/45 py-2.5 dark:bg-[#11111a]/70 dark:supports-[backdrop-filter]:bg-[#11111a]/45"
            : "bg-white/55 supports-[backdrop-filter]:bg-white/35 py-5 sm:py-7 dark:bg-[#11111a]/60 dark:supports-[backdrop-filter]:bg-[#11111a]/40",
          isHeaderHidden && "pointer-events-none opacity-0 border-transparent"
        )}
        style={{ top: `${isHeaderHidden ? -baseHeaderHeight : 0}px` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {showNavigation && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={headerButtonClass}
                onClick={() => onNavigate?.("prev")}
                disabled={!hasPrev}
                aria-label="Previous assistant message"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={headerButtonClass}
                onClick={() => onNavigate?.("next")}
                disabled={!hasNext}
                aria-label="Next assistant message"
              >
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2
              className={cn(
                "truncate font-heading font-semibold tracking-[-0.008em] text-black/70 transition-all duration-300 dark:text-neutral-100",
                isHeaderCondensed
                  ? "text-[1.05rem] sm:text-[1.2rem]"
                  : "text-[1.25rem] sm:text-[1.6rem]"
              )}
            >
              {conversationTitle || "Untitled conversation"}
            </h2>
            {showCounter && (
              <span
                className={cn(
                  "mt-1 inline-flex items-center rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] text-black/55 transition-all duration-300 dark:border-white/15 dark:text-neutral-200",
                  isHeaderCondensed && "text-black/70 dark:text-neutral-100"
                )}
                aria-label={`Assistant message ${position} of ${totalMessages}`}
              >
                {position}/{totalMessages}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {estimatedReadingMinutes > 0 && (
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-[0.16em] text-black/45 transition-all duration-300 sm:text-xs dark:text-neutral-400",
                isHeaderCondensed && "text-black/60 dark:text-neutral-200"
              )}
            >
              {estimatedReadingMinutes} min read
            </span>
          )}
          <ZenModeDisplaySettings
            controls={displaySettingsControls}
            isOpen={isDisplayOptionsOpen}
            onOpenChange={onDisplayOptionsOpenChange}
            triggerClassName={headerButtonClass}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={cn(headerButtonClass, "font-semibold")}
            aria-label="Close Zen Mode"
          >
            ×
          </Button>
        </div>
      </header>
    );
  }
);

ZenModeHeader.displayName = "ZenModeHeader";
