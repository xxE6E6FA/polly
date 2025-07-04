import {
  PaperclipIcon,
  FileTextIcon,
  FilePdfIcon,
  FileCodeIcon,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";

import { type Attachment } from "@/types";

import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";

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
      className={`inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-3 py-1 text-xs ${
        attachment.type === "pdf"
          ? "cursor-pointer hover:bg-muted/50 transition-colors"
          : ""
      } ${className}`}
      onClick={attachment.type === "pdf" ? onClick : undefined}
    >
      {getFileIcon(attachment)}
      <span className="text-foreground selectable-text">{attachment.name}</span>
    </div>
  );
};

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

  return getFileIcon(attachment, "sm", className);
};
