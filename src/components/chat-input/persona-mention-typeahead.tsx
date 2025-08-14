import type { Id } from "@convex/_generated/dataModel";
import { memo, useEffect, useRef } from "react";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface PersonaMentionTypeaheadProps {
  open: boolean;
  items: Array<{ id: Id<"personas"> | null; name: string; icon?: string }>;
  activeIndex: number;
  onHoverIndex?: (index: number) => void;
  onSelect: (personaId: Id<"personas"> | null) => void;
  onClose: () => void;
  className?: string;
  placement?: "top" | "bottom";
}

export const PersonaMentionTypeahead = memo(function PersonaMentionTypeahead({
  open,
  items,
  activeIndex,
  onHoverIndex,
  onSelect,
  onClose,
  className,
  placement = "bottom",
}: PersonaMentionTypeaheadProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Ensure the active option stays in view when navigating with keyboard
  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }
    const activeEl = container.querySelector(
      `[data-index="${activeIndex}"]`
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-0 z-50 w-[min(calc(100vw-2rem),360px)] overflow-hidden",
        placement === "bottom" ? "top-full mt-1" : "bottom-full mb-1",
        "rounded-md border bg-popover text-popover-foreground shadow-md",
        "border-border/50",
        className
      )}
      aria-label="Persona suggestions"
    >
      <Command className="p-1" shouldFilter={false}>
        <CommandList
          ref={listRef}
          className="max-h-64 overflow-auto overscroll-contain"
        >
          {items.length === 0 ? (
            <CommandEmpty>
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                No personas found
              </div>
            </CommandEmpty>
          ) : (
            items.map((item, index) => (
              <CommandItem
                key={`${item.id ?? "default"}-${index}`}
                data-index={index}
                value={item.name}
                onMouseEnter={() => onHoverIndex?.(index)}
                onSelect={() => {
                  onSelect(item.id ?? null);
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 text-sm",
                  index === activeIndex ? "bg-accent" : undefined
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px]">
                  {item.icon || "🤖"}
                </span>
                <span className="truncate">{item.name}</span>
              </CommandItem>
            ))
          )}
        </CommandList>
      </Command>
    </div>
  );
});
