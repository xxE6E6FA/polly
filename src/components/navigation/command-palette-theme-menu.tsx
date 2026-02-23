import {
  CheckIcon,
  CircleHalfIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useEffect } from "react";
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import type { ColorScheme } from "@/lib/color-schemes";
import { COLOR_SCHEME_DEFINITIONS } from "@/lib/color-schemes";

type Theme = "light" | "dark" | "system";

type CommandPaletteThemeMenuProps = {
  colorScheme: ColorScheme;
  theme: Theme;
  selectedValue: string;
  onSelectColorScheme: (scheme: ColorScheme) => void;
  onSelectTheme: (theme: Theme) => void;
  previewScheme: (scheme: string) => void;
  previewMode: (mode: string) => void;
  endPreview: () => void;
};

const MODE_OPTIONS: { id: Theme; label: string; icon: typeof SunIcon }[] = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
  { id: "system", label: "System", icon: CircleHalfIcon },
];

export function CommandPaletteThemeMenu({
  colorScheme,
  theme,
  selectedValue,
  onSelectColorScheme,
  onSelectTheme,
  previewScheme,
  previewMode,
  endPreview,
}: CommandPaletteThemeMenuProps) {
  // Preview on highlight change
  useEffect(() => {
    if (selectedValue.startsWith("scheme-")) {
      previewScheme(selectedValue.replace("scheme-", ""));
    } else if (selectedValue.startsWith("mode-")) {
      previewMode(selectedValue.replace("mode-", ""));
    }
  }, [selectedValue, previewScheme, previewMode]);

  // Restore committed values on unmount
  useEffect(() => {
    return () => {
      endPreview();
    };
  }, [endPreview]);

  return (
    <>
      <CommandGroup
        heading="Color Scheme"
        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
      >
        {COLOR_SCHEME_DEFINITIONS.map(definition => {
          const isActive = colorScheme === definition.id;

          return (
            <CommandItem
              key={definition.id}
              value={`scheme-${definition.id}`}
              onSelect={() => onSelectColorScheme(definition.id)}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
            >
              <PreviewDots definition={definition} />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{definition.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {definition.description}
                </span>
              </div>
              {isActive && (
                <CheckIcon
                  className="size-4 text-primary flex-shrink-0"
                  weight="bold"
                />
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>

      <CommandSeparator className="my-2" />

      <CommandGroup
        heading="Mode"
        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-3 [&_[cmdk-group-heading]]:mb-1"
      >
        {MODE_OPTIONS.map(option => {
          const isActive = theme === option.id;
          const IconComponent = option.icon;

          return (
            <CommandItem
              key={option.id}
              value={`mode-${option.id}`}
              onSelect={() => onSelectTheme(option.id)}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors rounded-md mx-2"
            >
              <IconComponent className="size-4 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1">{option.label}</span>
              {isActive && (
                <CheckIcon
                  className="size-4 text-primary flex-shrink-0"
                  weight="bold"
                />
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}

function PreviewDots({
  definition,
}: {
  definition: (typeof COLOR_SCHEME_DEFINITIONS)[number];
}) {
  const isDark = document.documentElement.classList.contains("dark");
  const preview = isDark ? definition.preview.dark : definition.preview.light;

  return (
    <div className="flex gap-0.5 flex-shrink-0">
      <div
        className="size-3 rounded-full"
        style={{
          backgroundColor: preview.bg,
          border: "1px solid var(--color-border)",
        }}
      />
      <div
        className="size-3 rounded-full"
        style={{ backgroundColor: preview.primary }}
      />
      <div
        className="size-3 rounded-full"
        style={{ backgroundColor: preview.accent }}
      />
    </div>
  );
}
