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
}

export function ChatInputField({
  value,
  onChange,
  onSubmit,
  textareaRef,
  placeholder = "Type a message...",
  disabled = false,
  className,
}: ChatInputFieldProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
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
        "min-h-[24px] max-h-[100px] overflow-y-auto px-1.5 py-0.5 sm:px-2",
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
