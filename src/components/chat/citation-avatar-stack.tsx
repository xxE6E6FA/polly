import { LinkIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WebSearchCitation } from "@/types";

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
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            "btn-action h-7 px-1 gap-1.5",
            isExpanded && "bg-muted",
            className
          )}
          aria-label={`${citations.length} source${citations.length === 1 ? "" : "s"}`}
        >
          <div className="flex items-center -space-x-2">
            {visibleCitations.map((citation, index) => (
              <Avatar
                key={citation.url || `citation-${index}`}
                className="h-5 w-5 border-2 border-muted"
              >
                {citation.favicon ? (
                  <AvatarImage
                    src={citation.favicon}
                    alt={getDomain(citation.url)}
                  />
                ) : null}
                <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                  {getInitials(citation.url)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {citations.length} source{citations.length === 1 ? "" : "s"}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {citations.length} source{citations.length === 1 ? "" : "s"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
