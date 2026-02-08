"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import useEmblaCarousel from "embla-carousel-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageGalleryCarouselProps {
  children: React.ReactNode;
  className?: string;
}

export const ImageGalleryCarousel: React.FC<ImageGalleryCarouselProps> = ({
  children,
  className,
}) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: false,
    skipSnaps: false,
    containScroll: false,
  });

  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const scrollPrev = React.useCallback(() => {
    emblaApi?.scrollPrev();
  }, [emblaApi]);

  const scrollNext = React.useCallback(() => {
    emblaApi?.scrollNext();
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) {
      return;
    }

    const onSelect = () => {
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  return (
    <div className={cn("relative", className)}>
      {/* Custom carousel viewport that allows overflow */}
      <div className="overflow-visible">
        <div ref={emblaRef} className="overflow-visible">
          <div className="flex -ml-2 md:-ml-4 lg:-ml-6">{children}</div>
        </div>
      </div>

      {/* Navigation buttons */}
      {canScrollPrev && (
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={scrollPrev}
          aria-label="Previous image"
        >
          <CaretLeft className="size-4" />
        </Button>
      )}
      {canScrollNext && (
        <Button
          variant="outline"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={scrollNext}
          aria-label="Next image"
        >
          <CaretRight className="size-4" />
        </Button>
      )}
    </div>
  );
};
