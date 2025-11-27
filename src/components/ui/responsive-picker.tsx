import type { ReactNode } from "react";
import { useState } from "react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  PickerTrigger,
  type PickerTriggerProps,
} from "@/components/ui/picker-trigger";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface ResponsivePickerProps {
  /** Trigger button content */
  trigger: ReactNode;
  /** Content to display in picker (shared between mobile/desktop) */
  children: ReactNode;
  /** Title for mobile drawer */
  title?: string;
  /** Tooltip text for desktop trigger */
  tooltip?: string | React.ReactNode;
  /** Whether picker is disabled */
  disabled?: boolean;
  /** Additional className for trigger button */
  triggerClassName?: string;
  /** Picker trigger variant - controls visual style */
  pickerVariant?: PickerTriggerProps["variant"];
  /** Show indicator dot for active/modified state */
  showIndicator?: boolean;
  /** Button size for trigger - "pill" for desktop with text, "icon" for mobile/icon-only */
  size?: "pill" | "icon" | "sm";
  /** Popover alignment (desktop only) */
  align?: "start" | "center" | "end";
  /** Popover side (desktop only) */
  side?: "top" | "right" | "bottom" | "left";
  /** Popover side offset (desktop only) */
  sideOffset?: number;
  /** Additional className for popover/drawer content */
  contentClassName?: string;
  /** Called when picker opens/closes */
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state */
  open?: boolean;
  /** aria-label for trigger button */
  ariaLabel?: string;
  /** @deprecated Use pickerVariant instead */
  variant?: "ghost" | "outline" | "default" | "secondary";
}

/**
 * ResponsivePicker - Unified component that renders Popover on desktop and Drawer on mobile
 * Eliminates the need for separate picker/drawer component pairs
 */
export function ResponsivePicker({
  trigger,
  children,
  title,
  tooltip,
  disabled = false,
  triggerClassName,
  pickerVariant = "default",
  showIndicator = false,
  size = "pill",
  align = "start",
  side = "top",
  sideOffset = 4,
  contentClassName,
  onOpenChange,
  open: controlledOpen,
  ariaLabel,
}: ResponsivePickerProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [internalOpen, setInternalOpen] = useState(false);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleOpenChange = (open: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(open);
    }
    onOpenChange?.(open);
  };

  // Determine the size based on desktop/mobile and explicit size prop
  const triggerSize = isDesktop ? size : "icon";

  const triggerButton = (
    <PickerTrigger
      variant={pickerVariant}
      size={triggerSize}
      disabled={disabled}
      showIndicator={showIndicator}
      className={triggerClassName}
      aria-label={ariaLabel}
    >
      {trigger}
    </PickerTrigger>
  );

  if (isDesktop) {
    return (
      <Popover
        open={disabled ? false : isOpen}
        onOpenChange={disabled ? undefined : handleOpenChange}
      >
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={props => (
                <PopoverTrigger {...props} disabled={disabled}>
                  {triggerButton}
                </PopoverTrigger>
              )}
            />
            <TooltipContent>
              <div className="text-xs">{tooltip}</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger disabled={disabled}>{triggerButton}</PopoverTrigger>
        )}
        <PopoverContent
          className={cn(
            "w-[min(calc(100vw-2rem),380px)] overflow-hidden border border-border/50 bg-popover p-0 shadow-lg",
            contentClassName
          )}
          side={side}
          sideOffset={sideOffset}
          align={align}
          rounded
        >
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild disabled={disabled}>
        {triggerButton}
      </DrawerTrigger>
      <DrawerContent>
        {title && (
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
        )}
        <DrawerBody className={contentClassName}>{children}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
