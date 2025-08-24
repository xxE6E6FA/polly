import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import { memo, useCallback, useMemo } from "react";
import { ChatInputFieldCore } from "./chat-input-field-core";
import { createHashMemoComparison } from "./hooks/use-props-hash";
import { PersonaChip } from "./persona-chip";
import { PersonaMentionTypeahead } from "./persona-mention-typeahead";
import { stripMentionText } from "./utils/mention-text-utils";

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
  // Grouped mention options
  mentions?: {
    onMentionNavigate?: (direction: "up" | "down") => boolean;
    onMentionConfirm?: () => Id<"personas"> | null;
    onMentionCancel?: () => boolean;
    onMentionSelect?: (personaId: Id<"personas"> | null) => void;
    firstLineIndentPx?: number;
  };
  // Persona-related props
  selectedPersonaId?: Id<"personas"> | null;
  currentPersona?: {
    name: string;
    icon?: string;
  } | null;
  onPersonaClear?: () => void;
  hasExistingMessages?: boolean;
  // Mention state and handlers
  mentionOpen: boolean;
  mentionQuery: string;
  mentionActiveIndex: number;
  mentionItems: Array<{
    id: Id<"personas"> | null;
    name: string;
    icon?: string;
  }>;
  onMentionStateChange: (state: {
    open: boolean;
    query: string;
    activeIndex: number;
  }) => void;
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
    mentions,
    selectedPersonaId,
    currentPersona,
    onPersonaClear,
    hasExistingMessages = false,
    mentionOpen,
    mentionQuery,
    mentionActiveIndex,
    mentionItems,
    onMentionStateChange,
    onPersonaSelect,
    onPersonaChipWidthChange,
    onPersonaClearForNavigation,
  }: ChatInputFieldProps) {
    const placement = useMemo(() => {
      const rect = textareaRef.current?.getBoundingClientRect();
      if (!rect) {
        return "bottom" as const;
      }
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 260; // approx max height inc. paddings
      return spaceBelow < dropdownHeight
        ? ("top" as const)
        : ("bottom" as const);
    }, [textareaRef]);

    const handleChange = useCallback(
      (newValue: string) => {
        onChange(newValue);

        // Handle @ mention detection
        // Disable @ mentions in all existing conversations
        const mentionsDisabled = hasExistingMessages;
        if (mentionsDisabled) {
          if (mentionOpen) {
            onMentionStateChange({ open: false, query: "", activeIndex: 0 });
          }
          return;
        }

        // If persona already selected, do not allow new mentions
        if (selectedPersonaId) {
          if (mentionOpen) {
            onMentionStateChange({ open: false, query: "", activeIndex: 0 });
          }
          return;
        }

        // Detect @ mention start: open minimal persona picker
        const selStart = textareaRef.current?.selectionStart ?? newValue.length;
        const upto = newValue.slice(0, selStart);
        const atIndex = Math.max(upto.lastIndexOf(" @"), upto.lastIndexOf("@"));
        const spaceAfter = upto.lastIndexOf(" ");
        const isAtStart = atIndex === 0 || upto[atIndex - 1] === " ";
        const hasCloserSpace = spaceAfter > atIndex;

        if (atIndex !== -1 && isAtStart && !hasCloserSpace) {
          const afterAt = upto.slice(atIndex + 1);
          // stop on whitespace/newline
          const q = afterAt.split(/\s|\n/)[0];
          onMentionStateChange({ open: true, query: q, activeIndex: 0 });
        } else if (mentionOpen) {
          onMentionStateChange({ open: false, query: "", activeIndex: 0 });
        }
      },
      [
        onChange,
        mentionOpen,
        selectedPersonaId,
        hasExistingMessages,
        onMentionStateChange,
        textareaRef,
      ]
    );

    // Handle mention selection
    const handleMentionSelect = useCallback(
      (personaId: Id<"personas"> | null) => {
        const textarea = textareaRef.current;
        const text = textarea ? textarea.value : value;
        const caret = textarea?.selectionStart ?? text.length;

        // Use the utility function to strip mention text
        const { newText, newCursorPos } = stripMentionText(text, caret);

        onChange(newText);
        onPersonaSelect(personaId);
        onMentionStateChange({ open: false, query: "", activeIndex: 0 });

        // Position cursor where the @ mention was deleted
        setTimeout(() => {
          const textarea = textareaRef.current;
          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      },
      [value, onChange, onPersonaSelect, onMentionStateChange, textareaRef]
    );

    // Handle mention close
    const handleMentionClose = useCallback(() => {
      onMentionStateChange({ open: false, query: "", activeIndex: 0 });
    }, [onMentionStateChange]);

    // Handle mention hover
    const handleMentionHover = useCallback(
      (index: number) => {
        onMentionStateChange({
          open: mentionOpen,
          query: mentionQuery,
          activeIndex: index,
        });
      },
      [mentionOpen, mentionQuery, onMentionStateChange]
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
          mentions={mentions}
          onPersonaClearForNavigation={onPersonaClearForNavigation}
        />

        {/* Persona mention typeahead */}
        {mentionOpen && (
          <PersonaMentionTypeahead
            open={mentionOpen}
            items={mentionItems}
            activeIndex={mentionActiveIndex}
            onHoverIndex={handleMentionHover}
            onSelect={handleMentionSelect}
            onClose={handleMentionClose}
            className="left-0"
            placement={placement}
          />
        )}
      </div>
    );
  },
  createHashMemoComparison(["textareaRef"]) // Use optimized hash-based comparison
);
