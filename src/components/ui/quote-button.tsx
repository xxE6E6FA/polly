import { createPortal } from "react-dom";
import { QuotesIcon, ChatCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ConversationStarterPopover } from "./conversation-starter-popover";

interface QuoteButtonProps {
  selectedText: string;
  onQuote: () => void;
  rect: DOMRect;
  onLockSelection?: () => void;
  onUnlockSelection?: () => void;
  className?: string;
}

export function QuoteButton({
  selectedText,
  onQuote,
  rect,
  onLockSelection,
  onUnlockSelection,
  className,
}: QuoteButtonProps) {
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
          style={style}
          className={cn(
            "animate-in fade-in-0 zoom-in-95 duration-200",
            className
          )}
          data-conversation-starter="true"
        >
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleQuote}
              className="h-8 px-3 bg-gradient-to-r from-[hsl(220_95%_55%)] to-[hsl(240_90%_58%)] hover:from-[hsl(220_95%_50%)] hover:to-[hsl(240_90%_53%)] text-white shadow-lg hover:shadow-xl border-0 transition-all duration-200"
            >
              <QuotesIcon className="h-3.5 w-3.5 mr-1.5" />
              Quote
            </Button>

            <ConversationStarterPopover
              selectedText={selectedText}
              open={showConversationStarters}
              onOpenChange={open => {
                if (open) {
                  handleShowConversationStarters();
                } else {
                  handleCloseConversationStarters();
                }
              }}
            >
              <Button
                size="sm"
                className="h-8 px-3 bg-gradient-to-r from-[hsl(260_85%_60%)] to-[hsl(280_75%_65%)] hover:from-[hsl(260_85%_55%)] hover:to-[hsl(280_75%_60%)] text-white shadow-lg hover:shadow-xl border-0 transition-all duration-200"
                onClick={handleShowConversationStarters}
              >
                <ChatCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                Explore
              </Button>
            </ConversationStarterPopover>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
