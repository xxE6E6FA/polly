import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import { memo, useCallback } from "react";
import { ChatInputFieldCore } from "./chat-input-field-core";
import { createHashMemoComparison } from "./hooks/use-props-hash";
import { PersonaChip } from "./persona-chip";

interface ChatInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  // Grouped navigation options
  navigation?: {
    onHistoryNavigation?: () => boolean;
    onHistoryNavigationDown?: () => boolean;
    onHeightChange?: (isMultiline: boolean) => void;
    isTransitioning?: boolean;
  };
  // Persona-related props
  selectedPersonaId?: Id<"personas"> | null;
  currentPersona?: {
    name: string;
    icon?: string;
  } | null;
  onPersonaClear?: () => void;
  hasExistingMessages?: boolean;
  onPersonaSelect: (personaId: Id<"personas"> | null) => void;
  onPersonaChipWidthChange: (width: number) => void;
  // Additional navigation option for persona clearing
  onPersonaClearForNavigation?: () => void;
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
    navigation,
    selectedPersonaId,
    currentPersona,
    onPersonaClear,
    onPersonaChipWidthChange,
    onPersonaClearForNavigation,
  }: ChatInputFieldProps) {
    const handleChange = useCallback(
      (newValue: string) => {
        onChange(newValue);
      },
      [onChange]
    );

    return (
      <div className="relative w-full">
        {/* Persona chip display - isolated component */}
        <PersonaChip
          selectedPersonaId={selectedPersonaId}
          currentPersona={currentPersona}
          onPersonaClear={onPersonaClear}
          onPersonaChipWidthChange={onPersonaChipWidthChange}
        />

        {/* Core textarea - isolated component */}
        <ChatInputFieldCore
          value={value}
          onChange={handleChange}
          onSubmit={onSubmit}
          textareaRef={textareaRef}
          placeholder={selectedPersonaId ? "" : placeholder}
          disabled={disabled}
          className={className}
          autoFocus={autoFocus}
          navigation={navigation}
          onPersonaClearForNavigation={onPersonaClearForNavigation}
        />
      </div>
    );
  },
  createHashMemoComparison(["textareaRef"]) // Use optimized hash-based comparison
);
