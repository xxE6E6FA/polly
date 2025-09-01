import type React from "react";
import { memo, useCallback } from "react";
import { ChatInputFieldCore } from "./chat-input-field-core";
import { createHashMemoComparison } from "./hooks/use-props-hash";

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
  navigation?: {
    onHistoryNavigation?: () => boolean;
    onHistoryNavigationDown?: () => boolean;
  };
  hasExistingMessages?: boolean;
}

export const ChatInputField = memo(
  function ChatInputField({
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
    navigation,
  }: ChatInputFieldProps) {
    const handleChange = useCallback(
      (newValue: string) => {
        onChange(newValue);
      },
      [onChange]
    );

    return (
      <div className="relative w-full">
        <ChatInputFieldCore
          value={value}
          onChange={handleChange}
          onSubmit={onSubmit}
          textareaRef={textareaRef}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          autoFocus={autoFocus}
          isFullscreen={isFullscreen}
          isTransitioning={isTransitioning}
          navigation={navigation}
        />
      </div>
    );
  },
  createHashMemoComparison(["textareaRef"]) // Use optimized hash-based comparison
);
