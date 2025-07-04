import { Ghost } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatVisualMode } from "@/hooks/use-chat-visual-mode";

export const PrivateToggle = () => {
  const visualMode = useChatVisualMode();

  return (
    <div className="absolute top-4 right-4 z-10">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={visualMode.toggleMode}
            variant={visualMode.isPrivateMode ? "purple" : "ghost"}
            size="sm"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs backdrop-blur-sm",
              visualMode.isPrivateMode
                ? "shadow-lg"
                : "border border-border/40 bg-background/80 shadow-sm"
            )}
            type="button"
            aria-label={
              visualMode.isPrivateMode
                ? "Disable private mode"
                : "Enable private mode"
            }
          >
            <Ghost
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                visualMode.isPrivateMode
                  ? "text-white"
                  : "text-muted-foreground"
              )}
              weight={visualMode.isPrivateMode ? "fill" : "regular"}
            />
            <span>Private</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <p className="text-xs">
            {visualMode.isPrivateMode
              ? "Private mode active"
              : "Enable private mode"}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
