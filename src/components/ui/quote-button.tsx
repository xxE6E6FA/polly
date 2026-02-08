import { ChatCircleIcon, QuotesIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ConversationStarterPopover } from "./conversation-starter-popover";

type QuoteButtonProps = {
  selectedText: string;
  onQuote: () => void;
  rect: DOMRect;
  onLockSelection?: () => void;
  onUnlockSelection?: () => void;
  className?: string;
};

export const QuoteButton = ({
  selectedText,
  onQuote,
  rect,
  onLockSelection,
  onUnlockSelection,
  className,
}: QuoteButtonProps) => {
  const [showConversationStarters, setShowConversationStarters] =
    useState(false);

  // Position the buttons above the selection
  const style = {
    position: "fixed" as const,
    top: rect.top - 60,
    left: rect.left + rect.width / 2 - 95, // Center both buttons
    zIndex: 1000,
  };

  const handleQuote = () => {
    onQuote();
  };

  const handleShowConversationStarters = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onLockSelection?.();
    setShowConversationStarters(true);
  };

  const handleCloseConversationStarters = () => {
    setShowConversationStarters(false);
    onUnlockSelection?.();
  };

  return (
    <>
      {createPortal(
        <div
          data-conversation-starter="true"
          style={style}
          className={cn(
            "animate-in fade-in-0 zoom-in-95 duration-200",
            className
          )}
        >
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="shadow-lg hover:shadow-xl"
              onClick={handleQuote}
            >
              <QuotesIcon className="mr-1.5 size-3.5" />
              Quote
            </Button>

            <ConversationStarterPopover
              open={showConversationStarters}
              selectedText={selectedText}
              onOpenChange={open => {
                if (open) {
                  handleShowConversationStarters();
                } else {
                  handleCloseConversationStarters();
                }
              }}
            >
              <Button
                variant="secondary"
                size="sm"
                className="shadow-lg hover:shadow-xl"
                onClick={handleShowConversationStarters}
              >
                <ChatCircleIcon className="mr-1.5 size-3.5" />
                Explore
              </Button>
            </ConversationStarterPopover>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
