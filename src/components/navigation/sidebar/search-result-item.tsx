import { RobotIcon, UserIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/routes";
import { highlightMatches } from "@/lib/search-highlight";
import { cn } from "@/lib/utils";
import type { ConversationSearchResult, MessageMatch } from "@/types";

type SearchResultItemProps = {
  result: ConversationSearchResult;
  searchQuery: string;
  isMobile: boolean;
  onCloseSidebar: () => void;
};

const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  const segments = highlightMatches(text, query);
  let offset = 0;
  return (
    <>
      {segments.map(segment => {
        const key = offset;
        offset += segment.text.length;
        return (
          <span
            key={key}
            className={
              segment.isMatch ? "bg-primary/15 rounded-sm px-0.5" : undefined
            }
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
};

const MessageMatchItem = memo(
  ({
    match,
    conversationId,
    searchQuery,
    isMobile,
    onCloseSidebar,
  }: {
    match: MessageMatch;
    conversationId: string;
    searchQuery: string;
    isMobile: boolean;
    onCloseSidebar: () => void;
  }) => {
    const isAssistant = match.role === "assistant";
    const Icon = isAssistant ? RobotIcon : UserIcon;
    const url = `${ROUTES.CHAT_CONVERSATION(conversationId)}?m=${match.messageId}`;

    return (
      <Link
        to={url}
        onClick={() => {
          if (isMobile) {
            onCloseSidebar();
          }
        }}
        className="group/match flex items-start gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <Icon
          className="mt-0.5 size-3 flex-shrink-0 opacity-50"
          weight={isAssistant ? "fill" : "regular"}
        />
        <span className="line-clamp-2 min-w-0 break-words">
          <HighlightedText text={match.snippet} query={searchQuery} />
        </span>
      </Link>
    );
  }
);

MessageMatchItem.displayName = "MessageMatchItem";

export const SearchResultItem = memo(
  ({
    result,
    searchQuery,
    isMobile,
    onCloseSidebar,
  }: SearchResultItemProps) => {
    const conversationUrl = ROUTES.CHAT_CONVERSATION(result.conversationId);
    const hasMessageMatches = result.messageMatches.length > 0;
    const showTitleHighlight =
      result.matchedIn === "title" || result.matchedIn === "both";

    return (
      <div className="stack-xs py-0.5">
        <Link
          to={conversationUrl}
          onClick={() => {
            if (isMobile) {
              onCloseSidebar();
            }
          }}
          className={cn(
            "flex items-center rounded-lg px-2 py-1.5 text-sm font-medium",
            "text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
            "truncate"
          )}
        >
          <span className="truncate">
            {showTitleHighlight ? (
              <HighlightedText text={result.title} query={searchQuery} />
            ) : (
              result.title
            )}
          </span>
        </Link>

        {hasMessageMatches ? (
          <div className="ml-1 stack-xs border-l border-border/50 pl-1">
            {result.messageMatches.map(match => (
              <MessageMatchItem
                key={match.messageId}
                match={match}
                conversationId={result.conversationId}
                searchQuery={searchQuery}
                isMobile={isMobile}
                onCloseSidebar={onCloseSidebar}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }
);

SearchResultItem.displayName = "SearchResultItem";
