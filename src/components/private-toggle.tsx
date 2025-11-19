import { GhostIcon } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";

export const PrivateToggle = () => {
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const location = useLocation();

  const handleToggle = () => {
    if (isPrivateMode && location.pathname.startsWith("/private")) {
      navigate("/");
    }
    togglePrivateMode();
  };

  if (!isPrivateMode || location.pathname.startsWith("/chat")) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-50">
      <Tooltip>
        <TooltipTrigger>
          <Button
            onClick={handleToggle}
            variant={isPrivateMode ? "default" : "ghost"}
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
            <span className={cn(isPrivateMode && "text-white")}>Private</span>
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
