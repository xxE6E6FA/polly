import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  FileCodeIcon,
  FilePdfIcon,
  FileTextIcon,
  FilmStripIcon,
  PaperclipIcon,
  PlayIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { Spinner } from "@/components/ui/spinner";
import type { Attachment } from "@/types";

function getFileIcon(
  attachment: Attachment,
  size: "sm" | "md" = "md",
  className?: string
) {
  const defaultSizeClasses = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const sizeClasses = className
    ? `${className} flex-shrink-0`
    : defaultSizeClasses;

  if (attachment.type === "pdf") {
    return <FilePdfIcon className={`${sizeClasses} text-muted-foreground`} />;
  }

  if (attachment.type === "audio") {
    return (
      <SpeakerHighIcon className={`${sizeClasses} text-muted-foreground`} />
    );
  }

  if (attachment.type === "video") {
    return <FilmStripIcon className={`${sizeClasses} text-muted-foreground`} />;
  }

  if (attachment.type === "text") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();

    const isTextFile =
      extension &&
      [
        "txt",
        "text",
        "md",
        "markdown",
        "mdx",
        "rtf",
        "log",
        "csv",
        "tsv",
      ].includes(extension);

    if (isTextFile) {
      return (
        <FileTextIcon className={`${sizeClasses} text-muted-foreground`} />
      );
    }

    return <FileCodeIcon className={`${sizeClasses} text-muted-foreground`} />;
  }

  return <PaperclipIcon className={`${sizeClasses} text-muted-foreground`} />;
}

type FileDisplayProps = {
  attachment: Attachment;
  className?: string;
  onClick?: () => void;
};

export const FileDisplay = ({
  attachment,
  className = "",
  onClick,
}: FileDisplayProps) => {
  // If we have a storageId, get the URL from Convex
  const convexFileUrl = useQuery(
    api.fileStorage.getFileUrl,
    attachment.storageId
      ? { storageId: attachment.storageId as Id<"_storage"> }
      : "skip"
  );

  // Determine the actual URL to use
  let fileUrl = attachment.storageId ? convexFileUrl : attachment.url;

  // For private mode files with Base64 content, create a data URL
  if (!fileUrl && attachment.content && attachment.mimeType) {
    fileUrl = `data:${attachment.mimeType};base64,${attachment.content}`;
  }

  // Show loading state for Convex files
  if (attachment.storageId && convexFileUrl === undefined) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 ${className}`}
      >
        <Spinner size="sm" className="opacity-60" />
      </div>
    );
  }

  // Show error state if Convex file URL failed to load
  if (attachment.storageId && convexFileUrl === null) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 ${className}`}
      >
        <div className="text-xs text-muted-foreground">Failed to load</div>
      </div>
    );
  }

  if (attachment.type === "image" && fileUrl) {
    return (
      <button
        className={`overflow-hidden rounded-xl border border-border/20 shadow-sm ${className}`}
        onClick={onClick}
        type="button"
      >
        <img
          alt={attachment.name}
          className="h-auto w-full max-w-sm object-cover"
          loading="lazy"
          src={fileUrl}
          style={{ maxHeight: "300px" }}
        />
      </button>
    );
  }

  if (attachment.type === "audio" && fileUrl) {
    return (
      <div
        className={`stack-xs rounded-xl border border-border/20 bg-muted/30 p-3 ${className}`}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {getFileIcon(attachment)}
          <span className="selectable-text">{attachment.name}</span>
        </div>
        <audio
          controls
          src={fileUrl}
          className="h-8 w-full max-w-xs"
          preload="metadata"
        >
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  if (attachment.type === "video" && (attachment.thumbnail || fileUrl)) {
    const posterUrl = attachment.thumbnail;
    return (
      <button
        className={`relative overflow-hidden rounded-xl border border-border/20 shadow-sm ${className}`}
        onClick={onClick}
        type="button"
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={attachment.name}
            className="h-auto w-full max-w-sm object-cover"
            style={{ maxHeight: "300px" }}
          />
        ) : (
          <div className="flex h-40 w-64 items-center justify-center bg-muted/30">
            <FilmStripIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <PlayIcon className="h-5 w-5" />
          </div>
        </div>
      </button>
    );
  }

  // For non-image files, show a file icon with name
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-3 py-1 text-xs hover:bg-muted/50 transition-colors ${className}`}
      onClick={onClick}
      type="button"
    >
      {getFileIcon(attachment)}
      <span className="text-foreground selectable-text">{attachment.name}</span>
    </button>
  );
};

type ImageThumbnailProps = {
  attachment: Attachment;
  className?: string;
};

export const ImageThumbnail = ({
  attachment,
  className = "",
}: ImageThumbnailProps) => {
  // If we have a storageId, get the URL from Convex
  const convexFileUrl = useQuery(
    api.fileStorage.getFileUrl,
    attachment.storageId
      ? { storageId: attachment.storageId as Id<"_storage"> }
      : "skip"
  );

  // For small thumbnails (chat input), use full image when available for better quality
  // Only use generated thumbnail as fallback if no full image is available
  // For video, always prefer the generated JPEG thumbnail (storage URL is the video file)
  let thumbnailUrl: string | undefined;

  if (attachment.type === "video") {
    thumbnailUrl = attachment.thumbnail;
  } else if (attachment.storageId && convexFileUrl) {
    // Prefer full image from storage for better quality
    thumbnailUrl = convexFileUrl;
  } else if (attachment.url && !attachment.url.startsWith("data:")) {
    // Use direct URL if available
    thumbnailUrl = attachment.url;
  } else if (attachment.thumbnail) {
    // Use generated thumbnail as fallback
    thumbnailUrl = attachment.thumbnail;
  }

  // For private mode files with Base64 content, create a data URL
  if (!thumbnailUrl && attachment.content && attachment.mimeType) {
    thumbnailUrl = `data:${attachment.mimeType};base64,${attachment.content}`;
  }

  if (attachment.storageId && !thumbnailUrl) {
    return (
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded bg-muted ${className}`}
      >
        <Spinner size="sm" className="h-3 w-3 opacity-60" />
      </div>
    );
  }

  if (attachment.type === "image" && thumbnailUrl) {
    return (
      <div
        className={`relative flex-shrink-0 overflow-hidden rounded-md ${className}`}
        title={attachment.name}
      >
        <img
          alt={attachment.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          src={thumbnailUrl}
        />
      </div>
    );
  }

  if (attachment.type === "video" && thumbnailUrl) {
    return (
      <div
        className={`relative flex-shrink-0 overflow-hidden rounded-md ${className}`}
        title={attachment.name}
      >
        <img
          alt={attachment.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          src={thumbnailUrl}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
            <PlayIcon className="h-2.5 w-2.5" />
          </div>
        </div>
      </div>
    );
  }

  return getFileIcon(attachment, "sm", className);
};
