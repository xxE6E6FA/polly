import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import { memo, useCallback, useLayoutEffect } from "react";
import {
  useInitialHeight,
  useKeyboardNavigation,
  useTextareaHeight,
  useTextareaStyling,
} from "./hooks";
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

  // Navigation options
  navigation?: {
    onHistoryNavigation?: () => boolean;
    onHistoryNavigationDown?: () => boolean;
    onHeightChange?: (isMultiline: boolean) => void;
    isTransitioning?: boolean;
  };

  // Mention options
  mentions?: {
    onMentionNavigate?: (direction: "up" | "down") => boolean;
    onMentionConfirm?: () => Id<"personas"> | null;
    onMentionCancel?: () => boolean;
    onMentionSelect?: (personaId: Id<"personas"> | null) => void;
    firstLineIndentPx?: number;
  };

  // Persona clearing for navigation
  onPersonaClearForNavigation?: () => void;
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
    navigation,
    mentions,
    onPersonaClearForNavigation,
  }: ChatInputFieldCoreProps) {
    const {
      onHistoryNavigation,
      onHistoryNavigationDown,
      onHeightChange,
      isTransitioning = false,
    } = navigation || {};

    const {
      onMentionNavigate,
      onMentionConfirm,
      onMentionCancel,
      onMentionSelect,
      firstLineIndentPx,
    } = mentions || {};

    // Use custom hooks for different concerns
    useInitialHeight({ textareaRef, value, onHeightChange });

    const { resizeTextarea } = useTextareaHeight({
      value,
      onHeightChange,
    });

    const { handleKeyDown } = useKeyboardNavigation({
      onHistoryNavigation,
      onHistoryNavigationDown,
      onMentionNavigate,
      onMentionConfirm,
      onMentionCancel,
      onPersonaClear: onPersonaClearForNavigation,
      onPersonaSelect: onMentionSelect,
      onSubmit,
    });

    const { textareaClassName, textareaStyle } = useTextareaStyling({
      disabled,
      className,
      isTransitioning,
      firstLineIndentPx,
    });

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange]
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
