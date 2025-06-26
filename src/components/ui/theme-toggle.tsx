import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  size?: "sm" | "default" | "lg" | "icon-sm";
  variant?: "ghost" | "default" | "outline" | "secondary" | "action";
  className?: string;
};

export const ThemeToggle = ({
  size = "icon-sm",
  variant = "ghost",
  className,
}: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();

  // Determine icon size based on button className (for mobile responsiveness)
  const iconSize = className?.includes("h-10") ? "h-5 w-5" : "h-4 w-4";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className={cn("transition-colors duration-150", className)}
          size={size}
          variant={variant}
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <SunIcon className={iconSize} />
          ) : (
            <MoonIcon className={iconSize} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
