import { UserIcon } from "@phosphor-icons/react";
import { memo, useCallback, useMemo, useState } from "react";
import { cn, generateHeadingId } from "@/lib/utils";
import { useSidebarWidth } from "@/providers/sidebar-width-context";
import { useUI } from "@/providers/ui-provider";
import type { ChatMessage as ChatMessageType } from "@/types";

// Constants used multiple times
const MAX_VISIBLE_ITEMS = 15;
const EXPANDED_WIDTH = 360;

// Regex patterns for markdown removal
const MARKDOWN_PATTERNS = {
  headers: /^#{1,6}\s+/gm,
  bold: /\*\*(.+?)\*\*/g,
  italic: /\*(.+?)\*/g,
  boldUnderscore: /__(.+?)__/g,
  italicUnderscore: /_(.+?)_/g,
  inlineCode: /`(.+?)`/g,
  links: /\[(.+?)]\(.+?\)/g,
  images: /!\[.*?]\(.+?\)/g,
  strikethrough: /~~(.+?)~~/g,
  lineBreaks: /\n/g,
  multipleSpaces: /\s+/g,
};

type OutlineItem = {
  id: string;
  messageId: string;
  text: string;
  preview: string;
  level: number;
  type: "user-message" | "assistant-section";
  messageIndex: number;
  parentMessageId?: string;
};

type ChatOutlineProps = {
  messages: ChatMessageType[];
  onNavigate?: (messageId: string, headingId?: string) => void;
  className?: string;
};

// Utility function to remove markdown syntax
const removeMarkdown = (text: string): string => {
  if (!text) {
    return "";
  }

  return text
    .replace(MARKDOWN_PATTERNS.headers, "")
    .replace(MARKDOWN_PATTERNS.bold, "$1")
    .replace(MARKDOWN_PATTERNS.italic, "$1")
    .replace(MARKDOWN_PATTERNS.boldUnderscore, "$1")
    .replace(MARKDOWN_PATTERNS.italicUnderscore, "$1")
    .replace(MARKDOWN_PATTERNS.inlineCode, "$1")
    .replace(MARKDOWN_PATTERNS.links, "$1")
    .replace(MARKDOWN_PATTERNS.images, "")
    .replace(MARKDOWN_PATTERNS.strikethrough, "$1")
    .replace(MARKDOWN_PATTERNS.lineBreaks, " ")
    .replace(MARKDOWN_PATTERNS.multipleSpaces, " ")
    .trim();
};

