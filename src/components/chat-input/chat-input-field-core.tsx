import type React from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
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
  isTransitioning?: boolean;
  disableAutoResize?: boolean;

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
    isTransitioning = false,
    disableAutoResize = false,
    navigation,
  }: ChatInputFieldCoreProps) {
    const { onHistoryNavigation, onHistoryNavigationDown } = navigation || {};

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
          // Padding: more left and top for breathing room; right handled by parent
          "overflow-y-auto pl-3 pt-2 pb-1 sm:pl-3",
          // Enhanced focus experience - match container background
          "focus:bg-card transition-colors duration-200",
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
          ? "height 360ms cubic-bezier(0.2, 0.85, 0.3, 1.05), max-height 360ms cubic-bezier(0.2, 0.85, 0.3, 1.05), min-height 360ms cubic-bezier(0.2, 0.85, 0.3, 1.05)"
          : "none",
        // Additional browser performance hints
        contentVisibility: "auto" as const,
        containIntrinsicSize: "24px 100px",
        // Prevent zoom on mobile Chrome
        touchAction: "manipulation",
      }),
      [isTransitioning]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        // Resize immediately on user input
        if (!disableAutoResize) {
          resizeTextarea(textareaRef.current);
        }
      },
      [onChange, resizeTextarea, textareaRef, disableAutoResize]
    );

    // Handle textarea resize when value changes
    useLayoutEffect(() => {
      if (!disableAutoResize) {
        resizeTextarea(textareaRef.current);
      }
    }, [resizeTextarea, textareaRef, disableAutoResize]);

    // Animate grow/shrink on fullscreen toggle explicitly
    const animTimeoutRef = useRef<number | null>(null);
    useLayoutEffect(() => {
      const el = textareaRef.current;
      if (!(el && isTransitioning)) {
        return;
      }

      // Lock current height as the animation start point
      const startH = el.getBoundingClientRect().height;
      el.style.height = `${startH}px`;

      // Next frame, set target height depending on new state
      const raf = requestAnimationFrame(() => {
        if (!el) {
          return;
        }
        if (isFullscreen) {
          // Expanding: aim for at least 50vh, but cap to 85vh
          const minVh = Math.round(window.innerHeight * 0.5);
          const maxVh = Math.round(window.innerHeight * 0.85);
          const target = Math.max(
            minVh,
            Math.min(maxVh, Math.max(startH, minVh))
          );
          el.style.height = `${target}px`;
        } else if (!disableAutoResize) {
          // Collapsing: let our auto-grow logic compute the compact target
          resizeTextarea(el);
        }
      });

      // Clear explicit height after the animation window
      animTimeoutRef.current = window.setTimeout(() => {
        if (!el) {
          return;
        }
        el.style.height = "";
      }, 380);

      return () => {
        cancelAnimationFrame(raf);
        if (animTimeoutRef.current) {
          clearTimeout(animTimeoutRef.current);
          animTimeoutRef.current = null;
        }
      };
    }, [
      isFullscreen,
      isTransitioning,
      resizeTextarea,
      textareaRef,
      disableAutoResize,
    ]);

    return (
      <textarea
        ref={textareaRef}
        className={textareaClassName}
        style={textareaStyle}
        data-transitioning={isTransitioning ? "true" : undefined}
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
