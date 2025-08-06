import type React from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
    onHeightChange,
    isTransitioning = false,
    autoFocus = false,
  }: ChatInputFieldProps) {
    // State for animated placeholder
    const [currentPlaceholder, setCurrentPlaceholder] = useState(placeholder);
    const [isPlaceholderTransitioning, setIsPlaceholderTransitioning] =
      useState(false);

    // Handle placeholder transitions
    useEffect(() => {
      if (currentPlaceholder !== placeholder) {
        setIsPlaceholderTransitioning(true);

        // Start the transition after a brief delay to ensure the fade-out happens
        const timer = setTimeout(() => {
          setCurrentPlaceholder(placeholder);
          setIsPlaceholderTransitioning(false);
        }, 150); // Half of the transition duration

        return () => clearTimeout(timer);
      }
    }, [placeholder, currentPlaceholder]);

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
          // Special handling for empty content - reset to minimum height
          if (value === "") {
            textarea.style.height = "auto";
            textarea.style.height = "24px"; // Match min-h-[24px]
            onHeightChange?.(false);
          } else {
            // Optimize resize with direct style updates
            textarea.style.height = "auto";
            const currentHeight = textarea.scrollHeight;
            const newHeight = Math.min(currentHeight, 100);
            textarea.style.height = `${newHeight}px`;

            // Check if content is multiline (height > ~48px indicates 2+ lines)
            const isMultiline = currentHeight > 48;
            onHeightChange?.(isMultiline);
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
      <div className="relative w-full">
        <textarea
          ref={textareaRef}
          className={cn(
            // Core layout & appearance
            "w-full resize-none bg-transparent border-0 outline-none ring-0",
            "text-base sm:text-sm leading-relaxed",
            "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-1 sm:px-2",
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
            // Conditionally enable transitions - only for fullscreen changes, not during typing
            transition: isTransitioning
              ? "max-height 300ms ease-in-out, min-height 300ms ease-in-out"
              : "none",
            // Additional browser performance hints
            contentVisibility: "auto",
            containIntrinsicSize: "24px 100px",
          }}
          disabled={disabled}
          placeholder="" // Remove native placeholder
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
          // biome-ignore lint/a11y/noAutofocus: Needed for chat input auto-focus on home page
          autoFocus={autoFocus}
        />

        {/* Custom animated placeholder */}
        {!value && (
          <div
            className={cn(
              "absolute left-1.5 top-1 sm:left-2 pointer-events-none select-none",
              "text-base sm:text-sm leading-relaxed text-muted-foreground/60",
              "transition-opacity duration-300 ease-in-out",
              isPlaceholderTransitioning ? "opacity-0" : "opacity-100"
            )}
          >
            {currentPlaceholder}
          </div>
        )}
      </div>
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
      prevProps.onHistoryNavigationDown === nextProps.onHistoryNavigationDown &&
      prevProps.onHeightChange === nextProps.onHeightChange &&
      prevProps.isTransitioning === nextProps.isTransitioning
    );
  }
);
