import { CaretRightIcon, PushPinIcon } from "@phosphor-icons/react";
import { Children, isValidElement, type ReactNode, useRef } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  const isPinned = title === "Pinned";
  const hasToggled = useRef(false);

  // Pinned group is never collapsible
  const isCollapsible = collapsible && !isPinned;

  const headingStyles =
    "px-2.5 pt-2 pb-1.5 text-xs font-bold uppercase tracking-wider text-sidebar-muted flex items-center gap-1 w-full text-left";

  const staggeredChildren = (
    <div className="stack-xs">
      {hasToggled.current
        ? Children.map(children, (child, index) => {
            const key =
              isValidElement(child) && child.key != null ? child.key : index;
            return (
              <div
                key={key}
                className="animate-list-item-in"
                style={{
                  animationDelay: `${Math.min(index * 25, 250)}ms`,
                }}
              >
                {child}
              </div>
            );
          })
        : children}
    </div>
  );

  // Pinned groups render without Collapsible wrapper
  if (!isCollapsible) {
    return (
      <div className="stack-sm mt-4 first:mt-0">
        <div className={cn(headingStyles, "cursor-default")}>
          {isPinned && (
            <PushPinIcon className="size-3.5 mr-0.5" weight="fill" />
          )}
          <span>{title}</span>
        </div>
        <div className="stack-xs">{children}</div>
      </div>
    );
  }

  return (
    <Collapsible
      defaultOpen={defaultExpanded}
      onOpenChange={() => {
        hasToggled.current = true;
      }}
      className="group/collapsible stack-sm mt-4 first:mt-0"
    >
      <CollapsibleTrigger
        className={cn(
          headingStyles,
          "hover:text-sidebar-foreground transition-colors cursor-pointer"
        )}
      >
        <CaretRightIcon
          className="size-3 flex-shrink-0 transition-transform duration-200 group-data-[open]/collapsible:rotate-90"
          aria-hidden="true"
        />
        <span>{title}</span>
        {count !== undefined && (
          <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-sidebar-accent text-overline font-medium text-sidebar-foreground tabular-nums transition-opacity duration-200 group-data-[open]/collapsible:opacity-0">
            {count}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{staggeredChildren}</CollapsibleContent>
    </Collapsible>
  );
};
