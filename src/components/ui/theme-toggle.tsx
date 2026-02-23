import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

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
  variant?: "ghost" | "default" | "outline" | "secondary";
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
  const { theme, setTheme, previewMode, endPreview } = useTheme();

  const iconSize = className?.includes("h-10") ? "size-5" : "size-4";

  const handleThemeChange = (value: string) => {
    if (value === "light" || value === "dark" || value === "system") {
      setTheme(value);
    }
  };

  return (
    <DropdownMenu
      onOpenChange={open => {
        if (!open) {
          endPreview();
        }
      }}
    >
      <DropdownMenuTrigger>
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
            onMouseEnter={() => previewMode("light")}
            className={cn(
              "pl-2",
              theme === "light" &&
                "bg-muted font-medium [&>span:first-child]:hidden"
            )}
          >
            <SunIcon className="mr-2 size-4" />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="dark"
            onMouseEnter={() => previewMode("dark")}
            className={cn(
              "pl-2",
              theme === "dark" &&
                "bg-muted font-medium [&>span:first-child]:hidden"
            )}
          >
            <MoonIcon className="mr-2 size-4" />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="system"
            onMouseEnter={() => previewMode("system")}
            className={cn(
              "pl-2",
              theme === "system" &&
                "bg-muted font-medium [&>span:first-child]:hidden"
            )}
          >
            <MonitorIcon className="mr-2 size-4" />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
