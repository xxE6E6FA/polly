import {
  Crop,
  DeviceMobile,
  DeviceTabletCamera,
  FrameCorners,
  MonitorPlay,
  Square,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  SelectableListItem,
  SelectableListItemIcon,
} from "@/components/ui/selectable-list-item";
import { cn } from "@/lib/utils";

interface AspectRatioDrawerProps {
  aspectRatio: string;
  onAspectRatioChange: (aspectRatio: string) => void;
  disabled?: boolean;
}

const ASPECT_RATIOS = [
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

export function AspectRatioDrawer({
  aspectRatio,
  onAspectRatioChange,
  disabled = false,
}: AspectRatioDrawerProps) {
  // Previously used for a header; selection is now indicated inline

  return (
    <Drawer>
      <DrawerTrigger>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Select aspect ratio"
          className="h-9 w-9 rounded-full p-0 sm:hidden bg-muted/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          disabled={disabled}
        >
          <Crop className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Aspect Ratio Selection</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="stack-xl">
          {/* Aspect Ratio Options */}
          <div className="stack-sm">
            <div className="text-xs font-medium text-muted-foreground px-2">
              Aspect Ratios
            </div>
            <div className="stack-sm">
              {ASPECT_RATIOS.map(ratio => {
                const Icon = ratio.icon;
                const isSelected = aspectRatio === ratio.value;

                return (
                  <SelectableListItem
                    key={ratio.value}
                    onClick={() => onAspectRatioChange(ratio.value)}
                    selected={isSelected}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <SelectableListItemIcon
                        className={cn(
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : undefined
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </SelectableListItemIcon>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{ratio.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {ratio.description}
                        </div>
                        <div className="text-xs font-mono text-primary mt-2">
                          {ratio.dimensions}
                        </div>
                      </div>
                    </div>
                  </SelectableListItem>
                );
              })}
            </div>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
