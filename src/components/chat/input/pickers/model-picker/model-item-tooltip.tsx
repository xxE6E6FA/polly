import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Wraps a model item with a tooltip explaining why it's disabled.
 * Used by both desktop (ModelItem) and mobile (DrawerModelItem) variants.
 */
export function ModelItemTooltip({
  isPollyDisabled,
  isUnavailable,
  triggerClassName,
  children,
}: {
  isPollyDisabled?: boolean;
  isUnavailable?: boolean;
  triggerClassName?: string;
  children: ReactNode;
}) {
  if (isPollyDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger className={triggerClassName}>{children}</TooltipTrigger>
        <TooltipContent>
          <div>
            <div className="font-semibold text-foreground">
              Monthly Limit Reached
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              You've used all {MONTHLY_MESSAGE_LIMIT} free messages this month.
              Switch to BYOK models for unlimited usage.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isUnavailable) {
    return (
      <Tooltip>
        <TooltipTrigger className={triggerClassName}>{children}</TooltipTrigger>
        <TooltipContent>
          <div>
            <div className="font-semibold text-foreground">
              Model No Longer Available
            </div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This model has been disabled or deprecated by its provider. Please
              remove it from Settings or select a different model.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return children;
}
