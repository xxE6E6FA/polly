import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
  /** Button variant for trigger */
  variant?: "ghost" | "outline" | "default" | "secondary";
  /** Button size for trigger */
  size?: "default" | "sm" | "lg" | "icon" | "pill";
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
  variant = "ghost",
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

  const triggerButton =
    !isDesktop || size === "icon" ? (
      <ChatInputIconButton
        disabled={disabled}
        aria-label={ariaLabel}
        variant="default"
      >
        {trigger}
      </ChatInputIconButton>
    ) : (
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        className={cn(
          "border border-border bg-muted text-foreground hover:bg-muted/80 transition-all duration-200",
          triggerClassName
        )}
        aria-label={ariaLabel}
      >
        {trigger}
      </Button>
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
