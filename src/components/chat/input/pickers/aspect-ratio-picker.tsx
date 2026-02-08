import {
  Crop,
  DeviceMobile,
  DeviceTabletCamera,
  FrameCorners,
  MonitorPlay,
  Square,
} from "@phosphor-icons/react";
import { memo } from "react";
import {
  PickerOptionCompact,
  PickerSection,
} from "@/components/ui/picker-content";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DrawerItem } from "../drawer-item";

interface AspectRatioPickerProps {
  aspectRatio?: string;
  onAspectRatioChange: (aspectRatio: string) => void;
  disabled?: boolean;
  className?: string;
}

const ASPECT_RATIOS_DESKTOP = [
  { value: "1:1", label: "Square", icon: Square },
  { value: "16:9", label: "Landscape", icon: MonitorPlay },
  { value: "9:16", label: "Portrait", icon: DeviceMobile },
  { value: "4:3", label: "Standard", icon: FrameCorners },
  { value: "3:4", label: "Tall", icon: DeviceTabletCamera },
];

const ASPECT_RATIOS_MOBILE = [
  {
    value: "1:1",
    label: "Square",
    icon: Square,
    description: "Perfect for profile pictures, logos, and social media",
    dimensions: "1024×1024",
  },
  {
    value: "16:9",
    label: "Landscape",
    icon: MonitorPlay,
    description: "Wide format for desktop wallpapers and presentations",
    dimensions: "1024×576",
  },
  {
    value: "9:16",
    label: "Portrait",
    icon: DeviceMobile,
    description: "Tall format for mobile wallpapers and stories",
    dimensions: "576×1024",
  },
  {
    value: "4:3",
    label: "Standard",
    icon: FrameCorners,
    description: "Classic format for traditional photography",
    dimensions: "1024×768",
  },
  {
    value: "3:4",
    label: "Tall",
    icon: DeviceTabletCamera,
    description: "Vertical format for book covers and posters",
    dimensions: "768×1024",
  },
];

export const AspectRatioPicker = memo<AspectRatioPickerProps>(
  ({
    aspectRatio = "1:1",
    onAspectRatioChange,
    disabled = false,
    className = "",
  }) => {
    const isDesktop = useMediaQuery("(min-width: 640px)");

    // Direct prop usage - React Compiler will optimize if needed
    const handleRatioSelect = onAspectRatioChange;

    const selectedRatio = ASPECT_RATIOS_DESKTOP.find(
      r => r.value === aspectRatio
    );
    const displayText = selectedRatio?.label || "Square";

    let iconElement;
    if (selectedRatio) {
      iconElement = <selectedRatio.icon className="size-4 text-current" />;
    } else if (isDesktop) {
      iconElement = <Square className="size-4 text-current" />;
    } else {
      iconElement = <Crop className="size-4" />;
    }

    const triggerContent = (
      <>
        {iconElement}
        {isDesktop && <span className="hidden sm:inline">{displayText}</span>}
      </>
    );

    return (
      <div className={className}>
        <ResponsivePicker
          trigger={triggerContent}
          title="Aspect Ratio Selection"
          tooltip="Select aspect ratio"
          disabled={disabled}
          pickerVariant="default"
          contentClassName={isDesktop ? "w-52 p-0" : "stack-xl"}
          align="start"
          ariaLabel="Select aspect ratio"
        >
          {isDesktop ? (
            <AspectRatioListDesktop
              aspectRatio={aspectRatio}
              onSelect={handleRatioSelect}
            />
          ) : (
            <AspectRatioListMobile
              aspectRatio={aspectRatio}
              onSelect={handleRatioSelect}
            />
          )}
        </ResponsivePicker>
      </div>
    );
  }
);

AspectRatioPicker.displayName = "AspectRatioPicker";

interface AspectRatioListDesktopProps {
  aspectRatio: string;
  onSelect: (ratio: string) => void;
}

const AspectRatioListDesktop = ({
  aspectRatio,
  onSelect,
}: AspectRatioListDesktopProps) => {
  return (
    <PickerSection>
      {ASPECT_RATIOS_DESKTOP.map(ratio => (
        <PickerOptionCompact
          key={ratio.value}
          label={ratio.label}
          icon={<ratio.icon size={14} />}
          suffix={ratio.value}
          selected={aspectRatio === ratio.value}
          onClick={() => onSelect(ratio.value)}
        />
      ))}
    </PickerSection>
  );
};

interface AspectRatioListMobileProps {
  aspectRatio: string;
  onSelect: (ratio: string) => void;
}

const AspectRatioListMobile = ({
  aspectRatio,
  onSelect,
}: AspectRatioListMobileProps) => {
  return (
    <div className="stack-sm">
      <div className="text-xs font-medium text-muted-foreground px-2">
        Aspect Ratios
      </div>
      <div className="stack-sm">
        {ASPECT_RATIOS_MOBILE.map(ratio => {
          const Icon = ratio.icon;
          const isSelected = aspectRatio === ratio.value;

          return (
            <DrawerItem
              key={ratio.value}
              icon={<Icon className="size-4" />}
              name={ratio.label}
              description={ratio.description}
              badges={
                <div className="text-xs font-mono text-primary">
                  {ratio.dimensions}
                </div>
              }
              selected={isSelected}
              onClick={() => onSelect(ratio.value)}
            />
          );
        })}
      </div>
    </div>
  );
};
