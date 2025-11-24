import type React from "react";
import { cn } from "@/lib/utils";

type ChatInputButtonSize = "sm" | "default";

type SendButtonContainerProps = {
  isExpanded: boolean;
  isCollapsing: boolean;
  hasBeenEnabled: boolean;
  canSend: boolean;
  isLoading: boolean;
  shouldShowWaveform: boolean;
  size?: ChatInputButtonSize;
  children: React.ReactNode;
};

export const SendButtonContainer = ({
  isExpanded,
  isCollapsing,
  hasBeenEnabled,
  canSend,
  isLoading,
  shouldShowWaveform,
  size = "default",
  children,
}: SendButtonContainerProps) => {
  const heightClass =
    size === "default"
      ? "h-[var(--chat-input-button-size-default)]"
      : "h-[var(--chat-input-button-size-sm)]";

  const widthClass = (() => {
    if (shouldShowWaveform) {
      return "w-[120px] duration-300";
    }
    if (isExpanded) {
      return "w-[64px] duration-500";
    }
    return size === "default"
      ? "w-[var(--chat-input-button-size-default)] duration-300"
      : "w-[var(--chat-input-button-size-sm)] duration-300";
  })();

  const backgroundClass = (() => {
    if (isLoading) {
      return "bg-none";
    }
    if (canSend || shouldShowWaveform) {
      return "bg-primary hover:bg-primary/90";
    }
    return "bg-primary/20 dark:bg-primary/15 dark:border-primary/25";
  })();

  const easingClass = isCollapsing ? "ease-collapse" : "ease-expand";

  return (
    <div
      className={cn(
        "relative flex items-stretch",
        heightClass,
        "rounded-full",
        "transition-all",
        easingClass,
        widthClass,
        "overflow-visible",
        isCollapsing && "scale-[0.98]",
        backgroundClass
      )}
      style={{
        animation:
          hasBeenEnabled &&
          canSend &&
          !isExpanded &&
          !isCollapsing &&
          !shouldShowWaveform
            ? "button-entrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : undefined,
      }}
    >
      {children}
    </div>
  );
};
