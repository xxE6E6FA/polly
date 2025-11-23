import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useBatchSelection } from "@/providers/batch-selection-context";
import type { Conversation } from "@/types";

type EditableConversationTitleProps = {
  conversation: Conversation;
  isEditing: boolean;
  isMobile: boolean;
  isCurrentConversation: boolean;
  onStartEdit: () => void;
  onSave: (newTitle: string) => void;
  onCancel: () => void;
};

export const EditableConversationTitle = memo(
  ({
    conversation,
    isEditing,
    isMobile,
    isCurrentConversation,
    onStartEdit,
    onSave,
    onCancel,
  }: EditableConversationTitleProps) => {
    const [editingTitle, setEditingTitle] = useState(conversation.title || "");
    const inputRef = useRef<HTMLInputElement>(null);
    const { isSelectionMode, toggleSelection } = useBatchSelection();

    // Reset editing title when entering edit mode
    useEffect(() => {
      if (isEditing) {
        setEditingTitle(conversation.title || "");
        // Focus input on next frame to ensure it's rendered
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    }, [isEditing, conversation.title]);

    const handleSave = useCallback(
      (e?: React.MouseEvent | React.KeyboardEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        if (editingTitle.trim()) {
          onSave(editingTitle.trim());
        } else {
          onCancel();
        }
      },
      [editingTitle, onSave, onCancel]
    );

    const handleCancel = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
      },
      [onCancel]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          handleSave(e);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      },
      [handleSave, onCancel]
    );

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (isSelectionMode) {
          e.preventDefault();
          e.stopPropagation();
          toggleSelection(conversation._id);
          return;
        }

        // Only the selected conversation becomes editable; others remain links (handled by parent)
        if (!isMobile && isCurrentConversation && !isEditing) {
          e.stopPropagation();
          e.preventDefault();
          onStartEdit();
        }
      },
      [
        isSelectionMode,
        toggleSelection,
        conversation._id,
        isMobile,
        isCurrentConversation,
        isEditing,
        onStartEdit,
      ]
    );

    const handleKeyPress = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isSelectionMode) {
            toggleSelection(conversation._id);
            return;
          }

          if (!isMobile && isCurrentConversation && !isEditing) {
            onStartEdit();
          }
        }
      },
      [
        isSelectionMode,
        toggleSelection,
        conversation._id,
        isMobile,
        isCurrentConversation,
        isEditing,
        onStartEdit,
      ]
    );

    if (isEditing) {
      return (
        <div className="flex w-full items-center gap-1">
          <Input
            ref={inputRef}
            value={editingTitle}
            onChange={e => setEditingTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 px-2 text-sm"
            onClick={e => e.preventDefault()}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-green-500 hover:bg-green-500/10 hover:text-green-600"
            onClick={handleSave}
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleCancel}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="relative flex-1 min-w-0 flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "flex-1 truncate text-sm cursor-pointer text-left bg-transparent border-none p-0",
            isMobile ? "py-3" : "py-0"
          )}
          title={conversation.title || "New Conversation"}
          onClick={handleClick}
          onKeyDown={handleKeyPress}
        >
          {conversation.title || "New Conversation"}
        </button>
      </div>
    );
  }
);
