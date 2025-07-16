import { GhostIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { cn } from "@/lib/utils";

export const PrivateToggle = () => {
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();

  return (
    <div className="absolute top-4 right-4 z-10">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={togglePrivateMode}
            variant={isPrivateMode ? "purple" : "ghost"}
            size="sm"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs backdrop-blur-sm",
              isPrivateMode
                ? "shadow-lg"
                : "border border-border/40 bg-background/80 shadow-sm"
            )}
            type="button"
            aria-label={
              isPrivateMode ? "Disable private mode" : "Enable private mode"
            }
          >
            <GhostIcon
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                isPrivateMode ? "text-white" : "text-muted-foreground"
              )}
              weight={isPrivateMode ? "fill" : "regular"}
            />
            <span>Private</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <p className="text-xs">
            {isPrivateMode ? "Private mode active" : "Enable private mode"}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
