import { BrainIcon } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExtractedMemory } from "@/types";

export const CATEGORY_LABELS: Record<ExtractedMemory["category"], string> = {
  preference: "Preference",
  fact: "Fact",
  instruction: "Instruction",
};

export const CATEGORY_COLORS: Record<ExtractedMemory["category"], string> = {
  preference: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  fact: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  instruction: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function MemoryIndicator({ memories }: { memories: ExtractedMemory[] }) {
  if (!memories || memories.length === 0) {
    return null;
  }

  const label =
    memories.length === 1
      ? "Memory updated"
      : `${memories.length} memories saved`;

  return (
    <Tooltip>
      <TooltipTrigger delayDuration={200}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2",
            "text-xs text-muted-foreground",
            "transition-colors duration-150 hover:text-foreground"
          )}
        >
          <BrainIcon size={16} weight="duotone" className="shrink-0" />
          <span>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="stack-xs py-0.5">
          {memories.map((memory, i) => (
            <div
              key={`${memory.category}-${i}`}
              className="flex items-start gap-2 text-xs"
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                  CATEGORY_COLORS[memory.category]
                )}
              >
                {CATEGORY_LABELS[memory.category]}
              </span>
              <span className="text-foreground">{memory.content}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
