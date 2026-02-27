import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  CaretDown,
  CheckIcon,
  PaperPlaneTiltIcon,
  TrashSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { DownloadIcon } from "@/components/animate-ui/icons/download";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Button } from "@/components/ui/button";
import { ResponsivePicker } from "@/components/ui/responsive-picker";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRequiredParam } from "@/hooks/use-required-param";
import { downloadFromUrl, generateImageFilename } from "@/lib/export";
import { CACHE_KEYS, get, set } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

// ============================================================================
// Types
// ============================================================================

type EditTreeNode = {
  _id: Id<"generations">;
  prompt: string;
  model: string;
  status: string;
  parentGenerationId?: Id<"generations">;
  rootGenerationId?: Id<"generations">;
  imageUrl?: string;
  error?: string;
  createdAt: number;
  aspectRatio?: string;
};

// ============================================================================
// Full-screen edit view
// ============================================================================

export default function CanvasImagePage() {
  const generationId = useRequiredParam("generationId") as Id<"generations">;
  const navigate = useNavigate();
  const managedToast = useToast();
  const imageAreaRef = useRef<HTMLDivElement>(null);

  // Fetch the target generation
  const generation = useQuery(api.generations.getGeneration, {
    id: generationId,
  });

  // Compute root ID for edit tree
  const rootId =
    generation?.rootGenerationId ?? (generation ? generationId : undefined);

  // Fetch edit tree
  const editTree = useQuery(
    api.generations.getEditTree,
    rootId ? { rootId } : "skip"
  ) as EditTreeNode[] | undefined;

  // Selected node — defaults to the latest
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Edit input state
  const [editPrompt, setEditPrompt] = useState("");
  const [editModelId, setEditModelId] = useState<string>(() =>
    get(CACHE_KEYS.canvasLastEditModel, "")
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  // Track hero image rendered size so placeholders match exactly
  const [heroSize, setHeroSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const startEditGeneration = useAction(api.generations.startEditGeneration);
  const deleteGeneration = useMutation(api.generations.deleteGeneration);
  const cancelGeneration = useMutation(api.generations.cancelGeneration);
  const retryGeneration = useMutation(api.generations.retryGeneration);
  const imageModels = useEnabledImageModels();
  const img2imgModels = imageModels?.filter(m => m.supportsImageToImage) ?? [];

  // Auto-select latest node when tree updates
  const treeLength = editTree?.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: select latest on tree change
  useEffect(() => {
    if (editTree && editTree.length > 0) {
      const latest = editTree[editTree.length - 1];
      if (latest) {
        setSelectedNodeId(latest._id);
      }
    }
  }, [treeLength]);

  // Scroll thumbnail strip to show selected
  const thumbStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!(selectedNodeId && thumbStripRef.current)) {
      return;
    }
    const el = thumbStripRef.current.querySelector(
      `[data-node-id="${selectedNodeId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setPromptExpanded(false);
  }, [selectedNodeId]);

  // Resolve selected node
  const selectedNode = editTree?.find(n => n._id === selectedNodeId);
  const activeNode = selectedNode ?? editTree?.[editTree.length - 1];
  const heroImageUrl = activeNode?.imageUrl ?? "";

  // Find the last succeeded node as parent for new edits
  const lastSucceededNode = editTree
    ? [...editTree].reverse().find(n => n.status === "succeeded" && n.imageUrl)
    : undefined;

  // Back handler — return to canvas grid
  const handleBack = useCallback(() => {
    navigate(ROUTES.CANVAS);
  }, [navigate]);

  // Lock body scroll & keyboard
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleBack();
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [handleBack]);

  // Focus image area on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      imageAreaRef.current?.focus();
    });
  }, []);

  // ---- Handlers ----

  const handleSubmitEdit = useCallback(async () => {
    if (
      !(lastSucceededNode && editPrompt.trim() && editModelId) ||
      isSubmitting
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      await startEditGeneration({
        prompt: editPrompt.trim(),
        modelId: editModelId,
        parentGenerationId: lastSucceededNode._id,
      });
      set(CACHE_KEYS.canvasLastEditModel, editModelId);
      setEditPrompt("");
    } catch {
      managedToast.error("Failed to start edit");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    lastSucceededNode,
    editPrompt,
    editModelId,
    isSubmitting,
    startEditGeneration,
    managedToast,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmitEdit();
      }
    },
    [handleSubmitEdit]
  );

  const handleDownload = useCallback(async () => {
    if (!heroImageUrl) {
      return;
    }
    try {
      const filename = generateImageFilename(heroImageUrl, activeNode?.prompt);
      await downloadFromUrl(heroImageUrl, filename);
      managedToast.success("Image downloaded");
    } catch {
      managedToast.error("Failed to download image");
    }
  }, [heroImageUrl, activeNode, managedToast]);

  const handleSelectModelFromNode = useCallback(
    (model: string) => {
      const match = img2imgModels.find(m => m.modelId === model);
      if (match) {
        setEditModelId(match.modelId);
        set(CACHE_KEYS.canvasLastEditModel, match.modelId);
        managedToast.success(`Model set to ${match.name}`);
      }
    },
    [img2imgModels, managedToast]
  );

  const handleDeleteNode = useCallback(
    async (nodeId: Id<"generations">) => {
      try {
        await deleteGeneration({ id: nodeId });
        managedToast.success("Edit deleted");
        // If we deleted the active node, select the previous one
        if (activeNode?._id === nodeId && editTree) {
          const idx = editTree.findIndex(n => n._id === nodeId);
          const prev = editTree[idx - 1];
          if (prev) {
            setSelectedNodeId(prev._id);
          }
        }
      } catch {
        managedToast.error("Failed to delete edit");
      }
    },
    [deleteGeneration, managedToast, activeNode, editTree]
  );

  const handleCancelGeneration = useCallback(
    async (nodeId: Id<"generations">) => {
      try {
        await cancelGeneration({ id: nodeId });
      } catch {
        managedToast.error("Failed to cancel");
      }
    },
    [cancelGeneration, managedToast]
  );

  const handleRetryGeneration = useCallback(
    async (nodeId: Id<"generations">) => {
      try {
        await retryGeneration({ id: nodeId });
      } catch {
        managedToast.error("Failed to retry");
      }
    },
    [retryGeneration, managedToast]
  );

  // ---- Derived state ----
  const isLoading = !(generation && editTree);
  const isPending =
    activeNode?.status === "pending" ||
    activeNode?.status === "starting" ||
    activeNode?.status === "processing";
  const isFailed =
    activeNode?.status === "failed" || activeNode?.status === "canceled";
  // Compute placeholder dimensions from aspect ratio + viewport when heroSize isn't available
  const rootAspectRatio = editTree?.[0]?.aspectRatio;
  const placeholderSize = (() => {
    if (heroSize) {
      return { width: heroSize.width, height: heroSize.height };
    }
    // Derive from aspect ratio and max viewport height
    const maxH = typeof window !== "undefined" ? window.innerHeight - 180 : 600;
    const [w, h] = (rootAspectRatio ?? "1:1").split(":").map(Number);
    const ratio = (w ?? 1) / (h ?? 1);
    if (ratio >= 1) {
      // Landscape or square: height is the constraint
      return { width: Math.round(maxH * ratio), height: maxH };
    }
    // Portrait: height is constraint, width = height * ratio
    return { width: Math.round(maxH * ratio), height: maxH };
  })();
  const nodeIndex = editTree
    ? editTree.findIndex(n => n._id === activeNode?._id)
    : -1;

  return createPortal(
    <div
      role="dialog"
      aria-label="Edit image"
      aria-modal="true"
      className="fixed inset-0 z-modal flex flex-col bg-background"
    >
      {/* Back button — always visible, top-left */}
      <div className="absolute left-4 top-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 rounded-full bg-card/80 shadow-sm backdrop-blur-md ring-1 ring-border/30 hover:bg-card"
          onClick={handleBack}
        >
          <ArrowLeftIcon className="size-4" />
          Canvas
        </Button>
      </div>

      {/* Image area */}
      <div
        ref={imageAreaRef}
        tabIndex={-1}
        className="relative flex flex-1 items-center justify-center outline-none min-h-0"
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="relative flex items-center justify-center">
            {/* Thumbnail strip — positioned outside the hero so it doesn't shift centering */}
            {editTree.length > 1 && (
              <div
                ref={thumbStripRef}
                className="absolute right-full mr-3 flex max-h-[70vh] flex-col gap-1.5 overflow-y-auto scrollbar-none"
              >
                {editTree.map((node, idx) => (
                  <Tooltip key={node._id}>
                    <TooltipTrigger
                      data-node-id={node._id}
                      className={cn(
                        "relative size-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                        node._id === activeNode?._id
                          ? "border-primary ring-1 ring-primary/30"
                          : "border-transparent hover:border-border/60"
                      )}
                      onClick={() => setSelectedNodeId(node._id)}
                    >
                      {(() => {
                        const nodePending =
                          node.status === "pending" ||
                          node.status === "starting" ||
                          node.status === "processing";
                        if (node.imageUrl) {
                          return (
                            <img
                              src={node.imageUrl}
                              alt={node.prompt || "Edit"}
                              className="h-full w-full object-cover"
                            />
                          );
                        }
                        if (nodePending) {
                          return (
                            <div className="flex h-full w-full items-center justify-center bg-muted/30">
                              <Spinner className="size-3.5" />
                            </div>
                          );
                        }
                        return (
                          <div className="flex h-full w-full items-center justify-center bg-destructive/5">
                            <WarningCircleIcon className="size-3.5 text-destructive" />
                          </div>
                        );
                      })()}
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {idx === 0 ? "Original" : `Edit ${idx}`}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Hero image with info overlay */}
            <div className="group/hero relative">
              {(() => {
                if (heroImageUrl) {
                  return (
                    <>
                      <img
                        key={activeNode?._id}
                        src={heroImageUrl}
                        alt={activeNode?.prompt || "Generated image"}
                        className="max-h-[calc(100dvh-180px)] rounded-lg object-contain drop-shadow-2xl animate-in fade-in-0 duration-300"
                        draggable={false}
                        onLoad={e => {
                          const img = e.currentTarget;
                          setHeroSize({
                            width: img.clientWidth,
                            height: img.clientHeight,
                          });
                        }}
                      />

                      {/* Download + Delete buttons — top-right on hover */}
                      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/hero:opacity-100">
                        <Tooltip>
                          <TooltipTrigger>
                            <button
                              type="button"
                              className="flex size-8 items-center justify-center rounded-md bg-black/40 text-white/80 backdrop-blur-sm transition-all hover:bg-black/60"
                              onClick={e => {
                                e.stopPropagation();
                                handleDownload();
                              }}
                              aria-label="Download image"
                            >
                              <DownloadIcon animateOnHover size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                        {nodeIndex > 0 && activeNode && (
                          <Tooltip>
                            <TooltipTrigger>
                              <button
                                type="button"
                                className="flex size-8 items-center justify-center rounded-md bg-black/40 text-white/80 backdrop-blur-sm transition-all hover:bg-red-500/60"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleDeleteNode(activeNode._id);
                                }}
                                aria-label="Delete this edit"
                              >
                                <TrashSimpleIcon className="size-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Delete this edit</TooltipContent>
                          </Tooltip>
                        )}
                      </div>

                      {/* Info overlay — bottom gradient on hover */}
                      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end rounded-b-lg bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-12 opacity-0 transition-opacity duration-200 group-hover/hero:opacity-100">
                        {/* Prompt — smooth expand/collapse via max-height */}
                        {activeNode?.prompt && (
                          <button
                            type="button"
                            className="text-left"
                            onClick={e => {
                              e.stopPropagation();
                              setPromptExpanded(prev => !prev);
                            }}
                            title={
                              promptExpanded
                                ? "Click to collapse"
                                : "Click to expand"
                            }
                          >
                            <p
                              className={cn(
                                "text-sm leading-snug text-white drop-shadow-sm transition-[max-height] duration-300 ease-out overflow-hidden",
                                promptExpanded
                                  ? "max-h-[50vh]"
                                  : "max-h-[2.625rem]"
                              )}
                            >
                              {activeNode.prompt}
                            </p>
                          </button>
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/80">
                          <span className="rounded bg-white/25 px-1.5 py-0.5 font-medium backdrop-blur-sm">
                            {nodeIndex === 0 ? "Original" : `Edit ${nodeIndex}`}
                          </span>
                          {activeNode?.model && (
                            <Tooltip>
                              <TooltipTrigger>
                                <button
                                  type="button"
                                  className={cn(
                                    "rounded px-1.5 py-0.5 transition-colors",
                                    img2imgModels.some(
                                      m => m.modelId === activeNode.model
                                    )
                                      ? "hover:bg-white/30 cursor-pointer"
                                      : "cursor-default"
                                  )}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleSelectModelFromNode(activeNode.model);
                                  }}
                                >
                                  {formatModelName(activeNode.model)}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {img2imgModels.some(
                                  m => m.modelId === activeNode.model
                                )
                                  ? "Use this model for edits"
                                  : "Not available for image editing"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </>
                  );
                }
                if (isPending) {
                  const sizeStyle = placeholderSize;
                  return (
                    <div
                      className="relative flex items-center justify-center rounded-lg skeleton-surface"
                      style={sizeStyle}
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        Generating edit…
                      </span>
                      {activeNode && (
                        <Tooltip>
                          <TooltipTrigger>
                            <button
                              type="button"
                              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/40 text-white/80 backdrop-blur-sm transition-all hover:bg-black/60"
                              onClick={() =>
                                handleCancelGeneration(activeNode._id)
                              }
                              aria-label="Cancel generation"
                            >
                              <XIcon className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                }
                if (isFailed) {
                  const sizeStyle = placeholderSize;
                  return (
                    <div
                      className="relative flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-8 text-center"
                      style={sizeStyle}
                    >
                      <WarningCircleIcon className="size-6 text-destructive" />
                      <span className="text-sm text-destructive">
                        {activeNode?.status === "canceled"
                          ? "Canceled"
                          : activeNode?.error || "Generation failed"}
                      </span>
                      {activeNode && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted"
                            onClick={() =>
                              handleRetryGeneration(activeNode._id)
                            }
                          >
                            <ArrowClockwiseIcon className="size-3.5" />
                            Retry
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-destructive shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted"
                            onClick={() => handleDeleteNode(activeNode._id)}
                          >
                            <TrashSimpleIcon className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Bottom edit input */}
      {!isLoading && lastSucceededNode && (
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="mx-auto max-w-2xl">
            <div className="chat-input-container">
              {/* Source image thumbnail */}
              {lastSucceededNode.imageUrl && (
                <div className="flex items-center gap-2 px-2.5 pt-2">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-border/40">
                    <img
                      src={lastSucceededNode.imageUrl}
                      alt="Edit source"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Editing this image
                  </span>
                </div>
              )}

              {/* Auto-resize textarea */}
              <div
                className="auto-resize-textarea w-full overflow-y-auto px-2.5 py-1.5 max-h-40"
                data-replicated-value={`${editPrompt || ""}\u200b`}
                data-autoresize="true"
              >
                <textarea
                  className="w-full bg-transparent border-0 outline-none ring-0 text-base leading-relaxed transition-colors duration-200 focus:bg-transparent focus:outline-none touch-action-manipulation md:scrollbar-thin resize-none overflow-y-auto placeholder:text-muted-foreground/60 p-0"
                  rows={1}
                  placeholder="Describe your edit..."
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {/* Bottom bar — model picker + submit */}
              <div className="chat-input-bottom-bar flex items-center justify-between p-1">
                <div className="flex min-w-0 flex-1 items-center">
                  <EditModelPicker
                    models={img2imgModels}
                    selectedModelId={editModelId}
                    onSelect={id => {
                      setEditModelId(id);
                      set(CACHE_KEYS.canvasLastEditModel, id);
                    }}
                  />
                </div>
                <div className="flex items-center">
                  <Button
                    size="icon-sm"
                    className="h-8 w-8 shrink-0 rounded-full"
                    onClick={handleSubmitEdit}
                    disabled={
                      isSubmitting ||
                      !editPrompt.trim() ||
                      !editModelId ||
                      !lastSucceededNode
                    }
                  >
                    {isSubmitting ? (
                      <Spinner className="size-4" />
                    ) : (
                      <PaperPlaneTiltIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.getElementById("root") ?? document.body
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatModelName(model?: string): string {
  if (!model) {
    return "Unknown";
  }
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

// ============================================================================
// EditModelPicker
// ============================================================================

type EditModelPickerProps = {
  models: Array<{
    modelId: string;
    name: string;
    provider?: string;
  }>;
  selectedModelId: string;
  onSelect: (modelId: string) => void;
};

function EditModelPicker({
  models,
  selectedModelId,
  onSelect,
}: EditModelPickerProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const selectedModel = models.find(m => m.modelId === selectedModelId);
  const triggerLabel = selectedModel?.name || "Select model";
  const triggerProvider = selectedModel?.provider || "replicate";

  const desktopTrigger = (
    <>
      <div className="flex items-center gap-1.5">
        <ProviderIcon provider={triggerProvider} className="h-3.5 w-3.5" />
        <span className="max-w-[180px] truncate font-semibold tracking-tight">
          {triggerLabel}
        </span>
      </div>
      <CaretDown className="size-3.5 opacity-70" />
    </>
  );

  const mobileTrigger = (
    <ProviderIcon provider={triggerProvider} className="h-4 w-4" />
  );

  return (
    <ResponsivePicker
      open={open}
      onOpenChange={setOpen}
      trigger={isDesktop ? desktopTrigger : mobileTrigger}
      title="Edit model"
      tooltip="Select edit model"
      pickerVariant="accent"
      contentClassName="p-0"
    >
      <div className="max-h-[min(calc(100dvh-14rem),280px)] overflow-y-auto p-1">
        {models.map(m => (
          <button
            key={m.modelId}
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              m.modelId === selectedModelId
                ? "bg-primary/10 text-foreground"
                : "text-foreground/80 hover:bg-muted"
            )}
            onClick={() => {
              onSelect(m.modelId);
              setOpen(false);
            }}
          >
            <ProviderIcon
              provider={m.provider || "replicate"}
              className="h-4 w-4 shrink-0"
            />
            <span className="flex-1 truncate">{m.name}</span>
            {m.modelId === selectedModelId && (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            )}
          </button>
        ))}
      </div>
    </ResponsivePicker>
  );
}
