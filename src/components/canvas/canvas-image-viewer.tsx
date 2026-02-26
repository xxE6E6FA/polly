import { api } from "@convex/_generated/api";
import {
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  ArrowsOutIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleIcon,
  ClockIcon,
  ImageIcon,
  PencilSimpleIcon,
  SparkleIcon,
  StackSimpleIcon,
  TreeStructureIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CopyIcon } from "@/components/animate-ui/icons/copy";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { TrashIcon } from "@/components/animate-ui/icons/trash";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  copyImageToClipboard,
  downloadFromUrl,
  generateImageFilename,
} from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  type CanvasImage,
  isUpscaleInProgress,
  type UpscaleEntry,
} from "@/types";

const CREATIVE_PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description: "Balanced sharpening and detail",
    creativity: 0.3,
    resemblance: 0.7,
  },
  {
    id: "sharpen",
    label: "Sharpen",
    description: "Minimal changes, just clean up",
    creativity: 0.1,
    resemblance: 0.9,
  },
  {
    id: "enhance",
    label: "Enhance",
    description: "Add plausible detail",
    creativity: 0.45,
    resemblance: 0.55,
  },
  {
    id: "reimagine",
    label: "Reimagine",
    description: "Creative reinterpretation",
    creativity: 0.7,
    resemblance: 0.35,
  },
] as const;

type CreativePresetId = (typeof CREATIVE_PRESETS)[number]["id"];

type CanvasImageViewerProps = {
  images: CanvasImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  onRequestDelete?: (image: CanvasImage) => void;
};

