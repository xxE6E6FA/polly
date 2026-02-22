import { memo } from "react";
import { PROFILE_ICON_MAP, PROFILE_ICON_NAMES } from "@/lib/profile-icons";
import { cn } from "@/lib/utils";

type ProfileIconPickerProps = {
  selectedIcon: string;
  onSelect: (iconName: string) => void;
};

export const ProfileIconPicker = memo(
  ({ selectedIcon, onSelect }: ProfileIconPickerProps) => {
    return (
      <div className="grid grid-cols-7 gap-0.5 max-h-[240px] overflow-y-auto p-0.5">
        {PROFILE_ICON_NAMES.map(name => {
          const IconComponent = PROFILE_ICON_MAP[name];
          if (!IconComponent) {
            return null;
          }
          const isSelected = name === selectedIcon;
          return (
            <button
              key={name}
              type="button"
              className={cn(
                "flex items-center justify-center size-9 rounded-lg transition-colors cursor-pointer",
                "hover:bg-muted",
                isSelected &&
                  "bg-primary/10 text-primary ring-1.5 ring-primary/40",
                !isSelected && "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onSelect(name)}
              title={name}
            >
              <IconComponent
                className="size-[18px]"
                weight={isSelected ? "fill" : "regular"}
              />
            </button>
          );
        })}
      </div>
    );
  }
);
