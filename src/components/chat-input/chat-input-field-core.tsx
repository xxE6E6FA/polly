import type React from "react";
import { memo, useCallback, useLayoutEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useKeyboardNavigation, useTextareaHeight } from "./hooks";
import { createHashMemoComparison } from "./hooks/use-props-hash";

interface ChatInputFieldCoreProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  isFullscreen?: boolean;

  navigation?: {
    onHistoryNavigation?: () => boolean;
    onHistoryNavigationDown?: () => boolean;
  };
}

/**
 * Core textarea component with minimal props for better memoization
 */
export const ChatInputFieldCore = memo(
  function ChatInputFieldCore({
    value,
    onChange,
    onSubmit,
    textareaRef,
    placeholder = "Type message...",
    disabled = false,
    className,
    autoFocus = false,
    isFullscreen = false,
    navigation,
  }: ChatInputFieldCoreProps) {
    const { onHistoryNavigation, onHistoryNavigationDown } = navigation || {};
    const isTransitioning = false;

    const { resizeTextarea } = useTextareaHeight({
      value,
      onHeightChange: undefined,
      isFullscreen,
    });

    const { handleKeyDown } = useKeyboardNavigation({
      onHistoryNavigation,
      onHistoryNavigationDown,
      onPersonaClear: undefined,
      onSubmit,
    });

    const textareaClassName = useMemo(
      () =>
        cn(
          // Core layout & appearance
          "w-full resize-none bg-transparent border-0 outline-none ring-0",
          "text-base leading-relaxed",
          "overflow-y-auto px-1.5 py-1 sm:px-2",
          // Enhanced focus experience - subtle visual feedback
          "focus:bg-background/50 focus:backdrop-blur-sm transition-colors duration-200",
          // Prevent zoom on mobile Chrome
          "touch-action: manipulation",
          // Performance optimizations
          "will-change-[height] contain-layout transform-gpu md:scrollbar-thin",
          // Browser performance hints
          "[content-visibility:auto] [contain-intrinsic-size:24px_100px]",
          // States
          disabled && "cursor-not-allowed opacity-50",
          className
        ),
      [disabled, className]
    );

    const textareaStyle = useMemo(
      () => ({
        // Force GPU acceleration and composition layer
        transform: "translate3d(0, 0, 0)",
        // Conditionally enable transitions - only for fullscreen changes, not during typing
        transition: isTransitioning
          ? "max-height 300ms ease-in-out, min-height 300ms ease-in-out"
          : "none",
        // Additional browser performance hints
        contentVisibility: "auto" as const,
        containIntrinsicSize: "24px 100px",
        // Prevent zoom on mobile Chrome
        touchAction: "manipulation",
      }),
      []
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        // Resize immediately on user input
        resizeTextarea(textareaRef.current);
      },
      [onChange, resizeTextarea, textareaRef]
    );

    // Handle textarea resize when value changes
    useLayoutEffect(() => {
      resizeTextarea(textareaRef.current);
    }, [resizeTextarea, textareaRef]);

    return (
      <textarea
        ref={textareaRef}
        className={textareaClassName}
        style={textareaStyle}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        inputMode="text"
        tabIndex={0}
        aria-label="Chat message input"
        // biome-ignore lint/a11y/noAutofocus: Needed for chat input auto-focus on home page
        autoFocus={autoFocus}
      />
    );
  },
  createHashMemoComparison(["textareaRef"]) // Exclude ref from comparison
);
