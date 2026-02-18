import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isUserModel } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { useUserIdentity, useUserUsage } from "@/providers/user-data-context";
import type { HydratedModel } from "@/types";

type AvailableModel = HydratedModel;

interface QuotaIndicatorProps {
  selectedModel: AvailableModel | null;
  className?: string;
}

function getTooltipMessage(
  isExhausted: boolean,
  isAnonymous: boolean,
  remaining: number
): string {
  if (isExhausted) {
    return isAnonymous
      ? "Sign up for more messages"
      : "Add API keys for unlimited messages";
  }
  return `${remaining} free messages remaining this month`;
}

/**
 * Shows remaining quota for built-in models.
 * Only visible when:
 * - Using a built-in (free) model (not BYOK)
 * - User has a message limit (not unlimited)
 * - Remaining messages < 10 (low quota)
 */
export function QuotaIndicator({
  selectedModel,
  className,
}: QuotaIndicatorProps) {
  const { user } = useUserIdentity();
  const { monthlyUsage, hasUnlimitedCalls, hasMessageLimit } = useUserUsage();

  // Don't show for unlimited users
  if (hasUnlimitedCalls) {
    return null;
  }

  // Don't show if no message limit
  if (!hasMessageLimit) {
    return null;
  }

  // Don't show for BYOK models (they don't count against quota)
  if (selectedModel && isUserModel(selectedModel)) {
    return null;
  }

  // Don't show while loading or no usage data
  if (!(user && monthlyUsage)) {
    return null;
  }

  const remaining = monthlyUsage.remainingMessages;
  const isLow = remaining < 10;
  const isExhausted = remaining === 0;

  // Only show when quota becomes relevant (< 10 remaining)
  if (!(isLow || isExhausted)) {
    return null;
  }

  const tooltipMessage = getTooltipMessage(
    isExhausted,
    !!user?.isAnonymous,
    remaining
  );

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full cursor-default",
          isExhausted
            ? "text-destructive bg-destructive/10"
            : "text-warning-foreground bg-warning-bg",
          className
        )}
      >
        <span>{remaining} left</span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">{tooltipMessage}</div>
      </TooltipContent>
    </Tooltip>
  );
}
