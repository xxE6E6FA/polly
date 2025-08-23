import type { Id } from "@convex/_generated/dataModel";
import { UserIcon, XIcon } from "@phosphor-icons/react";
import type React from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  useInitialHeight,
  useKeyboardNavigation,
  useTextareaHeight,
  useTextareaStyling,
} from "./hooks";
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

    const personaChipRef = useRef<HTMLSpanElement>(null);

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

    // Measure persona chip width for proper indentation
    useEffect(() => {
      if (!selectedPersonaId) {
        onPersonaChipWidthChange(0);
        return;
      }
      const measure = () => {
        const w = personaChipRef.current?.getBoundingClientRect().width;
        onPersonaChipWidthChange(Math.ceil(w || 0));
      };
      measure();
      const onResize = () => measure();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }, [selectedPersonaId, onPersonaChipWidthChange]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
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

    // Handle textarea resize when value changes
    useLayoutEffect(() => {
      resizeTextarea(textareaRef.current);
    }, [resizeTextarea, textareaRef]);

    // Reset mention active index when mention opens
    useEffect(() => {
      if (mentionOpen) {
        onMentionStateChange({
          open: mentionOpen,
          query: mentionQuery,
          activeIndex: 0,
        });
      }
    }, [mentionOpen, mentionQuery, onMentionStateChange]);

    return (
      <div className="relative w-full">
        {/* Persona chip display */}
        {selectedPersonaId && (
          <div className="absolute left-1 top-1 z-10 flex items-center gap-1 text-xs text-muted-foreground">
            <span
              ref={personaChipRef}
              className="inline-flex items-center gap-1 rounded-md bg-accent/40 px-1.5 py-0.5"
            >
              {currentPersona?.icon ? (
                <span className="text-xs">{currentPersona.icon}</span>
              ) : (
                <UserIcon className="h-3.5 w-3.5" />
              )}
              <span className="max-w-[140px] truncate">
                {currentPersona?.name || "Persona"}
              </span>
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={onPersonaClear}
                aria-label="Clear persona"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        )}

        {/* Main textarea */}
        <textarea
          ref={textareaRef}
          className={textareaClassName}
          style={textareaStyle}
          disabled={disabled}
          placeholder={selectedPersonaId ? "" : placeholder}
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
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.disabled === nextProps.disabled &&
      prevProps.className === nextProps.className &&
      prevProps.placeholder === nextProps.placeholder &&
      prevProps.autoFocus === nextProps.autoFocus &&
      prevProps.selectedPersonaId === nextProps.selectedPersonaId &&
      prevProps.currentPersona === nextProps.currentPersona &&
      prevProps.hasExistingMessages === nextProps.hasExistingMessages &&
      prevProps.mentionOpen === nextProps.mentionOpen &&
      prevProps.mentionQuery === nextProps.mentionQuery &&
      prevProps.mentionActiveIndex === nextProps.mentionActiveIndex &&
      prevProps.mentionItems === nextProps.mentionItems &&
      // Callbacks should be stable, so reference equality is fine
      prevProps.onChange === nextProps.onChange &&
      prevProps.onSubmit === nextProps.onSubmit &&
      prevProps.onPersonaClear === nextProps.onPersonaClear &&
      prevProps.onPersonaSelect === nextProps.onPersonaSelect &&
      prevProps.onPersonaChipWidthChange ===
        nextProps.onPersonaChipWidthChange &&
      prevProps.onMentionStateChange === nextProps.onMentionStateChange &&
      // Navigation props - check object reference since it's memoized
      prevProps.navigation === nextProps.navigation &&
      // Mention props - check object reference since it's memoized
      prevProps.mentions === nextProps.mentions
    );
  }
);
