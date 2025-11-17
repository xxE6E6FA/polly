import { CheckCircle } from "@phosphor-icons/react";
import type React from "react";
import { cn } from "@/lib/utils";

interface SelectableListItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  rightAdornment?: React.ReactNode;
}

export function SelectableListItem({
  selected = false,
  className,
  rightAdornment,
  children,
  ...props
}: SelectableListItemProps) {
  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center justify-between gap-2 p-2 rounded-md border text-left transition-colors",
        "hover:bg-muted hover:border-primary/50",
        selected ? "border-primary bg-primary/10" : "border-border",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {selected
        ? (rightAdornment ?? (
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
          ))
        : null}
    </button>
  );
}

export function SelectableListItemIcon({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md bg-muted p-1.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
