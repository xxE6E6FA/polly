import { CaretRightIcon, PushPinIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

type ConversationGroupProps = {
  title: string;
  children: ReactNode;
  /** Number of items in the group - shown when collapsed */
  count?: number;
  /** Whether the group can be collapsed (default: true, Pinned is never collapsible) */
  collapsible?: boolean;
  /** Initial expansion state (default: true) */
  defaultExpanded?: boolean;
};

export const ConversationGroup = ({
  title,
  children,
  count,
  collapsible = true,
  defaultExpanded = true,
}: ConversationGroupProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const isPinned = title === "Pinned";

  // Pinned group is never collapsible
  const isCollapsible = collapsible && !isPinned;

  const handleToggle = () => {
    if (isCollapsible) {
      setIsExpanded(prev => !prev);
    }
  };

  return (
    <div className="stack-sm mt-4 first:mt-0">
      <button
        type="button"
        onClick={handleToggle}
        disabled={!isCollapsible}
        aria-expanded={isCollapsible ? isExpanded : undefined}
        className={cn(
          "px-2.5 pt-2 pb-1.5 text-xs font-bold uppercase tracking-wider text-sidebar-muted flex items-center gap-1 w-full text-left",
          isCollapsible &&
            "hover:text-sidebar-foreground transition-colors cursor-pointer",
          !isCollapsible && "cursor-default"
        )}
      >
        {isCollapsible && (
          <CaretRightIcon
            className={cn(
              "h-3 w-3 flex-shrink-0 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
            aria-hidden="true"
          />
        )}
        {isPinned && (
          <PushPinIcon className="h-3.5 w-3.5 mr-0.5" weight="fill" />
        )}
        <span>{title}</span>
        {isCollapsible && count !== undefined && !isExpanded && (
          <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-sidebar-accent text-[10px] font-medium text-sidebar-foreground tabular-nums">
            {count}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="stack-xs animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
};
