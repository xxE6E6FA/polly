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
  const fileUrl = attachment.storageId ? convexFileUrl : attachment.url;

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
      className={`flex cursor-pointer items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground transition-transform duration-200 hover:scale-105 ${className}`}
      onClick={onClick}
    >
      <span>{attachment.type === "pdf" ? "📄" : "📝"}</span>
      <span>{attachment.name}</span>
      {attachment.storageId && (
        <span className="rounded-full bg-coral-100 px-1.5 py-0.5 text-xs text-coral-700">
          Stored
        </span>
      )}
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
  const thumbnailUrl =
    attachment.thumbnail ||
    (attachment.storageId ? convexFileUrl : attachment.url);

  if (attachment.storageId && !thumbnailUrl) {
    return (
      <div
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted/30 ${className}`}
      >
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
      </div>
    );
  }

  if (attachment.type === "image" && thumbnailUrl) {
    return (
      <div
        className={`h-6 w-6 flex-shrink-0 cursor-pointer overflow-hidden rounded bg-muted/30 ${className}`}
        title={attachment.name}
        onClick={onClick}
      >
        <img
          alt={attachment.name}
          className="h-full w-full object-cover"
          loading="lazy"
          src={thumbnailUrl}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-muted/30 ${className}`}
      title={attachment.name}
    >
      <PaperclipIcon className="h-3 w-3" />
    </div>
  );
};
