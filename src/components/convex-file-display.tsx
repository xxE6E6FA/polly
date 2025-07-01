import { PaperclipIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";

import { type Attachment } from "@/types";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

type ConvexFileDisplayProps = {
  attachment: Attachment;
  className?: string;
  onClick?: () => void;
};

export const ConvexFileDisplay = ({
  attachment,
  className = "",
  onClick,
}: ConvexFileDisplayProps) => {
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
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
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
      <div
        className={`overflow-hidden rounded-xl border border-border/20 shadow-sm ${className}`}
      >
        <img
          alt={attachment.name}
          className="h-auto w-full max-w-sm cursor-pointer object-cover"
          loading="lazy"
          src={fileUrl}
          style={{ maxHeight: "300px" }}
          onClick={onClick}
        />
      </div>
    );
  }

  // For non-image files, show a file icon with name
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-sm ${className}`}
      onClick={onClick}
    >
      <PaperclipIcon className="h-4 w-4 text-muted-foreground" />
      <span className="text-foreground">{attachment.name}</span>
    </div>
  );
};

/**
 * Component specifically for displaying image thumbnails in chat input
 */
type ConvexImageThumbnailProps = {
  attachment: Attachment;
  className?: string;
  onClick?: () => void;
};

export const ConvexImageThumbnail = ({
  attachment,
  className = "",
  onClick,
}: ConvexImageThumbnailProps) => {
  // If we have a storageId, get the URL from Convex
  const convexFileUrl = useQuery(
    api.fileStorage.getFileUrl,
    attachment.storageId
      ? { storageId: attachment.storageId as Id<"_storage"> }
      : "skip"
  );

  // For thumbnails, prefer local thumbnail if available, then Convex URL, then fallback URL
  let thumbnailUrl =
    attachment.thumbnail ||
    (attachment.storageId ? convexFileUrl : attachment.url);

  // For private mode files with Base64 content, create a data URL
  if (!thumbnailUrl && attachment.content && attachment.mimeType) {
    thumbnailUrl = `data:${attachment.mimeType};base64,${attachment.content}`;
  }

  if (attachment.storageId && !thumbnailUrl) {
    return (
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 ${className}`}
      >
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
      </div>
    );
  }

  if (attachment.type === "image" && thumbnailUrl) {
    return (
      <div
        className={`relative flex-shrink-0 cursor-pointer overflow-hidden rounded bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10 ${className}`}
        title={attachment.name}
        onClick={onClick}
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

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 ${className}`}
      title={attachment.name}
    >
      <PaperclipIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
    </div>
  );
};
