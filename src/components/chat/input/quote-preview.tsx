import { QuotesIcon, XIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

type QuotePreviewProps = {
  quote: string;
  onClear?: () => void;
  className?: string;
};

/**
 * Renders a compact quote chip shown above the chat input, similar to ChatGPT.
 * Accepts a markdown-formatted blockquote (lines starting with "> ") and
 * displays a cleaned, single block with dismiss action.
 */
export function QuotePreview({ quote, onClear, className }: QuotePreviewProps) {
  // Simple string operation - React Compiler will optimize if needed
  const displayText = quote.replace(/(^|\n)>\s?/g, "$1").trim();

  return (
    <div
      className={cn(
        "flex items-start gap-2 border bg-muted/40 px-3 py-2 text-sm",
        "shadow-sm",
        className
      )}
      role="note"
      aria-label="Quoted text"
    >
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        <QuotesIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {displayText}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Remove quoted text"
        onClick={onClear}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
