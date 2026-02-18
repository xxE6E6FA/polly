import { GhostIcon } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";

export const PrivateToggle = () => {
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();
  const { user } = useUserDataContext();
  const navigate = useNavigate();
  const location = useLocation();

  const handleToggle = () => {
    if (isPrivateMode && location.pathname.startsWith("/private")) {
      navigate("/");
    }
    togglePrivateMode();
  };

  // Hide for anonymous users (no API keys for private mode)
  if (user?.isAnonymous) {
    return null;
  }

  // Only show on home page when private mode is OFF
  // (can't make existing Convex conversations private)
  if (isPrivateMode || location.pathname !== "/") {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-sticky">
      <Tooltip>
        <TooltipTrigger>
          <Button
            onClick={handleToggle}
            variant="primary"
            className="rounded-full"
            size="sm"
            aria-label="Enable private mode"
          >
            <GhostIcon className="size-3.5" weight="regular" />
            Private
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          <p className="text-xs">Enable private mode</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
