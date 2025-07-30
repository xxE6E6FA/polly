import type React from "react";
import { memo, useCallback, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ChatInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onHistoryNavigation?: () => boolean;
  onHistoryNavigationDown?: () => boolean;
}

// Memoized for maximum performance - prevents unnecessary re-renders
export const ChatInputField = memo(
  function ChatInputField({
    value,
    onChange,
    onSubmit,
    textareaRef,
    placeholder = "Type a message...",
    disabled = false,
    className,
    onHistoryNavigation,
    onHistoryNavigationDown,
  }: ChatInputFieldProps) {
    // Optimized keydown handler with efficient history navigation
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        } else if (e.key === "ArrowUp" && onHistoryNavigation) {
          // Optimized history navigation - only check cursor position when needed
          const textarea = e.target as HTMLTextAreaElement;
          if (textarea.selectionStart === 0) {
            const handled = onHistoryNavigation();
            if (handled) {
              e.preventDefault();
            }
          }
        } else if (e.key === "ArrowDown" && onHistoryNavigationDown) {
          // Optimized down navigation - efficient end-of-text check
          const textarea = e.target as HTMLTextAreaElement;
          if (textarea.selectionStart === textarea.value.length) {
            const handled = onHistoryNavigationDown();
            if (handled) {
              e.preventDefault();
            }
          }
        }
      },
      [onSubmit, onHistoryNavigation, onHistoryNavigationDown]
    );

    // Ultra-optimized change handler with direct value extraction
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        // Direct value extraction for maximum performance
        onChange(e.target.value);
      },
      [onChange]
    );

    // Highly optimized auto-resize using requestAnimationFrame for 60fps performance
    const resizeRafRef = useRef<number | null>(null);
    const lastValueRef = useRef(value);

    useLayoutEffect(() => {
      // Only resize if value actually changed
      if (lastValueRef.current === value) {
        return;
      }
      lastValueRef.current = value;

      if (!textareaRef.current) {
        return;
      }

      // Cancel any pending resize
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }

      // Use requestAnimationFrame for smooth 60fps resize
      resizeRafRef.current = requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          // Optimize resize with direct style updates
          const currentHeight = textarea.scrollHeight;
          const newHeight = Math.min(currentHeight, 100);

          // Only update if height actually changed
          if (textarea.style.height !== `${newHeight}px`) {
            textarea.style.height = "auto";
            textarea.style.height = `${newHeight}px`;
          }
        }
        resizeRafRef.current = null;
      });

      // Cleanup animation frame
      return () => {
        if (resizeRafRef.current) {
          cancelAnimationFrame(resizeRafRef.current);
        }
      };
    }); // Run on every render but with change detection for performance

    return (
      <textarea
        ref={textareaRef}
        className={cn(
          // Core layout & appearance
          "w-full resize-none bg-transparent border-0 outline-none ring-0",
          "text-base sm:text-sm leading-relaxed",
          "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-1 sm:px-2",
          "placeholder:text-muted-foreground/60",
          // Enhanced focus experience - subtle visual feedback
          "focus:bg-background/50 focus:backdrop-blur-sm transition-colors duration-200",
          // Performance optimizations
          "will-change-[height] contain-layout transform-gpu",
          // Browser performance hints
          "[content-visibility:auto] [contain-intrinsic-size:24px_100px]",
          // States
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        style={{
          // Force GPU acceleration and composition layer
          transform: "translate3d(0, 0, 0)",
          // Remove transitions during active typing for better performance
          transition: "none",
          // Additional browser performance hints
          contentVisibility: "auto",
          containIntrinsicSize: "24px 100px",
        }}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        // Performance optimizations
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false} // Disable during typing for performance
        inputMode="text"
        // Enhanced focus accessibility
        tabIndex={0}
        aria-label="Chat message input"
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for optimal performance - only re-render when essential props change
    return (
      prevProps.value === nextProps.value &&
      prevProps.disabled === nextProps.disabled &&
      prevProps.placeholder === nextProps.placeholder &&
      prevProps.className === nextProps.className &&
      // Callbacks should be stable, so reference equality is fine
      prevProps.onChange === nextProps.onChange &&
      prevProps.onSubmit === nextProps.onSubmit &&
      prevProps.onHistoryNavigation === nextProps.onHistoryNavigation &&
      prevProps.onHistoryNavigationDown === nextProps.onHistoryNavigationDown
    );
  }
);
