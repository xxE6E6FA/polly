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
import { DrawerItem } from "./drawer-item";

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
                  <DrawerItem
                    key={ratio.value}
                    icon={<Icon className="h-4 w-4" />}
                    name={ratio.label}
                    description={ratio.description}
                    badges={
                      <div className="text-xs font-mono text-primary">
                        {ratio.dimensions}
                      </div>
                    }
                    selected={isSelected}
                    onClick={() => onAspectRatioChange(ratio.value)}
                  />
                );
              })}
            </div>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
