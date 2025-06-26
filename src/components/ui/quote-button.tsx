import { useState } from "react";

import { ChatCircleIcon, QuotesIcon } from "@phosphor-icons/react";
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

  // Only render on client side
  if (typeof window === "undefined") {
    return null;
  }

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
              className="h-8 border-0 bg-gradient-to-r from-[hsl(220_95%_55%)] to-[hsl(240_90%_58%)] px-3 text-white shadow-lg transition-all duration-200 hover:from-[hsl(220_95%_50%)] hover:to-[hsl(240_90%_53%)] hover:shadow-xl"
              size="sm"
              onClick={handleQuote}
            >
              <QuotesIcon className="mr-1.5 h-3.5 w-3.5" />
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
                className="h-8 border-0 bg-gradient-to-r from-[hsl(260_85%_60%)] to-[hsl(280_75%_65%)] px-3 text-white shadow-lg transition-all duration-200 hover:from-[hsl(260_85%_55%)] hover:to-[hsl(280_75%_60%)] hover:shadow-xl"
                size="sm"
                onClick={handleShowConversationStarters}
              >
                <ChatCircleIcon className="mr-1.5 h-3.5 w-3.5" />
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
