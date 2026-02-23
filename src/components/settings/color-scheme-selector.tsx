import {
  CheckIcon,
  CircleHalfIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useTheme } from "@/hooks/use-theme";
import type { ColorScheme } from "@/lib/color-schemes";
import {
  COLOR_SCHEME_DEFINITIONS,
  type ColorSchemeDefinition,
} from "@/lib/color-schemes";
import { cn } from "@/lib/utils";

const MODE_OPTIONS = [
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
  { value: "system" as const, label: "System", icon: CircleHalfIcon },
];

function SchemeCard({
  definition,
  isActive,
  isDark,
  onSelect,
  onPreview,
}: {
  definition: ColorSchemeDefinition;
  isActive: boolean;
  isDark: boolean;
  onSelect: (id: ColorScheme) => void;
  onPreview: (id: ColorScheme) => void;
}) {
  const preview = isDark ? definition.preview.dark : definition.preview.light;

  return (
    <button
      type="button"
      onClick={() => onSelect(definition.id)}
      onMouseEnter={() => onPreview(definition.id)}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors cursor-pointer",
        "hover:bg-muted/30",
        isActive && "ring-2 ring-primary border-primary"
      )}
    >
      {isActive && (
        <div className="absolute top-2 right-2 flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-3" weight="bold" />
        </div>
      )}

      {/* Preview swatches */}
      <div className="flex gap-1.5">
        <div
          className="size-6 rounded-full border border-border/50"
          style={{ backgroundColor: preview.bg }}
        />
        <div
          className="size-6 rounded-full border border-border/50"
          style={{ backgroundColor: preview.primary }}
        />
        <div
          className="size-6 rounded-full border border-border/50"
          style={{ backgroundColor: preview.accent }}
        />
      </div>

      <div>
        <div className="font-medium text-sm">{definition.name}</div>
        <p className="text-xs text-muted-foreground">
          {definition.description}
        </p>
      </div>
    </button>
  );
}

export function ColorSchemeSelector() {
  const {
    colorScheme,
    setColorScheme,
    theme,
    setTheme,
    previewScheme,
    previewMode,
    endPreview,
  } = useTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="stack-6">
      {/* Color scheme */}
      <div>
        <div className="font-medium mb-1">Color scheme</div>
        <p className="text-sm text-muted-foreground mb-3">
          Choose a color palette for the interface
        </p>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          onMouseLeave={endPreview}
        >
          {COLOR_SCHEME_DEFINITIONS.map(definition => (
            <SchemeCard
              key={definition.id}
              definition={definition}
              isActive={colorScheme === definition.id}
              isDark={isDark}
              onSelect={setColorScheme}
              onPreview={previewScheme}
            />
          ))}
        </div>
      </div>

      {/* Mode */}
      <div>
        <div className="font-medium mb-1">Mode</div>
        <p className="text-sm text-muted-foreground mb-3">
          Switch between light and dark mode
        </p>
        <div
          className="inline-flex rounded-lg border p-1 gap-1"
          onMouseLeave={endPreview}
        >
          {MODE_OPTIONS.map(option => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                onMouseEnter={() => previewMode(option.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  theme === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
