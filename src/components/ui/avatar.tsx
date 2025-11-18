import * as AvatarPrimitive from "@base-ui-components/react/avatar";
import * as React from "react";

import { cn } from "@/lib/utils";

const AvatarRoot = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Avatar.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Avatar.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Avatar.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
AvatarRoot.displayName = "Avatar";

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Avatar.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Avatar.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Avatar.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Avatar.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Avatar.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Avatar.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

// Export with original names for backward compatibility
export { AvatarRoot as Avatar, AvatarImage, AvatarFallback };
