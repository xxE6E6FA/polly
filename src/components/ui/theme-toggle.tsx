import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  size?: "sm" | "default" | "lg" | "icon-sm";
  variant?: "ghost" | "default" | "outline" | "secondary" | "action";
  className?: string;
}

export function ThemeToggle({
  size = "icon-sm",
  variant = "ghost",
  className,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  // Determine icon size based on button className (for mobile responsiveness)
  const iconSize = className?.includes("h-10") ? "h-5 w-5" : "h-4 w-4";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={toggleTheme}
          className={cn("transition-colors duration-150", className)}
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? (
            <Sun className={iconSize} />
          ) : (
            <Moon className={iconSize} />
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
}