export function CanvasImageViewer({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
  onRequestDelete,
}: CanvasImageViewerProps) {
  const image = images[currentIndex];
  const managedToast = useToast();
  const imageAreaRef = useRef<HTMLDivElement>(null);
  const [activeVersionId, setActiveVersionId] = useState<string>("original");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [creativePreset, setCreativePreset] =
    useState<CreativePresetId>("auto");
  const [upscalePrompt, setUpscalePrompt] = useState("");
  const [showUpscaleSettings, setShowUpscaleSettings] = useState(false);

  const hasNonDefaultCreativeSettings =
    creativePreset !== "auto" || upscalePrompt.trim().length > 0;

  // Derived upscale state
  const succeededUpscales =
    image?.upscales.filter(
      (u): u is UpscaleEntry & { imageUrl: string } =>
        u.status === "succeeded" && !!u.imageUrl
    ) ?? [];
  const inProgressUpscale = image?.upscales.find(isUpscaleInProgress);
  const failedUpscale = image?.upscales.find(u => u.status === "failed");
  const hasAnyInProgress = !!inProgressUpscale;

  // Default to latest succeeded upscale, or original
  const upscaleCount = image?.upscales.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on image change or new upscale completion
  useEffect(() => {
    setSourcePreviewUrl(null);
    if (succeededUpscales.length > 0) {
      const latest = succeededUpscales[succeededUpscales.length - 1];
      if (latest) {
        setActiveVersionId(latest.id);
      }
    } else {
      setActiveVersionId("original");
    }
  }, [currentIndex, upscaleCount]);

  const navigate = useNavigate();

  // Fetch conversation title for conversation-sourced images
  const conversation = useQuery(
    api.conversations.get,
    image?.source === "conversation" && image.conversationId
      ? { id: image.conversationId }
      : "skip"
  );

  // Resolve active image URL
  const activeUpscale = succeededUpscales.find(u => u.id === activeVersionId);
  const activeImageUrl = activeUpscale?.imageUrl ?? image?.imageUrl;

  const goToPrevious = useCallback(() => {
    if (images.length === 0) {
      return;
    }
    onIndexChange(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
  }, [currentIndex, images.length, onIndexChange]);

  const goToNext = useCallback(() => {
    if (images.length === 0) {
      return;
    }
    onIndexChange(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, images.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          goToPrevious();
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          goToNext();
          break;
        }
        case "Escape": {
          event.preventDefault();
          onOpenChange(false);
          break;
        }
        case "Home": {
          event.preventDefault();
          onIndexChange(0);
          break;
        }
        case "End": {
          event.preventDefault();
          onIndexChange(images.length - 1);
          break;
        }
        default:
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [
    open,
    goToPrevious,
    goToNext,
    onOpenChange,
    onIndexChange,
    images.length,
  ]);

  // Focus the image area when viewer opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        imageAreaRef.current?.focus();
      });
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleCopyImage = useCallback(async () => {
    if (!activeImageUrl) {
      return;
    }
    try {
      await copyImageToClipboard(activeImageUrl);
      managedToast.success("Image copied to clipboard");
    } catch {
      managedToast.error("Failed to copy image");
    }
  }, [activeImageUrl, managedToast]);

  const handleDownload = useCallback(async () => {
    if (!activeImageUrl) {
      return;
    }
    try {
      const filename = generateImageFilename(activeImageUrl, image?.prompt);
      await downloadFromUrl(activeImageUrl, filename);
      managedToast.success("Image downloaded");
    } catch {
      managedToast.error("Failed to download image");
    }
  }, [activeImageUrl, image?.prompt, managedToast]);

  const handleCopyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        managedToast.success(`${label} copied`);
      } catch {
        managedToast.error(`Failed to copy ${label.toLowerCase()}`);
      }
    },
    [managedToast]
  );

  const handleDelete = useCallback(() => {
    if (!image) {
      return;
    }
    onRequestDelete?.(image);
  }, [image, onRequestDelete]);

  const upscaleImageAction = useAction(api.generations.upscaleImage);
  const removeUpscaleEntry = useMutation(api.generations.removeUpscaleEntry);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isCancelingUpscale, setIsCancelingUpscale] = useState(false);

  const handleStandardUpscale = useCallback(async () => {
    if (!image?.generationId || isUpscaling) {
      return;
    }
    setIsUpscaling(true);
    try {
      await upscaleImageAction({
        generationId: image.generationId,
        type: "standard",
      });
      managedToast.success("Upscale started");
    } catch {
      managedToast.error("Failed to start upscale");
    } finally {
      setIsUpscaling(false);
    }
  }, [image, isUpscaling, upscaleImageAction, managedToast]);

  const handleCreativeUpscale = useCallback(async () => {
    if (!image?.generationId || isUpscaling) {
      return;
    }
    setIsUpscaling(true);
    try {
      const preset = CREATIVE_PRESETS.find(p => p.id === creativePreset);
      await upscaleImageAction({
        generationId: image.generationId,
        type: "creative",
        creativity: preset?.creativity,
        resemblance: preset?.resemblance,
        upscalePrompt: upscalePrompt.trim() || undefined,
      });
      managedToast.success("Creative enhance started");
    } catch {
      managedToast.error("Failed to start creative enhance");
    } finally {
      setIsUpscaling(false);
    }
  }, [
    image,
    isUpscaling,
    upscaleImageAction,
    managedToast,
    creativePreset,
    upscalePrompt,
  ]);

  const handleCancelUpscale = useCallback(async () => {
    if (!(image?.generationId && inProgressUpscale) || isCancelingUpscale) {
      return;
    }
    setIsCancelingUpscale(true);
    try {
      await removeUpscaleEntry({
        id: image.generationId,
        upscaleId: inProgressUpscale.id,
      });
    } catch {
      managedToast.error("Failed to cancel upscale");
    } finally {
      setIsCancelingUpscale(false);
    }
  }, [
    image,
    inProgressUpscale,
    isCancelingUpscale,
    removeUpscaleEntry,
    managedToast,
  ]);

  const handleRetryUpscale = useCallback(async () => {
    if (!(image?.generationId && failedUpscale)) {
      return;
    }
    setIsUpscaling(true);
    try {
      // Remove the failed entry
      await removeUpscaleEntry({
        id: image.generationId,
        upscaleId: failedUpscale.id,
      });
      // Re-trigger based on original type
      if (failedUpscale.type === "standard") {
        await upscaleImageAction({
          generationId: image.generationId,
          type: "standard",
        });
      } else {
        const preset = CREATIVE_PRESETS.find(p => p.id === creativePreset);
        await upscaleImageAction({
          generationId: image.generationId,
          type: "creative",
          creativity: preset?.creativity,
          resemblance: preset?.resemblance,
          upscalePrompt: upscalePrompt.trim() || undefined,
        });
      }
      managedToast.success("Upscale restarted");
    } catch {
      managedToast.error("Failed to retry upscale");
    } finally {
      setIsUpscaling(false);
    }
  }, [
    image,
    failedUpscale,
    removeUpscaleEntry,
    upscaleImageAction,
    managedToast,
    creativePreset,
    upscalePrompt,
  ]);

  const handleDeleteUpscaleVersion = useCallback(
    async (upscaleId: string) => {
      if (!image?.generationId) {
        return;
      }
      try {
        await removeUpscaleEntry({
          id: image.generationId,
          upscaleId,
        });
        if (activeVersionId === upscaleId) {
          setActiveVersionId("original");
        }
        managedToast.success("Upscaled version removed");
      } catch {
        managedToast.error("Failed to remove upscaled version");
      }
    },
    [image, removeUpscaleEntry, activeVersionId, managedToast]
  );

  const loadImageSettings = useCanvasStore(s => s.loadImageSettings);
  const handleUseSettings = useCallback(() => {
    if (!image) {
      return;
    }
    loadImageSettings(image);
    onOpenChange(false);
    managedToast.success("Settings loaded into form");
  }, [image, loadImageSettings, onOpenChange, managedToast]);

  if (!(open && image)) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-label={`Image viewer: ${image.prompt || "Generated image"}`}
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 z-modal bg-background/95 backdrop-blur-lg animate-in fade-in-0 [animation-duration:200ms]" />

      {/* Full-screen container */}
      <div className="fixed inset-0 z-modal flex">
        {/* Image area (left) */}
        <div
          ref={imageAreaRef}
          tabIndex={-1}
          className="relative flex flex-1 items-center justify-center outline-none"
          onClick={() => onOpenChange(false)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenChange(false);
            }
          }}
        >
          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-card/90 text-foreground shadow-lg dark:ring-1 dark:ring-white/[0.06] backdrop-blur-md hover:bg-card transition-colors duration-200"
                aria-label="Previous image"
              >
                <CaretLeftIcon className="size-6" />
              </Button>

              <Button
                variant="ghost"
                size="lg"
                onClick={e => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-card/90 text-foreground shadow-lg dark:ring-1 dark:ring-white/[0.06] backdrop-blur-md hover:bg-card transition-colors duration-200"
                aria-label="Next image"
              >
                <CaretRightIcon className="size-6" />
              </Button>
            </>
          )}

          {/* Counter pill */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card/90 px-3 py-1.5 text-xs font-medium tabular-nums text-muted-foreground shadow-lg backdrop-blur-md dark:ring-1 dark:ring-white/[0.06]">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Image */}
          <div className="flex h-full w-full items-center justify-center p-8 pointer-events-none transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95">
            <img
              key={`${image.id}-${activeVersionId}`}
              src={activeImageUrl}
              alt={image.prompt || "Generated image"}
              className="max-h-full max-w-full object-contain pointer-events-auto rounded-lg drop-shadow-2xl"
              draggable={false}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              tabIndex={-1}
            />
          </div>
        </div>

        {/* Info panel (right) */}
        <div
          className="flex w-[380px] shrink-0 flex-col border-l border-border/50 bg-card/80 backdrop-blur-md animate-in slide-in-from-right-4 fade-in-0 duration-300"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {/* Panel header with actions */}
          <div className="flex items-start justify-between gap-3 border-b border-border/40 p-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {formatModelName(image.model)}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={handleCopyImage}
                    aria-label="Copy image"
                  >
                    <CopyIcon animateOnHover size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy image</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={handleDownload}
                    aria-label="Download image"
                  >
                    <DownloadIcon animateOnHover size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Download image</TooltipContent>
              </Tooltip>
              {image.source === "canvas" && image.generationId && (
                <>
                  <Tooltip>
                    <TooltipTrigger>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        onClick={handleDelete}
                        aria-label="Delete image"
                      >
                        <TrashIcon animateOnHover size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Delete image</TooltipContent>
                  </Tooltip>
                  {image.status === "succeeded" && (
                    <Tooltip>
                      <TooltipTrigger>
                        <button
                          type="button"
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => {
                            if (!image.generationId) {
                              return;
                            }
                            // Navigate directly — don't close the viewer first
                            // to avoid a flash between the viewer closing and the
                            // edit modal opening. The edit modal's backdrop covers
                            // the viewer, and the viewer unmounts when the user
                            // navigates back to /canvas.
                            navigate(ROUTES.CANVAS_IMAGE(image.generationId));
                          }}
                          aria-label="Edit image"
                        >
                          <PencilSimpleIcon className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Edit image</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={handleUseSettings}
                    aria-label="Use settings"
                  >
                    <ArrowsClockwiseIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use settings</TooltipContent>
              </Tooltip>
              <div className="mx-1 h-4 w-px bg-border/60" />
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                  >
                    <XIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Metadata badges + Version switcher */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-5 py-4">
            {image.duration !== undefined && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                <ClockIcon className="size-3.5" />
                {image.duration.toFixed(1)}s
              </span>
            )}
            {image.aspectRatio && (
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {image.aspectRatio}
              </span>
            )}
            {image.quality !== undefined && (
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                Quality {image.quality}
              </span>
            )}
            {image.seed !== undefined && (
              <Tooltip>
                <TooltipTrigger>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted/80"
                    onClick={() => handleCopyText(String(image.seed), "Seed")}
                  >
                    {image.seed}
                    <CopyIcon size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy seed</TooltipContent>
              </Tooltip>
            )}

            {succeededUpscales.length > 0 && (
              <span className="inline-flex items-center rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                {succeededUpscales.length} upscale
                {succeededUpscales.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Prompt + Upscale section (scrollable) */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {image.prompt && (
              <div className="group/prompt relative">
                <p className="text-sm leading-relaxed text-foreground/90 pr-7">
                  {image.prompt}
                </p>
                <Tooltip>
                  <TooltipTrigger>
                    <button
                      type="button"
                      className="absolute right-0 top-0 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover/prompt:opacity-100"
                      onClick={() =>
                        handleCopyText(image.prompt ?? "", "Prompt")
                      }
                      aria-label="Copy prompt"
                    >
                      <CopyIcon animateOnHover size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy prompt</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* Input images section */}
            {image.referenceImageUrls &&
              image.referenceImageUrls.length > 0 && (
                <div className="mt-4 border-t border-border/40 pt-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <ImageIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                    Input Images
                  </h3>
                  <div className="flex gap-2">
                    {image.referenceImageUrls.map((url, idx) => (
                      <button
                        key={url}
                        type="button"
                        className="relative size-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40 transition-all hover:ring-2 hover:ring-primary/50"
                        onClick={() => setSourcePreviewUrl(url)}
                      >
                        <img
                          src={url}
                          alt={`Source ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] font-medium text-white backdrop-blur-sm">
                          Source
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/* Edit tree section */}
            {image.source === "canvas" &&
              image.generationId &&
              !image.parentGenerationId &&
              (image.editCount ?? 0) > 0 && (
                <div className="mt-4 border-t border-border/40 pt-4">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <TreeStructureIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                    Edits ({image.editCount})
                  </h3>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg border border-border/40 p-2.5 text-left transition-colors hover:bg-muted/50"
                    onClick={() => {
                      if (image.generationId) {
                        navigate(ROUTES.CANVAS_IMAGE(image.generationId));
                      }
                    }}
                  >
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-border/40">
                      <img
                        src={image.imageUrl}
                        alt="Edit tree"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {image.prompt || "Edit tree"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {image.editCount} edit
                        {(image.editCount ?? 0) > 1 ? "s" : ""}
                      </p>
                    </div>
                    <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </div>
              )}

            {/* Conversation link */}
            {image.source === "conversation" && image.conversationId && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <ChatCircleIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                  Conversation
                </h3>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border border-border/40 p-2.5 text-left transition-colors hover:bg-muted/50"
                  onClick={() => {
                    navigate(
                      ROUTES.CHAT_CONVERSATION(image.conversationId as string)
                    );
                    onOpenChange(false);
                  }}
                >
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {conversation?.title ?? "Conversation"}
                  </p>
                  <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Upscale section */}
            {image.source === "canvas" && image.generationId && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <ArrowsOutIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                  Upscale
                </h3>

                {/* Failed state */}
                {!hasAnyInProgress && failedUpscale && (
                  <div className="stack-sm mb-3">
                    <p className="text-sm text-destructive">
                      {failedUpscale.error ?? "Upscale failed"}
                    </p>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleRetryUpscale}
                      disabled={isUpscaling}
                    >
                      <ArrowClockwiseIcon className="size-4" />
                      {isUpscaling ? "Retrying..." : "Retry"}
                    </Button>
                  </div>
                )}

                {/* Upscale buttons — always visible, disabled when in-progress */}
                <div className="stack-sm">
                  {/* Standard upscale — primary */}
                  <div className="relative">
                    <Button
                      className="w-full gap-2"
                      onClick={handleStandardUpscale}
                      disabled={isUpscaling || hasAnyInProgress}
                    >
                      {inProgressUpscale?.type === "standard" ? (
                        <Spinner className="size-4" />
                      ) : (
                        <ArrowsOutIcon className="size-4" />
                      )}
                      {inProgressUpscale?.type === "standard"
                        ? "Upscaling..."
                        : "Upscale"}
                    </Button>
                    {inProgressUpscale?.type === "standard" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={handleCancelUpscale}
                        disabled={isCancelingUpscale}
                        aria-label="Cancel upscale"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    )}
                  </div>

                  {/* Creative enhance — secondary */}
                  <div className="relative">
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={handleCreativeUpscale}
                      disabled={isUpscaling || hasAnyInProgress}
                    >
                      {inProgressUpscale?.type === "creative" ? (
                        <Spinner className="size-4" />
                      ) : (
                        <SparkleIcon className="size-4" />
                      )}
                      {inProgressUpscale?.type === "creative"
                        ? "Enhancing..."
                        : "Creative Enhance"}
                    </Button>
                    {inProgressUpscale?.type === "creative" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={handleCancelUpscale}
                        disabled={isCancelingUpscale}
                        aria-label="Cancel upscale"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    )}
                  </div>

                  {/* Creative settings collapsible */}
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowUpscaleSettings(!showUpscaleSettings)}
                  >
                    <CaretDownIcon
                      className={cn(
                        "size-3 transition-transform",
                        showUpscaleSettings && "rotate-180"
                      )}
                    />
                    Creative Settings
                    {hasNonDefaultCreativeSettings && (
                      <span className="size-1.5 rounded-full bg-primary" />
                    )}
                  </button>

                  {showUpscaleSettings && (
                    <div className="stack-sm rounded-lg border border-border/40 p-3">
                      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                        {CREATIVE_PRESETS.map(preset => (
                          <Tooltip key={preset.id}>
                            <TooltipTrigger>
                              <button
                                type="button"
                                className={cn(
                                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                                  creativePreset === preset.id
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                                onClick={() => setCreativePreset(preset.id)}
                              >
                                {preset.label}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {preset.description}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>

                      <div className="stack-xs">
                        <label
                          htmlFor="upscale-prompt"
                          className="text-xs text-muted-foreground"
                        >
                          Prompt
                        </label>
                        <textarea
                          id="upscale-prompt"
                          rows={2}
                          className="w-full resize-none rounded-md border border-border/40 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                          placeholder="Guide the upscaler..."
                          value={upscalePrompt}
                          onChange={e => setUpscalePrompt(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Versions gallery */}
                {(succeededUpscales.length > 0 || inProgressUpscale) && (
                  <div className="mt-4 border-t border-border/40 pt-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <StackSimpleIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
                      Versions
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Original thumbnail */}
                      <div className="group/thumb relative">
                        <button
                          type="button"
                          className={cn(
                            "relative w-full overflow-hidden rounded-lg border-2 transition-all",
                            activeVersionId === "original"
                              ? "border-primary ring-1 ring-primary/30"
                              : "border-transparent hover:border-border"
                          )}
                          onClick={() => setActiveVersionId("original")}
                        >
                          <img
                            src={image.imageUrl}
                            alt="Original"
                            className="block aspect-square w-full object-cover"
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                            Original
                          </span>
                        </button>
                      </div>

                      {/* Succeeded upscale thumbnails */}
                      {succeededUpscales.map(upscale => (
                        <div key={upscale.id} className="group/thumb relative">
                          <button
                            type="button"
                            className={cn(
                              "relative w-full overflow-hidden rounded-lg border-2 transition-all",
                              activeVersionId === upscale.id
                                ? "border-primary ring-1 ring-primary/30"
                                : "border-transparent hover:border-border"
                            )}
                            onClick={() => setActiveVersionId(upscale.id)}
                          >
                            <img
                              src={upscale.imageUrl}
                              alt={
                                upscale.type === "standard"
                                  ? "Standard 2x"
                                  : "Creative 2x"
                              }
                              className="block aspect-square w-full object-cover"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                              {upscale.type === "standard" ? "2x" : "2x+"}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 z-10 flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/40 transition-all hover:text-destructive group-hover/thumb:opacity-100"
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteUpscaleVersion(upscale.id);
                            }}
                            aria-label="Remove version"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </div>
                      ))}

                      {/* In-progress placeholder */}
                      {inProgressUpscale && (
                        <div className="relative">
                          <div className="aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-border/60 bg-muted/30">
                            <div className="flex h-full flex-col items-center justify-center gap-1.5">
                              <Spinner className="size-4 text-muted-foreground" />
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {inProgressUpscale.type === "standard"
                                  ? "2x"
                                  : "2x+"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timestamp footer */}
          <div className="border-t border-border/40 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(image.createdAt)}
            </p>
          </div>
        </div>
      </div>
      {/* Source image preview modal */}
      {sourcePreviewUrl && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0 [animation-duration:150ms]"
          onClick={() => setSourcePreviewUrl(null)}
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setSourcePreviewUrl(null);
            }
          }}
        >
          <div className="absolute right-4 top-4">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              onClick={() => setSourcePreviewUrl(null)}
              aria-label="Close preview"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <img
            src={sourcePreviewUrl}
            alt="Source preview"
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain drop-shadow-2xl animate-in zoom-in-95 fade-in-0 [animation-duration:150ms]"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}
    </div>,
    document.getElementById("root") ?? document.body
  );
}

function formatModelName(model?: string): string {
  if (!model) {
    return "Generated Image";
  }
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
