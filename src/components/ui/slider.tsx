"use client";

import * as SliderPrimitive from "@base-ui/react/slider";
import type * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<
  typeof SliderPrimitive.Slider.Root
> & {
  ref?: React.Ref<HTMLDivElement>;
};

function Slider({ className, ref, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Slider.Root
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Slider.Control className="relative w-full">
        <SliderPrimitive.Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
          <SliderPrimitive.Slider.Indicator className="absolute h-full bg-primary" />
        </SliderPrimitive.Slider.Track>
        <SliderPrimitive.Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Slider.Control>
    </SliderPrimitive.Slider.Root>
  );
}

export { Slider };
