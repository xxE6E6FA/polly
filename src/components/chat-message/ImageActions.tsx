import {
  ArrowCounterClockwiseIcon,
  CopyIcon,
  DownloadIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { downloadFromUrl } from "@/lib/export";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

interface ImageActionsProps {
  imageUrl: string;
  prompt?: string;
  onRetry?: () => void;
  className?: string;
}

export const ImageActions = ({
  imageUrl,
  prompt,
  onRetry,
  className = "",
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

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyPrompt}
            disabled={isCopying || !prompt}
            className="btn-action h-7 w-7 p-0"
          >
            <CopyIcon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {prompt ? "Copy prompt to clipboard" : "No prompt available"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadImage}
            disabled={isDownloading}
            className="btn-action h-7 w-7 p-0"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Download image</TooltipContent>
      </Tooltip>

      {onRetry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="btn-action h-7 w-7 p-0"
            >
              <ArrowCounterClockwiseIcon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Retry generation with same parameters</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
