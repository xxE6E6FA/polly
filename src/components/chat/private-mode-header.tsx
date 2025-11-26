import { GhostIcon, X } from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivateMode } from "@/providers/private-mode-context";

export const PrivateModeHeader = () => {
  const { isPrivateMode, togglePrivateMode } = usePrivateMode();
  const navigate = useNavigate();
  const location = useLocation();

  const handleClose = () => {
    if (isPrivateMode && location.pathname.startsWith("/private")) {
      navigate("/");
    }
    togglePrivateMode();
  };

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-between mx-6 py-2 transition-transform duration-300 ease-in-out",
        isPrivateMode ? "translate-y-0" : "-translate-y-full"
      )}
    >
      <div className="ml-2 flex items-center gap-2 text-background">
        <GhostIcon weight="fill" className="h-5 w-5" />
        <span className="text-sm font-medium">Private Mode</span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleClose}
        className="h-8 w-8 text-background/80 hover:text-background hover:bg-background/20"
        title="Exit Private Mode"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
