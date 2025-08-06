import type React from "react";
import { cn } from "@/lib/utils";
import { ImageGalleryCarousel } from "./ImageGalleryCarousel";

interface ImageGalleryProps {
  images: string[];
  aspectRatio?: string;
  onImageClick: (imageUrl: string) => void;
  messageId: string;
  className?: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  aspectRatio,
  onImageClick,
  messageId,
  className,
}) => {
  return (
    <ImageGalleryCarousel className={className}>
      {images.map((imageUrl, index) => (
        <div
          key={`${messageId}-gallery-${imageUrl}`}
          className="pl-2 md:pl-4 lg:pl-6 flex-[0_0_98%] sm:flex-[0_0_90%] md:flex-[0_0_82%] lg:flex-[0_0_75%] xl:flex-[0_0_68%]"
        >
          <div className="relative group overflow-visible">
            <button
              type="button"
              className="block w-full rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-zoom-in"
              onClick={() => onImageClick(imageUrl)}
              aria-label={`View image ${index + 1} full size`}
            >
              <img
                src={imageUrl}
                alt={`Generated content ${index + 1}`}
                className={cn(
                  "w-full object-cover rounded-lg shadow-lg",
                  aspectRatio === "1:1" && "aspect-square",
                  aspectRatio === "16:9" && "aspect-video",
                  aspectRatio === "9:16" && "aspect-[9/16]",
                  aspectRatio === "4:3" && "aspect-[4/3]",
                  aspectRatio === "3:4" && "aspect-[3/4]",
                  !aspectRatio && "aspect-square"
                )}
                loading="eager"
              />
            </button>
          </div>
        </div>
      ))}
    </ImageGalleryCarousel>
  );
};
