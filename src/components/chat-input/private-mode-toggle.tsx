import React from "react";
import { LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PrivateModeToggleProps = {
  isPrivateMode: boolean;
  onToggle: () => void;
};

export const PrivateModeToggle = React.memo<PrivateModeToggleProps>(
  ({ isPrivateMode, onToggle }) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onToggle}
            className={cn(
              "absolute top-0 right-0 w-10 h-10 cursor-pointer transition-all duration-300 ease-out group",
              "before:absolute before:inset-0 before:transition-all before:duration-300 before:ease-out",
              isPrivateMode
                ? "before:bg-gradient-to-bl before:from-purple-200/70 before:via-purple-300/50 before:to-transparent dark:before:from-purple-800/70 dark:before:via-purple-700/50"
                : "before:bg-gradient-to-bl before:from-blue-100/50 before:via-blue-200/30 before:to-transparent dark:before:from-blue-900/50 dark:before:via-blue-800/30",
              "hover:before:from-opacity-90 hover:before:via-opacity-70",
              "active:scale-95 active:duration-100"
            )}
            style={{
              clipPath: "polygon(100% 0%, 100% 100%, 0% 0%)",
              transformOrigin: "top right",
            }}
          >
            {/* Corner fold shadow effect */}
            <div
              className={cn(
                "absolute top-0 right-0 w-full h-full transition-all duration-300 ease-out",
                "shadow-inner group-hover:shadow-md",
                isPrivateMode
                  ? "shadow-purple-400/40 dark:shadow-purple-600/30 group-hover:shadow-purple-500/60"
                  : "shadow-blue-300/30 dark:shadow-blue-700/20 group-hover:shadow-blue-400/50"
              )}
              style={{
                clipPath: "polygon(100% 0%, 100% 100%, 0% 0%)",
              }}
            />

            {/* Lock indicator */}
            <div
              className={cn(
                "absolute top-1.5 right-1.5 transition-all duration-300 ease-out",
                "group-hover:scale-110",
                isPrivateMode
                  ? "opacity-80 text-purple-700 dark:text-purple-300"
                  : "opacity-50 group-hover:opacity-70 text-blue-600 dark:text-blue-400"
              )}
            >
              {isPrivateMode ? (
                <LockSimple className="h-3.5 w-3.5" />
              ) : (
                <LockSimpleOpen className="h-3.5 w-3.5" />
              )}
            </div>

            {/* Subtle pulse animation when in private mode */}
            {isPrivateMode && (
              <div
                className="absolute inset-0 animate-pulse"
                style={{
                  clipPath: "polygon(100% 0%, 100% 100%, 0% 0%)",
                  background:
                    "linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, transparent 50%)",
                  animationDuration: "3s",
                }}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          <p>
            {isPrivateMode
              ? "Click to save messages to your account"
              : "Click for private mode (messages won't be saved)"}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }
);

PrivateModeToggle.displayName = "PrivateModeToggle";
