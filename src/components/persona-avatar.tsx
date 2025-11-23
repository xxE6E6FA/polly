import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { cn } from "@/lib/utils";

interface PersonaAvatarProps {
  icon?: string;
  pictureStorageId?: Id<"_storage">;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-base",
  lg: "h-16 w-16 text-3xl",
};

export function PersonaAvatar({
  icon,
  pictureStorageId,
  size = "md",
  className,
}: PersonaAvatarProps) {
  const pictureUrl = useQuery(
    api.fileStorage.getFileUrl,
    pictureStorageId ? { storageId: pictureStorageId } : "skip"
  );

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted overflow-hidden",
        sizeClasses[size],
        className
      )}
    >
      {pictureStorageId && pictureUrl ? (
        <img
          src={pictureUrl}
          alt="Persona"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "select-none",
            size === "lg" && "text-3xl",
            size === "md" && "text-base",
            size === "sm" && "text-xs"
          )}
          style={{
            lineHeight: 1,
            fontFamily:
              "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
          }}
        >
          {icon || "🤖"}
        </span>
      )}
    </div>
  );
}
