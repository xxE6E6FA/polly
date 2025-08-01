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
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        onCancelEdit();
      }
    },
    [handleSave, onCancelEdit]
  );

  const handleBlur = useCallback(() => {
    if (wasInputFocusedRef.current) {
      handleSave();
    }
  }, [handleSave]);

  const handleFocus = useCallback(() => {
    wasInputFocusedRef.current = true;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
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
        isEditing
          ? undefined
          : ({
              maskImage: hasActionsVisible
                ? "linear-gradient(to right, black 0%, black calc(100% - 80px), transparent 100%)"
                : "linear-gradient(to right, black 0%, black calc(100% - 16px), transparent 100%)",
              // biome-ignore lint/style/useNamingConvention: CSS property requires PascalCase
              WebkitMaskImage: hasActionsVisible
                ? "linear-gradient(to right, black 0%, black calc(100% - 80px), transparent 100%)"
                : "linear-gradient(to right, black 0%, black calc(100% - 16px), transparent 100%)",
            } as React.CSSProperties)
      }
    >
      <Input
        ref={editInputRef}
        value={isEditing ? editingTitle : title}
        readOnly={!isEditing}
        className={cn(
          "h-auto font-medium shadow-none outline-none ring-0 focus-visible:ring-0",
          isMobile ? "text-xs" : "text-xs",
          "border-0 bg-transparent p-0",
          !isEditing && "cursor-default",
          !(isEditing || isMobile) &&
            isCurrentConversation &&
            "cursor-text hover:opacity-80",
          // Enable text selection when editing
          isEditing && "selectable-auto"
        )}
        onBlur={isEditing ? handleBlur : undefined}
        onFocus={isEditing ? handleFocus : undefined}
        onChange={isEditing ? e => setEditingTitle(e.target.value) : undefined}
        onKeyDown={isEditing ? handleKeyDown : undefined}
        onClick={
          isEditing
            ? e => {
                e.stopPropagation();
                e.preventDefault();
              }
            : handleClick
        }
        onMouseDown={
          isEditing
            ? e => {
                e.stopPropagation();
              }
            : undefined
        }
      />
    </div>
  );
};
