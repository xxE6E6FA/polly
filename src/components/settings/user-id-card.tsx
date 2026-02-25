import { Meter } from "@base-ui/react/meter";
import { api } from "@convex/_generated/api";
import {
  CalendarBlankIcon,
  CameraIcon,
  ChatCircleIcon,
  CheckIcon,
  PencilSimpleIcon,
  TrendUpIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useConvex, useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { ProfileImageCropper } from "@/components/settings/profile-image-cropper";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMessageSentCount } from "@/hooks/use-message-sent-count";
import { useUserSettings } from "@/hooks/use-user-settings";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { cn, resizeGoogleImageUrl } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { useUserDataContext } from "@/providers/user-data-context";

function getInitials(name?: string | null) {
  if (!name) {
    return "U";
  }
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatResetDate(createdAt?: number | null) {
  if (!createdAt) {
    return "soon";
  }

  const joinDate = new Date(createdAt);
  const now = new Date();
  const joinDay = joinDate.getDate();

  let resetDate = new Date(now.getFullYear(), now.getMonth(), joinDay);

  if (resetDate <= now) {
    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, joinDay);
  }

  if (resetDate.getDate() !== joinDay) {
    resetDate = new Date(resetDate.getFullYear(), resetDate.getMonth() + 1, 0);
  }

  return resetDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export const UserIdCard = () => {
  const { monthlyUsage, hasUnlimitedCalls, user, isLoading } =
    useUserDataContext();
  const { monthlyMessagesSent } = useMessageSentCount();
  const userSettings = useUserSettings();
  const convex = useConvex();
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const managedToast = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const shouldAnonymize = userSettings?.anonymizeForDemo ?? false;

  const handleStartEditingName = useCallback(() => {
    setNameValue(user?.name || "");
    setIsEditingName(true);
  }, [user?.name]);

  const handleCancelEditingName = useCallback(() => {
    setIsEditingName(false);
    setNameValue("");
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!nameValue.trim()) {
      managedToast.error("Name cannot be empty");
      return;
    }

    setIsSavingName(true);
    try {
      await updateProfile({ name: nameValue.trim() });
      del(CACHE_KEYS.userData); // Bust cache to prevent stale data flash
      setIsEditingName(false);
      managedToast.success("Name updated");
    } catch (error) {
      managedToast.error("Failed to update name", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsSavingName(false);
    }
  }, [nameValue, updateProfile, managedToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveName();
      } else if (e.key === "Escape") {
        handleCancelEditingName();
      }
    },
    [handleSaveName, handleCancelEditingName]
  );

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        managedToast.error("Please select an image file");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        managedToast.error("Image must be less than 10MB");
        return;
      }

      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setCropperOpen(true);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [managedToast]
  );

  const handleCropComplete = useCallback(
    async (croppedBlob: Blob) => {
      setIsUploadingImage(true);

      try {
        const postUrl = await generateUploadUrl();

        const uploadResponse = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "image/webp" },
          body: croppedBlob,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        const { storageId } = await uploadResponse.json();

        const blobUrl = URL.createObjectURL(croppedBlob);
        setTempImageUrl(blobUrl);

        const storageUrl = await convex.query(api.fileStorage.getFileUrl, {
          storageId,
        });

        if (!storageUrl) {
          throw new Error("Failed to get storage URL");
        }

        await updateProfile({ image: storageUrl });
        del(CACHE_KEYS.userData); // Bust cache to prevent stale data flash

        setTempImageUrl(null);
        URL.revokeObjectURL(blobUrl);

        setCropperOpen(false);
        setSelectedImage(null);
        managedToast.success("Profile photo updated");
      } catch (error) {
        managedToast.error("Failed to upload image", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
        setTempImageUrl(null);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [convex, generateUploadUrl, updateProfile, managedToast]
  );

  const handleCropperClose = useCallback(
    (open: boolean) => {
      if (!open && selectedImage) {
        URL.revokeObjectURL(selectedImage);
        setSelectedImage(null);
      }
      setCropperOpen(open);
    },
    [selectedImage]
  );

  if (isLoading || !user) {
    return null;
  }

  const displayImageUrl = tempImageUrl || user.image || "";

  const joinedLabel = user.createdAt
    ? `Joined ${new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })}`
    : null;

  const showUsageMeter =
    monthlyUsage && monthlyUsage.monthlyLimit > 0 && !hasUnlimitedCalls;

  return (
    <>
      <div className="stack-lg">
        {/* Desktop card */}
        <div className="hidden overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm backdrop-blur lg:block">
          <div className="flex flex-col items-center gap-4 p-6">
            <div
              className={cn(
                "relative group",
                shouldAnonymize && "blur-lg pointer-events-none"
              )}
            >
              <Avatar className="h-20 w-20 ring-[3px] ring-primary/25 shadow-md">
                <AvatarImage
                  alt={user.name || "User"}
                  src={resizeGoogleImageUrl(displayImageUrl, 144)}
                />
                <AvatarFallback className="bg-gradient-primary text-base text-primary-foreground">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Change profile photo"
              >
                <CameraIcon className="size-5 text-white" weight="fill" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                aria-label="Upload profile photo"
              />
            </div>

            <div className="flex flex-col items-center">
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter your name"
                    className="h-8 w-36 text-left text-sm"
                    autoFocus
                    disabled={isSavingName}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSaveName}
                    disabled={isSavingName || !nameValue.trim()}
                    aria-label="Save name"
                    className="h-7 w-7"
                  >
                    <CheckIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancelEditingName}
                    disabled={isSavingName}
                    aria-label="Cancel editing"
                    className="h-7 w-7"
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditingName}
                  className={cn(
                    "group/name relative flex items-center justify-center rounded px-1 -mx-1 transition-colors hover:bg-muted",
                    shouldAnonymize && "blur-md pointer-events-none"
                  )}
                  aria-label="Edit name"
                >
                  <span className="text-lg font-semibold">
                    {user.name || "Unnamed User"}
                  </span>
                  <PencilSimpleIcon className="absolute -right-5 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100" />
                </button>
              )}
              {joinedLabel && (
                <span className="mt-1 text-xs text-muted-foreground">
                  {joinedLabel}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-border/60">
            <div className="flex flex-col items-center gap-0.5 border-r border-border/60 py-4">
              <span className="text-xl font-semibold tabular-nums">
                {user.conversationCount ?? 0}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChatCircleIcon className="size-3" weight="fill" />
                Chats
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 py-4">
              <span className="text-xl font-semibold tabular-nums">
                {monthlyMessagesSent || 0}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendUpIcon className="size-3" weight="fill" />
                This month
              </span>
            </div>
          </div>

          {showUsageMeter && (
            <Meter.Root
              value={monthlyMessagesSent}
              max={monthlyUsage.monthlyLimit}
              getAriaValueText={(_, value) =>
                `${value} out of ${monthlyUsage.monthlyLimit}`
              }
              className="stack-md border-t border-border/60 p-4"
            >
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <Meter.Label>Monthly Usage</Meter.Label>
                <Meter.Value className="font-mono tabular-nums text-foreground">
                  {(_, value) => `${value}/${monthlyUsage.monthlyLimit}`}
                </Meter.Value>
              </div>
              <Meter.Track className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <Meter.Indicator className="h-full w-full flex-1 bg-primary transition-all" />
              </Meter.Track>
              {typeof monthlyUsage.remainingMessages === "number" && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{monthlyUsage.remainingMessages} remaining</span>
                  <span>Resets {formatResetDate(user.createdAt)}</span>
                </div>
              )}
            </Meter.Root>
          )}
        </div>

        {/* Mobile profile card */}
        <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/80 p-4 lg:hidden">
          <div
            className={cn(
              "relative group shrink-0",
              shouldAnonymize && "blur-lg pointer-events-none"
            )}
          >
            <Avatar className="h-14 w-14 ring-[3px] ring-primary/25 shadow-md">
              <AvatarImage
                alt={user.name || "User"}
                src={resizeGoogleImageUrl(displayImageUrl, 96)}
              />
              <AvatarFallback className="bg-gradient-primary text-sm text-primary-foreground">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Change profile photo"
            >
              <CameraIcon className="size-5 text-white" weight="fill" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your name"
                  className="h-8 flex-1 text-sm"
                  autoFocus
                  disabled={isSavingName}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSaveName}
                  disabled={isSavingName || !nameValue.trim()}
                  aria-label="Save name"
                  className="h-8 w-8 shrink-0"
                >
                  <CheckIcon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelEditingName}
                  disabled={isSavingName}
                  aria-label="Cancel editing"
                  className="h-8 w-8 shrink-0"
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditingName}
                className={cn(
                  "group/name flex items-center gap-2 rounded px-1 -mx-1 transition-colors active:bg-muted",
                  shouldAnonymize && "blur-md pointer-events-none"
                )}
                aria-label="Edit name"
              >
                <span className="text-base font-semibold truncate">
                  {user.name || "Unnamed User"}
                </span>
                <PencilSimpleIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )}
            {joinedLabel && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarBlankIcon className="size-3.5 shrink-0" />
                <span>{joinedLabel}</span>
              </div>
            )}
          </div>
        </div>

        {showUsageMeter && (
          <Meter.Root
            value={monthlyMessagesSent}
            max={monthlyUsage.monthlyLimit}
            getAriaValueText={(_, value) =>
              `${value} out of ${monthlyUsage.monthlyLimit}`
            }
            className="rounded-xl border border-border/60 bg-muted/30 p-4 lg:hidden"
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <Meter.Label>Monthly Usage</Meter.Label>
              <Meter.Value className="font-mono tabular-nums text-foreground">
                {(_, value) => `${value}/${monthlyUsage.monthlyLimit}`}
              </Meter.Value>
            </div>
            <Meter.Track className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <Meter.Indicator className="h-full w-full flex-1 bg-primary transition-all" />
            </Meter.Track>
            {typeof monthlyUsage.remainingMessages === "number" && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">
                  {monthlyUsage.remainingMessages} remaining
                </span>
                <span>Resets {formatResetDate(user.createdAt)}</span>
              </div>
            )}
          </Meter.Root>
        )}
      </div>

      {selectedImage && (
        <ProfileImageCropper
          open={cropperOpen}
          onOpenChange={handleCropperClose}
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
          isUploading={isUploadingImage}
        />
      )}
    </>
  );
};
