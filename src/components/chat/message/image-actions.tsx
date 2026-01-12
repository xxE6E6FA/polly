import { CaretDownIcon, CopyIcon, DownloadIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { downloadFromUrl } from "@/lib/export";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { actionButtonStyles } from "./action-button";
import {
  type AspectRatioValue,
  type ImageRetryParams,
  ImageRetryPopover,
} from "./image-retry-popover";

export type { AspectRatioValue, ImageRetryParams };

interface ImageActionsProps {
  imageUrl: string;
  prompt?: string;
  seed?: number;
  /** Current model used for this generation */
  currentModel?: string;
  /** Current aspect ratio used for this generation */
  currentAspectRatio?: string;
  /** Called when retry is triggered with new params */
  onRetry?: (params: ImageRetryParams) => void;
  className?: string;
  /** When true, only shows retry + copy prompt buttons (for canceled/failed states) */
  minimal?: boolean;
}

export const ImageActions = ({
  imageUrl,
  prompt,
  seed,
  currentModel,
  currentAspectRatio,
  onRetry,
  className = "",
  minimal = false,
}: ImageActionsProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const managedToast = useToast();

  const handleCopyPrompt = useCallback(async () => {
    if (isCopying) {
      return;
    }

    setIsCopying(true);
    try {
      if (!prompt) {
        throw new Error("No prompt available");
      }

      await navigator.clipboard.writeText(prompt);
      managedToast.success("Prompt copied to clipboard");
    } catch (error) {
      console.error("Failed to copy prompt:", error);
      managedToast.error("Failed to copy prompt", {
        description: prompt
          ? "Unable to copy prompt to clipboard."
          : "No prompt available to copy.",
      });
    } finally {
      setIsCopying(false);
    }
  }, [prompt, isCopying, managedToast]);

  const handleCopySeed = useCallback(async () => {
    if (isCopying) {
      return;
    }

    setIsCopying(true);
    try {
      if (seed === undefined) {
        throw new Error("No seed available");
      }

      await navigator.clipboard.writeText(seed.toString());
      managedToast.success("Seed copied to clipboard");
    } catch (error) {
      console.error("Failed to copy seed:", error);
      managedToast.error("Failed to copy seed", {
        description:
          seed !== undefined
            ? "Unable to copy seed to clipboard."
            : "No seed available to copy.",
      });
    } finally {
      setIsCopying(false);
    }
  }, [seed, isCopying, managedToast]);

  const handleDownloadImage = useCallback(async () => {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);
    try {
      // Generate filename from prompt or use default
      const timestamp = new Date().toISOString().split("T")[0];
      const baseFilename = prompt
        ? prompt
            .slice(0, 50)
            .replace(/[^\d\sA-Za-z-]/g, "")
            .replace(/\s+/g, "-")
            .toLowerCase()
        : "generated-image";

      // Extract file extension from URL or default to .png
      const urlPath = new URL(imageUrl).pathname;
      const extension = urlPath.split(".").pop() || "png";

      const filename = `${baseFilename}-${timestamp}.${extension}`;

      await downloadFromUrl(imageUrl, filename);
      managedToast.success("Image downloaded successfully");
    } catch (error) {
      console.error("Failed to download image:", error);
      managedToast.error("Failed to download image", {
        description: "Unable to download the image. Please try again.",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [imageUrl, prompt, isDownloading, managedToast]);

  // In minimal mode, show only copy prompt + retry
  if (minimal) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={handleCopyPrompt}
              disabled={isCopying || !prompt}
              className={cn(
                actionButtonStyles.defaultButton,
                (isCopying || !prompt) && "pointer-events-none opacity-50"
              )}
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {prompt ? "Copy prompt to clipboard" : "No prompt available"}
          </TooltipContent>
        </Tooltip>

        {onRetry && (
          <ImageRetryPopover
            currentModel={currentModel}
            currentAspectRatio={currentAspectRatio}
            onRetry={onRetry}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Show dropdown menu when seed is available, otherwise show simple button */}
      {seed !== undefined ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger>
              <DropdownMenuTrigger>
                <button
                  type="button"
                  disabled={isCopying || (!prompt && seed === undefined)}
                  className={cn(
                    actionButtonStyles.base,
                    actionButtonStyles.default,
                    "w-auto h-7 px-1.5 gap-0.5",
                    (isCopying || (!prompt && seed === undefined)) &&
                      "pointer-events-none opacity-50"
                  )}
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                  <CaretDownIcon className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Copy generation details</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onClick={handleCopyPrompt}
              disabled={!prompt}
              className="gap-2"
            >
              <CopyIcon className="h-4 w-4" />
              <span>Copy prompt</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCopySeed}
              disabled={seed === undefined}
              className="gap-2"
            >
              <CopyIcon className="h-4 w-4" />
              <span>Copy seed</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <button
              type="button"
              onClick={handleCopyPrompt}
              disabled={isCopying || !prompt}
              className={cn(
                actionButtonStyles.defaultButton,
                (isCopying || !prompt) && "pointer-events-none opacity-50"
              )}
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {prompt ? "Copy prompt to clipboard" : "No prompt available"}
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger delayDuration={200}>
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isDownloading}
            className={cn(
              actionButtonStyles.defaultButton,
              isDownloading && "pointer-events-none opacity-50"
            )}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Download image</TooltipContent>
      </Tooltip>

      {onRetry && (
        <ImageRetryPopover
          currentModel={currentModel}
          currentAspectRatio={currentAspectRatio}
          onRetry={onRetry}
        />
      )}
    </div>
  );
};
