import {
  CheckIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  size?: "sm" | "default" | "lg" | "icon-sm";
  variant?: "ghost" | "default" | "outline" | "secondary" | "action";
  className?: string;
};

function getThemeIcon(theme: "light" | "dark" | "system", iconSize: string) {
  switch (theme) {
    case "light":
      return <SunIcon className={iconSize} />;
    case "dark":
      return <MoonIcon className={iconSize} />;
    case "system":
      return <MonitorIcon className={iconSize} />;
    default:
      return <MonitorIcon className={iconSize} />;
  }
}

function getThemeLabel(theme: "light" | "dark" | "system") {
  switch (theme) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "System";
    default:
      return "System";
  }
}

export const ThemeToggle = ({
  size = "icon-sm",
  variant = "ghost",
  className,
}: ThemeToggleProps) => {
  const { theme, setTheme } = useTheme();

  const iconSize = className?.includes("h-10") ? "h-5 w-5" : "h-4 w-4";

  const handleThemeChange = (value: string) => {
    if (value === "light" || value === "dark" || value === "system") {
      setTheme(value);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn("transition-colors duration-150", className)}
          size={size}
          variant={variant}
          title={`Theme: ${getThemeLabel(theme)}`}
        >
          {getThemeIcon(theme, iconSize)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
          <DropdownMenuRadioItem
            value="light"
            className={cn(
              "pl-2",
              theme === "light" &&
                "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
            )}
          >
            <SunIcon className="mr-2 h-4 w-4" />
            <span>Light</span>
            {theme === "light" && <CheckIcon className="ml-auto h-4 w-4" />}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="dark"
            className={cn(
              "pl-2",
              theme === "dark" &&
                "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
            )}
          >
            <MoonIcon className="mr-2 h-4 w-4" />
            <span>Dark</span>
            {theme === "dark" && <CheckIcon className="ml-auto h-4 w-4" />}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="system"
            className={cn(
              "pl-2",
              theme === "system" &&
                "bg-accent font-medium text-accent-foreground [&>span:first-child]:hidden"
            )}
          >
            <MonitorIcon className="mr-2 h-4 w-4" />
            <span>System</span>
            {theme === "system" && <CheckIcon className="ml-auto h-4 w-4" />}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
