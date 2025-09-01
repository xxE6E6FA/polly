import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ExpandToggleButtonProps {
  onToggle: () => void;
  isVisible: boolean;
  isExpanded: boolean;
  disabled?: boolean;
}

export const ExpandToggleButton = ({
  onToggle,
  isVisible,
  isExpanded,
  disabled = false,
}: ExpandToggleButtonProps) => {
  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "absolute top-2 right-2 z-10",
        "flex h-6 w-6 items-center justify-center rounded",
        "bg-background/80 hover:bg-background border border-border/30 hover:border-border/60",
        "transition-all duration-300 ease-in-out",
        "opacity-70 hover:opacity-100",
        "focus:outline-none focus:ring-1 focus:ring-primary/30",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transform hover:scale-105 active:scale-95"
      )}
      aria-label={isExpanded ? "Collapse input" : "Expand input to fullscreen"}
      title={isExpanded ? "Collapse input" : "Expand input"}
    >
      {isExpanded ? (
        <ArrowsInIcon className="h-3 w-3 text-muted-foreground transition-all duration-200" />
      ) : (
        <ArrowsOutIcon className="h-3 w-3 text-muted-foreground transition-all duration-200" />
      )}
    </button>
  );
};
