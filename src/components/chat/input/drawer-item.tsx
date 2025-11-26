import { CheckCircle } from "@phosphor-icons/react";
import type React from "react";
import { cn } from "@/lib/utils";

interface DrawerItemProps {
  icon?: React.ReactNode;
  name: string;
  description?: string;
  badges?: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  iconWrapper?: boolean;
}

export function DrawerItem({
  icon,
  name,
  description,
  badges,
  selected,
  onClick,
  disabled = false,
  className,
  iconWrapper = true,
}: DrawerItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) {
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "w-full cursor-pointer text-sm transition-colors hover:bg-muted/50 border-b border-border/40 last:border-0 text-left",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        selected && "bg-muted/50",
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon &&
            (iconWrapper ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground border border-border/50">
                {icon}
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                {icon}
              </div>
            ))}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm truncate leading-none mb-1.5">
              {name}
            </div>
            {description && (
              <div className="text-xs text-muted-foreground truncate">
                {description}
              </div>
            )}
            {badges && (
              <div className="flex flex-wrap gap-1.5 items-center mt-1.5">
                {badges}
              </div>
            )}
          </div>
        </div>
        {selected && (
          <div className="flex shrink-0 items-center justify-center h-10 w-6">
            <CheckCircle
              className="h-5 w-5 fill-primary text-primary-foreground"
              weight="fill"
            />
          </div>
        )}
      </div>
    </button>
  );
}
