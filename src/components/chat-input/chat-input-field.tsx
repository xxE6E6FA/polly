import type React from "react";
import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useKeyboardNavigation } from "@/hooks/chat-ui";
import { cn } from "@/lib/utils";

interface ChatInputFieldProps {
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
  onHeightChange?: (isMultiline: boolean) => void;

  navigation?: {
    onHistoryNavigation?: () => boolean;
    onHistoryNavigationDown?: () => boolean;
  };
}

/**
 * Chat input textarea component with auto-resize and keyboard navigation support
 */
export const ChatInputField = memo(function ChatInputField({
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
  onHeightChange,
  navigation,
}: ChatInputFieldProps) {
  const { onHistoryNavigation, onHistoryNavigationDown } = navigation || {};

  const { handleKeyDown } = useKeyboardNavigation({
    onHistoryNavigation,
    onHistoryNavigationDown,
    onPersonaClear: undefined,
    onSubmit,
  });

  const shouldAutoResize = !disableAutoResize;

  const wrapperClassName = useMemo(
    () =>
      cn(
        "relative w-full",
        shouldAutoResize &&
          "auto-resize-textarea px-2.5 py-1.5 overflow-y-auto max-h-60 sm:max-h-72",
        disabled && "cursor-not-allowed opacity-50",
        className
      ),
    [shouldAutoResize, disabled, className]
  );

  const textareaClassName = useMemo(
    () =>
      cn(
        "w-full bg-transparent border-0 outline-none ring-0 text-base leading-relaxed",
        "transition-colors duration-200 focus:bg-transparent focus:outline-none",
        "touch-action-manipulation md:scrollbar-thin resize-none overflow-y-auto",
        "placeholder:text-muted-foreground/60",
        "p-0"
      ),
    []
  );

  const textareaStyle = useMemo(
    () => ({
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

  const updateMultilineFlag = useCallback(
    (nextValue: string) => {
      if (!onHeightChange) {
        return;
      }
      const textarea = textareaRef.current;
      if (!textarea) {
        onHeightChange(nextValue.includes("\n"));
        return;
      }
      const isMultiline =
        nextValue.includes("\n") ||
        textarea.scrollHeight > textarea.clientHeight + 1;
      onHeightChange(isMultiline);
    },
    [onHeightChange, textareaRef]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      onChange(nextValue);
      updateMultilineFlag(nextValue);
    },
    [onChange, updateMultilineFlag]
  );

  useLayoutEffect(() => {
    updateMultilineFlag(value);
  }, [updateMultilineFlag, value]);

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
        const minVh = Math.round(window.innerHeight * 0.5);
        const maxVh = Math.round(window.innerHeight * 0.85);
        const target = Math.max(
          minVh,
          Math.min(maxVh, Math.max(startH, minVh))
        );
        el.style.height = `${target}px`;
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
  }, [isFullscreen, isTransitioning, textareaRef]);

  const dataValue = useMemo(() => {
    if (!shouldAutoResize) {
      return undefined;
    }
    return `${value || ""}\u200b`;
  }, [shouldAutoResize, value]);

  return (
    <div
      className={wrapperClassName}
      data-replicated-value={dataValue}
      data-autoresize={shouldAutoResize ? "true" : undefined}
    >
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
    </div>
  );
});
