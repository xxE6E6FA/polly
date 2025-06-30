import React from "react";
import { Ghost } from "@phosphor-icons/react";
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
          <button
            onClick={onToggle}
            className={cn(
              "absolute top-2 right-2 p-0.5 rounded-full",
              "transition-all duration-300 ease-out select-none z-10",
              "shadow-sm hover:shadow-md",
              isPrivateMode
                ? "bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700"
                : "bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800"
            )}
            type="button"
            aria-label={
              isPrivateMode ? "Disable private mode" : "Enable private mode"
            }
          >
            {/* Switch container */}
            <div className="relative w-11 h-6">
              {/* Switch thumb */}
              <div
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white",
                  "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  "shadow-sm hover:shadow-md flex items-center justify-center",
                  isPrivateMode ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              >
                <Ghost
                  className={cn(
                    "h-3 w-3 transition-all duration-300",
                    isPrivateMode
                      ? "text-purple-600 dark:text-purple-500 scale-110 rotate-12"
                      : "text-slate-400 dark:text-slate-500 scale-100"
                  )}
                  weight={isPrivateMode ? "fill" : "regular"}
                />
              </div>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          <p>
            {isPrivateMode
              ? "Private mode is on - messages won't be saved"
              : "Normal mode - messages will be saved to history"}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }
);

PrivateModeToggle.displayName = "PrivateModeToggle";
