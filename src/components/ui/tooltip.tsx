import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = ({
  delayDuration = 200,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    disableHoverableContent={disableHoverableContent}
    {...props}
  />
);

const TooltipRoot = TooltipPrimitive.Root;

const Tooltip = ({
  disableOnTouch = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> & {
  disableOnTouch?: boolean;
}) => {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);

  React.useEffect(() => {
    // Check if device supports touch
    const checkTouchDevice = () => {
      setIsTouchDevice(
        "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          // @ts-expect-error - IE specific property
          navigator.msMaxTouchPoints > 0
      );
    };

    checkTouchDevice();

    // Listen for touch events to detect touch usage
    const handleTouchStart = () => setIsTouchDevice(true);
    const handleMouseMove = () => {
      // Only set to false if we haven't detected touch in this session
      if (!sessionStorage.getItem("touch-detected")) {
        setIsTouchDevice(false);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { once: true });
    document.addEventListener("mousemove", handleMouseMove, { once: true });

    if (isTouchDevice) {
      sessionStorage.setItem("touch-detected", "true");
    }

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isTouchDevice]);

  // Disable tooltip on touch devices if disableOnTouch is true
  if (disableOnTouch && isTouchDevice) {
    return null;
  }

  return <TooltipRoot {...props} />;
};

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onPointerEnter, onPointerLeave, onFocus, onBlur, ...props }, ref) => {
  const [_isHovered, setIsHovered] = React.useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  const handlePointerEnter = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Clear any pending leave timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsHovered(true);
    onPointerEnter?.(event);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    setIsHovered(false);

    // Add a small delay to prevent flickering when quickly moving between elements
    timeoutRef.current = setTimeout(() => {
      onPointerLeave?.(event);
    }, 100);
  };

  const handleFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    onFocus?.(event);
  };

  const handleBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    setIsHovered(false);
    onBlur?.(event);
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  );
});

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[100] overflow-hidden rounded border border-border bg-background/95 backdrop-blur-xs px-2 py-1.5 text-xs text-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin] max-w-xs [&_p]:m-0 [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_h4]:m-0 [&_h5]:m-0 [&_h6]:m-0",
        className
      )}
      onPointerDownOutside={e => e.preventDefault()}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
