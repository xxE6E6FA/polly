import { useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EditableConversationTitleProps = {
  title: string;
  isEditing: boolean;
  isCurrentConversation: boolean;
  isMobile: boolean;
  hasActionsVisible?: boolean;
  onStartEdit: () => void;
  onSaveEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
};

// Custom hook for handling click outside
const useClickOutside = (
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void
) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
};

export const EditableConversationTitle = ({
  title,
  isEditing,
  isCurrentConversation,
  isMobile,
  hasActionsVisible = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: EditableConversationTitleProps) => {
  const [editingTitle, setEditingTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const wasInputFocusedRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setEditingTitle(title);
      setOriginalTitle(title);
      wasInputFocusedRef.current = false;
    }
  }, [isEditing, title]);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      });
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (editingTitle.trim() && editingTitle !== originalTitle) {
      onSaveEdit(editingTitle.trim());
    } else {
      onCancelEdit();
    }
  }, [editingTitle, originalTitle, onSaveEdit, onCancelEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) {
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelEdit();
      }
    },
    [handleSave, onCancelEdit]
  );

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (wasInputFocusedRef.current) {
      handleSave();
    }
  }, [handleSave]);

  const handleFocus = useCallback(() => {
    wasInputFocusedRef.current = true;
    setIsFocused(true);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only the selected conversation becomes editable; others remain links
      if (!isMobile && isCurrentConversation && !isEditing) {
        e.stopPropagation();
        e.preventDefault();
        onStartEdit();
      }
    },
    [isMobile, isCurrentConversation, isEditing, onStartEdit]
  );

  // Handle click outside to exit edit mode
  const handleClickOutside = useCallback(() => {
    if (isEditing && wasInputFocusedRef.current && editInputRef.current) {
      // Clear text selection
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }

      // Blur the input to remove focus state
      editInputRef.current.blur();

      // Then handle save/cancel logic
      handleSave();
    }
  }, [isEditing, handleSave]);

  useClickOutside(editInputRef, handleClickOutside);

  return (
    <div
      className="relative w-full"
      style={
        hasActionsVisible && !(isEditing || isFocused)
          ? ({
              maskImage:
                "linear-gradient(to right, black 0%, black calc(100% - 64px), transparent 100%)",
              // biome-ignore lint/style/useNamingConvention: CSS property requires PascalCase
              WebkitMaskImage:
                "linear-gradient(to right, black 0%, black calc(100% - 64px), transparent 100%)",
            } as React.CSSProperties)
          : ({
              maskImage: "none",
              // biome-ignore lint/style/useNamingConvention: CSS property requires PascalCase
              WebkitMaskImage: "none",
            } as React.CSSProperties)
      }
    >
      {isEditing ? (
        <Input
          ref={editInputRef}
          value={editingTitle}
          className={cn(
            // Ultra-minimal: caret only (no bg/border/radius/ring)
            "h-auto w-full font-medium bg-transparent p-0 text-left",
            "border-0 rounded-none",
            // Kill default input effects from the base component
            "shadow-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            "hover:bg-transparent focus-visible:bg-transparent focus-visible:border-0",
            isMobile ? "text-xs" : "text-xs",
            "selectable-auto"
          )}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onChange={e => setEditingTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={e => {
            e.stopPropagation();
          }}
        />
      ) : (
        <span
          className={cn(
            "block truncate text-left font-medium",
            isMobile ? "text-xs" : "text-xs",
            // Suggest edit affordance only on the current conversation
            isCurrentConversation && !isMobile
              ? "cursor-text hover:opacity-80"
              : "cursor-default"
          )}
          onClick={handleClick}
          onKeyDown={e => {
            if (
              (e.key === "Enter" || e.key === " ") &&
              !isMobile &&
              isCurrentConversation &&
              !isEditing
            ) {
              e.preventDefault();
              onStartEdit();
            }
          }}
          tabIndex={isCurrentConversation && !isMobile ? 0 : -1}
        >
          {title}
        </span>
      )}
    </div>
  );
};
