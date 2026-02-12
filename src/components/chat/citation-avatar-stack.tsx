import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";
import { ActionButton } from "./message/action-button";

type CitationAvatarStackProps = {
  citations: WebSearchCitation[];
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
};

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "website";
  }
};

const getInitials = (url: string) => {
  const domain = getDomain(url);
  return domain.slice(0, 2).toUpperCase();
};

export function CitationAvatarStack({
  citations,
  isExpanded,
  onToggle,
  className,
}: CitationAvatarStackProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  const visibleCount = Math.min(citations.length, 3);
  const visibleCitations = citations.slice(0, visibleCount);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ActionButton
            size="label"
            className={cn(isExpanded && "bg-muted", className)}
          />
        }
        onClick={onToggle}
        aria-label={`${citations.length} source${citations.length === 1 ? "" : "s"}`}
      >
        <div className="flex items-center -space-x-1.5">
          {visibleCitations.map((citation, index) => (
            <Avatar
              key={citation.url || `citation-${index}`}
              className="h-4 w-4 border border-muted"
            >
              {citation.favicon ? (
                <AvatarImage
                  src={citation.favicon}
                  alt={getDomain(citation.url)}
                />
              ) : null}
              <AvatarFallback className="text-[7px] bg-muted text-muted-foreground">
                {getInitials(citation.url)}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="text-muted-foreground">
          {citations.length} source{citations.length === 1 ? "" : "s"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {citations.length} source{citations.length === 1 ? "" : "s"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
