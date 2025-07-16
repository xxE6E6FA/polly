import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type OnlineStatusProps = {
  variant?: "floating" | "inline" | "sidebar";
  className?: string;
};

export function OnlineStatus({
  variant = "floating",
  className,
}: OnlineStatusProps) {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setOnline(navigator.onLine);
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  // Only show floating version when offline
  if (variant === "floating" && online) {
    return null;
  }

  const statusContent = (
    <div
      className={cn(
        "flex items-center gap-2",
        variant === "floating" &&
          "rounded-full border border-border/50 bg-background/80 backdrop-blur-sm px-3 py-1.5 shadow-lg",
        variant === "inline" && "text-xs",
        variant === "sidebar" && "text-xs",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full transition-colors",
          variant === "floating" && "h-2 w-2",
          variant === "inline" && "h-1.5 w-1.5",
          variant === "sidebar" && "h-1.5 w-1.5",
          online ? "bg-green-500" : "bg-red-500"
        )}
      />
      {variant === "floating" && (
        <span className="text-xs font-medium text-foreground">
          {online ? "Online" : "Offline"}
        </span>
      )}
      {variant === "inline" && (
        <span className="text-muted-foreground">
          {online ? "Connected" : "Disconnected"}
        </span>
      )}
      {variant === "sidebar" && (
        <span className="text-muted-foreground">
          {online ? "Online" : "Offline"}
        </span>
      )}
    </div>
  );

  const tooltipContent = online
    ? "Connected to the internet"
    : "No internet connection";

  if (variant === "floating") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="fixed bottom-4 right-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {statusContent}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{statusContent}</TooltipTrigger>
      <TooltipContent>
        <p>{tooltipContent}</p>
      </TooltipContent>
    </Tooltip>
  );
}
