import { ArrowsInIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        // Position in the input container
        "absolute top-0 right-0 z-10",
        // Subtle appear on focus/hover of the input container
        "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        "transition-opacity",
        // Circular look like Gemini
        "rounded-full"
      )}
      aria-label={isExpanded ? "Collapse input" : "Expand input to fullscreen"}
      title={isExpanded ? "Collapse input" : "Expand input"}
    >
      {isExpanded ? (
        <ArrowsInIcon className="text-muted-foreground" />
      ) : (
        <ArrowsOutIcon className="text-muted-foreground" />
      )}
    </Button>
  );
};