const ChatOutlineComponent = ({
  messages,
  onNavigate,
  className,
}: ChatOutlineProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isSidebarVisible, isMobile } = useUI();
  const { sidebarWidth } = useSidebarWidth();

  // Memoized function to strip markdown and truncate
  const stripAndTruncate = useCallback(
    (text: string, maxLength = 60): string => {
      const cleaned = removeMarkdown(text);

      if (cleaned.length <= maxLength) {
        return cleaned;
      }
      return `${cleaned.substring(0, maxLength).trim()}...`;
    },
    []
  );

  // Generate outline items from messages
  const outlineItems = useMemo(() => {
    const items: OutlineItem[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      if (message.role === "user") {
        items.push({
          id: message.id,
          messageId: message.id,
          text: stripAndTruncate(message.content || ""),
          preview: "",
          level: 0,
          type: "user-message",
          messageIndex: i,
        });

        // Only parse assistant headings when expanded to reduce work on navigation
        if (isExpanded) {
          const nextMessage = messages[i + 1];
          if (
            nextMessage &&
            nextMessage.role === "assistant" &&
            nextMessage.content
          ) {
            const lines = nextMessage.content.split("\n");
            let inCodeBlock = false;

            for (const line of lines) {
              if (line.trim().startsWith("```")) {
                inCodeBlock = !inCodeBlock;
                continue;
              }

              if (inCodeBlock) {
                continue;
              }

              const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
              if (headingMatch) {
                const level = headingMatch[1].length;
                const rawText = headingMatch[2].trim();
                const cleanText = removeMarkdown(rawText);
                const headingId = generateHeadingId(rawText, nextMessage.id);

                items.push({
                  id: headingId,
                  messageId: nextMessage.id,
                  text: cleanText,
                  preview: "",
                  level,
                  type: "assistant-section",
                  messageIndex: i + 1,
                  parentMessageId: message.id,
                });
              }
            }
          }
        }
      }
    }

    return items;
  }, [messages, stripAndTruncate, isExpanded]);

  const handleItemClick = useCallback(
    (item: OutlineItem) => {
      const headingId = item.type === "assistant-section" ? item.id : undefined;
      onNavigate?.(item.messageId, headingId);
    },
    [onNavigate]
  );

  // Calculate display parameters for collapsed state
  const collapsedConfig = useMemo(() => {
    const visibleCount = Math.min(outlineItems.length, MAX_VISIBLE_ITEMS);
    const remainingCount = Math.max(0, outlineItems.length - MAX_VISIBLE_ITEMS);

    // Calculate height: 8px per dot + 6px gaps + 24px container padding + 32px counter (8px margin + 24px height)
    const dotsHeight = visibleCount * 8 + (visibleCount - 1) * 6;
    const containerPadding = 24; // py-3 = 12px top + 12px bottom
    const counterHeight = remainingCount > 0 ? 32 : 0; // 24px height + 8px margin-top
    const totalHeight = dotsHeight + containerPadding + counterHeight;

    return {
      visibleItems: outlineItems.slice(0, MAX_VISIBLE_ITEMS),
      remainingCount,
      height: totalHeight,
    };
  }, [outlineItems]);

  // Early return for edge cases
  if (outlineItems.length <= 1 || isMobile) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-1/2 -translate-y-1/2 z-10 transition-all duration-300 ease-out",
        className
      )}
      style={{
        left: isSidebarVisible ? `${sidebarWidth + 12}px` : "12px",
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Smooth morphing container */}
      <div
        className={cn(
          "relative overflow-hidden bg-card shadow-lg backdrop-blur-sm transition-all duration-300 ease-out hover:shadow-xl",
          isExpanded ? "rounded-xl" : "rounded-[14px] w-7"
        )}
        style={{
          width: isExpanded ? `${EXPANDED_WIDTH}px` : undefined,
          height: isExpanded ? "auto" : `${collapsedConfig.height}px`,
          maxHeight: isExpanded ? "calc(80vh - 60px)" : "none",
        }}
      >
        {/* Main content - always rendered */}
        <div className="relative h-full">
          {/* Header */}
          <div
            className={cn(
              "sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-4 py-3 transition-opacity duration-300",
              !isExpanded && "opacity-0"
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Conversation Outline
              </p>
              <p className="text-xs text-muted-foreground/60">
                {outlineItems.length} items
              </p>
            </div>
          </div>

          {/* Scrollable content */}
          <div
            className={cn(
              "overflow-y-auto overflow-x-hidden overscroll-contain transition-opacity duration-300",
              !isExpanded && "opacity-0"
            )}
            style={{
              maxHeight: isExpanded
                ? "calc(80vh - 120px)"
                : `${collapsedConfig.height}px`,
              width: `${EXPANDED_WIDTH}px`,
            }}
          >
            <div className="py-3">
              {outlineItems.map(item => {
                const indentLevel =
                  item.type === "assistant-section"
                    ? 0.5 + (item.level - 1) * 0.5
                    : 0;

                return (
                  <button
                    key={item.id}
                    className={cn(
                      "w-full text-left transition-all duration-150 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none group/item relative focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      item.type === "user-message"
                        ? "px-3 py-2.5 border-l-2 border-transparent hover:border-primary/40 hover:bg-primary/5"
                        : "px-3 py-1.5 hover:bg-muted/30"
                    )}
                    style={{
                      paddingLeft:
                        item.type === "assistant-section"
                          ? `${16 + indentLevel * 12}px`
                          : undefined,
                    }}
                    onClick={() => handleItemClick(item)}
                    disabled={!isExpanded}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {item.type === "user-message" ? (
                        <>
                          <UserIcon className="size-4 shrink-0 text-primary/80" />
                          <div className="line-clamp-2 min-w-0 text-xs font-medium leading-relaxed text-foreground/90">
                            {item.text}
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={cn(
                              "size-1.5 rounded-full bg-muted-foreground/40 shrink-0 transition-colors",
                              item.level === 1 &&
                                "size-2 bg-muted-foreground/50",
                              item.level === 2 && "size-1.5",
                              item.level >= 3 && "size-1 bg-muted-foreground/30"
                            )}
                          />
                          <div className="truncate text-xs text-muted-foreground/70 group-hover/item:text-muted-foreground/90 transition-colors">
                            {item.text}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Progress indicator on hover */}
                    <div
                      className="absolute left-0 top-0 h-full w-0.5 bg-primary/40 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer with scroll indicator */}
          {outlineItems.length > 20 && isExpanded && (
            <div className="sticky bottom-0 h-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none" />
          )}

          {/* Collapsed state indicators - overlay on top */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center py-3 pointer-events-none",
              isExpanded
                ? "opacity-0 invisible"
                : "opacity-100 visible transition-opacity duration-300 delay-100"
            )}
          >
            <div className="flex flex-col items-center gap-1.5">
              {collapsedConfig.visibleItems.map((item, index) => (
                <div
                  key={`indicator-${item.id}`}
                  className={cn(
                    "rounded-full w-2 h-2",
                    item.type === "user-message"
                      ? "bg-primary/80"
                      : "bg-muted-foreground/40"
                  )}
                  style={{
                    opacity:
                      1 - (index / collapsedConfig.visibleItems.length) * 0.3,
                  }}
                  title={
                    item.type === "user-message"
                      ? `User: ${item.text}`
                      : item.text
                  }
                />
              ))}
            </div>
            {collapsedConfig.remainingCount > 0 && (
              <div className="mt-2 text-[10px] font-medium text-muted-foreground/60">
                +{collapsedConfig.remainingCount}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatOutline = memo(ChatOutlineComponent);
