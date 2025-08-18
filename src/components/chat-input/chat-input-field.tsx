import type React from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
  onHeightChange?: (isMultiline: boolean) => void;
  isTransitioning?: boolean;
  autoFocus?: boolean;
  onMentionNavigate?: (direction: "up" | "down") => boolean;
  onMentionConfirm?: () => boolean;
  onMentionCancel?: () => boolean;
  firstLineIndentPx?: number;
}

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
    onHeightChange,
    isTransitioning = false,
    autoFocus = false,
    onMentionNavigate,
    onMentionConfirm,
    onMentionCancel,
    firstLineIndentPx,
  }: ChatInputFieldProps) {
    // Ensure proper initial height on mount
    useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      // Small delay to ensure textarea is fully rendered
      const timer = setTimeout(() => {
        // Force initial height calculation for empty input
        if (value.trim().length === 0) {
          textarea.style.height = "auto";
          // Force a reflow to get accurate scrollHeight
          textarea.offsetHeight;
          const initialHeight = textarea.scrollHeight;
          const collapsedHeight = Math.min(initialHeight, 100);
          textarea.style.height = `${collapsedHeight}px`;
          lastHeightRef.current = collapsedHeight;
          // Always start collapsed for empty input
          onHeightChange?.(false);
        }
      }, 10);

      return () => clearTimeout(timer);
    }, [onHeightChange, textareaRef, value]); // Only run on mount

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          if (onMentionConfirm?.()) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          onSubmit();
        } else if (e.key === "ArrowUp" && onMentionNavigate) {
          const handled = onMentionNavigate?.("up") ?? false;
          if (handled) {
            e.preventDefault();
            return;
          }
        } else if (e.key === "ArrowDown" && onMentionNavigate) {
          const handled = onMentionNavigate?.("down") ?? false;
          if (handled) {
            e.preventDefault();
            return;
          }
        } else if (e.key === "ArrowUp" && onHistoryNavigation) {
          const textarea = e.target as HTMLTextAreaElement;
          if (textarea.selectionStart === 0) {
            const handled = onHistoryNavigation();
            if (handled) {
              e.preventDefault();
            }
          }
        } else if (e.key === "ArrowDown" && onHistoryNavigationDown) {
          const textarea = e.target as HTMLTextAreaElement;
          if (textarea.selectionStart === textarea.value.length) {
            const handled = onHistoryNavigationDown();
            if (handled) {
              e.preventDefault();
            }
          }
        } else if (e.key === "Escape" && onMentionCancel) {
          const handled = onMentionCancel?.() ?? false;
          if (handled) {
            e.preventDefault();
          }
        } else if (e.key === "Backspace") {
          const textarea = e.target as HTMLTextAreaElement;
          if (textarea.value.length === 0) {
            if (onMentionCancel?.()) {
              e.preventDefault();
            }
          }
        }
      },
      [
        onSubmit,
        onHistoryNavigation,
        onHistoryNavigationDown,
        onMentionNavigate,
        onMentionConfirm,
        onMentionCancel,
      ]
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange]
    );

    const resizeRafRef = useRef<number | null>(null);
    const lastValueRef = useRef(value);
    const lastHeightRef = useRef<number>(0);

    const performResize = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.style.height = "auto";
      // Force a reflow to get accurate scrollHeight
      textarea.offsetHeight;
      const currentHeight = textarea.scrollHeight;
      const newHeight = Math.min(currentHeight, 100);

      // Only update if height actually changed
      if (newHeight !== lastHeightRef.current) {
        textarea.style.height = `${newHeight}px`;
        lastHeightRef.current = newHeight;
        // For empty input, always treat as single line (collapsed)
        const isMultiline = value.trim().length > 0 && currentHeight > 48;
        onHeightChange?.(isMultiline);
      }

      resizeRafRef.current = null;
    }, [onHeightChange, textareaRef.current, value]);

    useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }

      // Ensure initial height is set correctly
      if (value.trim().length === 0) {
        textarea.style.height = "auto";
        const initialHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(initialHeight, 100)}px`;
        lastHeightRef.current = Math.min(initialHeight, 100);
        // Always start collapsed for empty input
        onHeightChange?.(false);
      } else {
        resizeRafRef.current = requestAnimationFrame(performResize);
      }

      return () => {
        if (resizeRafRef.current) {
          cancelAnimationFrame(resizeRafRef.current);
        }
      };
    }, [performResize, textareaRef.current, value, onHeightChange]);

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
          // Always size to exact scrollHeight for both empty and non-empty values
          textarea.style.height = "auto";
          // Force a reflow to get accurate scrollHeight
          textarea.offsetHeight;
          const currentHeight = textarea.scrollHeight;
          const newHeight = Math.min(currentHeight, 100);
          textarea.style.height = `${newHeight}px`;
          // For empty input, always treat as single line (collapsed)
          const isMultiline = value.trim().length > 0 && currentHeight > 48;
          onHeightChange?.(isMultiline);
        }
        resizeRafRef.current = null;
      });

      // Cleanup animation frame
      return () => {
        if (resizeRafRef.current) {
          cancelAnimationFrame(resizeRafRef.current);
        }
      };
    }, [value, textareaRef, onHeightChange]);

    return (
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          className={cn(
            // Core layout & appearance
            "w-full resize-none bg-transparent border-0 outline-none ring-0",
            "text-sm sm:text-base leading-relaxed",
            "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-1 sm:px-2",
            // Enhanced focus experience - subtle visual feedback
            "focus:bg-background/50 focus:backdrop-blur-sm transition-colors duration-200",
            // Performance optimizations
            "will-change-[height] contain-layout transform-gpu hide-scrollbar md:scrollbar-thin",
            // Browser performance hints
            "[content-visibility:auto] [contain-intrinsic-size:24px_100px]",
            // States
            disabled && "cursor-not-allowed opacity-50",
            className
          )}
          style={{
            // Force GPU acceleration and composition layer
            transform: "translate3d(0, 0, 0)",
            // Conditionally enable transitions - only for fullscreen changes, not during typing
            transition: isTransitioning
              ? "max-height 300ms ease-in-out, min-height 300ms ease-in-out"
              : "none",
            // Additional browser performance hints
            contentVisibility: "auto",
            containIntrinsicSize: "24px 100px",
            textIndent: firstLineIndentPx
              ? `${firstLineIndentPx}px`
              : undefined,
          }}
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
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.disabled === nextProps.disabled &&
      prevProps.placeholder === nextProps.placeholder &&
      prevProps.className === nextProps.className &&
      // Callbacks should be stable, so reference equality is fine
      prevProps.onChange === nextProps.onChange &&
      prevProps.onSubmit === nextProps.onSubmit &&
      prevProps.onHistoryNavigation === nextProps.onHistoryNavigation &&
      prevProps.onHistoryNavigationDown === nextProps.onHistoryNavigationDown &&
      prevProps.onHeightChange === nextProps.onHeightChange &&
      prevProps.isTransitioning === nextProps.isTransitioning &&
      prevProps.autoFocus === nextProps.autoFocus
    );
  }
);
