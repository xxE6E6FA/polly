import * as AvatarPrimitive from "@base-ui-components/react/avatar";
import type * as React from "react";

import { cn } from "@/lib/utils";

type AvatarProps = React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Avatar.Root
> & {
  ref?: React.Ref<React.ElementRef<typeof AvatarPrimitive.Avatar.Root>>;
};

function Avatar({ className, ref, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Avatar.Root
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

type AvatarImageProps = React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Avatar.Image
> & {
  ref?: React.Ref<React.ElementRef<typeof AvatarPrimitive.Avatar.Image>>;
};

function AvatarImage({ className, ref, ...props }: AvatarImageProps) {
  return (
    <AvatarPrimitive.Avatar.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  );
}

type AvatarFallbackProps = React.ComponentPropsWithoutRef<
  typeof AvatarPrimitive.Avatar.Fallback
> & {
  ref?: React.Ref<React.ElementRef<typeof AvatarPrimitive.Avatar.Fallback>>;
};

function AvatarFallback({ className, ref, ...props }: AvatarFallbackProps) {
  return (
    <AvatarPrimitive.Avatar.Fallback
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
