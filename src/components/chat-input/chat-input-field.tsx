import type React from "react";
import { useCallback, useLayoutEffect } from "react";
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

export function ChatInputField({
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
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      } else if (e.key === "ArrowUp" && onHistoryNavigation) {
        const textarea = e.target as HTMLTextAreaElement;
        const cursorPosition = textarea.selectionStart;

        // Only trigger history navigation if cursor is at position 0
        if (cursorPosition === 0) {
          const handled = onHistoryNavigation();
          if (handled) {
            e.preventDefault();
          }
        }
      } else if (e.key === "ArrowDown" && onHistoryNavigationDown) {
        const textarea = e.target as HTMLTextAreaElement;
        const cursorPosition = textarea.selectionStart;
        const textLength = textarea.value.length;

        // Only trigger down navigation if cursor is at the end of the text
        if (cursorPosition === textLength) {
          const handled = onHistoryNavigationDown();
          if (handled) {
            e.preventDefault();
          }
        }
      }
    },
    [onSubmit, onHistoryNavigation, onHistoryNavigationDown]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Auto-resize textarea
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
    }
  });

  return (
    <textarea
      ref={textareaRef}
      className={cn(
        "w-full resize-none bg-transparent border-0 outline-none ring-0 focus:ring-0",
        "text-base sm:text-sm leading-relaxed transition-opacity duration-200",
        "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-1 sm:px-2",
        "placeholder:text-muted-foreground/60",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
