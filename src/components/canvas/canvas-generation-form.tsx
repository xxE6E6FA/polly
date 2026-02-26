import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  CheckIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileSelectorDialog } from "@/components/files/file-selector-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useModelCatalogStore } from "@/hooks/use-model-catalog";
import { base64ToUint8Array, compressImage } from "@/lib/file-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import { useCanvasStore } from "@/stores/canvas-store";
import type { Attachment } from "@/types";

const ASPECT_RATIOS = [
  { value: "1:1", w: 20, h: 20 },
  { value: "16:9", w: 24, h: 14 },
  { value: "9:16", w: 14, h: 24 },
  { value: "4:3", w: 22, h: 17 },
  { value: "3:4", w: 17, h: 22 },
];

const RESOLUTION_PRESETS: {
  label: string;
  description: string;
  value: number;
}[] = [
  { label: "Standard", description: "1K resolution", value: 25 },
  { label: "High", description: "2K resolution", value: 50 },
  { label: "Ultra", description: "4K resolution", value: 100 },
];

// biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query
type ImageModel = any;

function extractOwner(modelId: string): string | null {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex > 0) {
    return modelId.slice(0, slashIndex);
  }
  return null;
}

function getModelCapabilityTags(
  model: ImageModel,
  hasReferenceImages: boolean
): { label: string; highlight: boolean }[] {
  const tags: { label: string; highlight: boolean }[] = [];

  if (model.supportsMultipleImages) {
    tags.push({ label: "Multi", highlight: false });
  }
  if (model.supportsNegativePrompt) {
    tags.push({ label: "Negative", highlight: false });
  }
  if (model.supportsImageToImage) {
    tags.push({ label: "Img2Img", highlight: hasReferenceImages });
  }

  return tags;
}

type ReferenceImageRef = { storageId: string; previewUrl: string };

function ModelPickerPopover({
  models,
  filteredModels,
  selectedModelIds,
  toggleModel,
  showSearch,
  searchQuery,
  setSearchQuery,
  referenceImages,
}: {
  models: ImageModel[];
  filteredModels: ImageModel[] | undefined;
  selectedModelIds: string[];
  toggleModel: (modelId: string) => void;
  showSearch: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  referenceImages: ReferenceImageRef[];
}) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset focus index when filtered results change
  const prevFilteredLen = useRef(filteredModels?.length);
  if (filteredModels?.length !== prevFilteredLen.current) {
    prevFilteredLen.current = filteredModels?.length;
    if (focusIndex >= 0) {
      setFocusIndex(-1);
    }
  }

  const itemCount = filteredModels?.length ?? 0;

  const scrollItemIntoView = useCallback((index: number) => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const items = list.querySelectorAll("[data-model-item]");
    items[index]?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (itemCount === 0) {
        return;
      }

      const isInSearch =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = prev < itemCount - 1 ? prev + 1 : 0;
          scrollItemIntoView(next);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex(prev => {
          const next = prev > 0 ? prev - 1 : itemCount - 1;
          scrollItemIntoView(next);
          return next;
        });
      } else if (
        e.key === "Enter" &&
        focusIndex >= 0 &&
        filteredModels &&
        focusIndex < filteredModels.length
      ) {
        e.preventDefault();
        toggleModel(filteredModels[focusIndex].modelId);
      } else if (
        e.key === " " &&
        !isInSearch &&
        focusIndex >= 0 &&
        filteredModels &&
        focusIndex < filteredModels.length
      ) {
        e.preventDefault();
        toggleModel(filteredModels[focusIndex].modelId);
      } else if (e.key === "Home" && !isInSearch) {
        e.preventDefault();
        setFocusIndex(0);
        scrollItemIntoView(0);
      } else if (e.key === "End" && !isInSearch) {
        e.preventDefault();
        setFocusIndex(itemCount - 1);
        scrollItemIntoView(itemCount - 1);
      }
    },
    [itemCount, focusIndex, filteredModels, toggleModel, scrollItemIntoView]
  );

  // Resolve selected model names for display
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex min-h-9 w-full items-center gap-1 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors",
          selectedModelIds.length > 0
            ? "border-primary/30 bg-primary/5 text-sidebar-foreground"
            : "border-border/50 bg-sidebar-hover text-sidebar-muted hover:border-border"
        )}
      >
        {selectedModelIds.length === 0 ? (
          <span className="min-w-0 flex-1 truncate px-1">Select models…</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {selectedModelIds.map(id => {
              const name = models.find(
                (m: ImageModel) => m.modelId === id
              )?.name;
              if (!name) {
                return null;
              }
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {name}
                  {/* biome-ignore lint/a11y/useSemanticElements: nested inside PopoverTrigger button */}
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded-sm opacity-60 hover:opacity-100"
                    onClick={e => {
                      e.stopPropagation();
                      toggleModel(id);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleModel(id);
                      }
                    }}
                  >
                    <XIcon className="size-2.5" />
                  </span>
                </span>
              );
            })}
          </span>
        )}
        <CaretDownIcon className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-[360px] p-0"
      >
        <div
          className="flex max-h-[min(480px,60vh)] flex-col"
          role="listbox"
          aria-multiselectable="true"
          aria-label="Select image models"
          onKeyDown={handleKeyDown}
        >
          {showSearch && (
            <div className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5">
              <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground/50" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>
          )}
          <div ref={listRef} className="overflow-y-auto scrollbar-thin">
            {/* biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query */}
            {filteredModels?.map((model: any, index: number) => {
              const isSelected = selectedModelIds.includes(model.modelId);
              const owner = extractOwner(model.modelId);
              const subtitle = model.description || owner;
              const tags = getModelCapabilityTags(
                model,
                referenceImages.length > 0
              );
              const isFocused = index === focusIndex;
              return (
                <button
                  key={model.modelId || model._id}
                  type="button"
                  data-model-item
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-primary/8" : "hover:bg-muted/50",
                    isFocused && "ring-2 ring-inset ring-primary/40"
                  )}
                  onClick={() => toggleModel(model.modelId)}
                  onMouseEnter={() => setFocusIndex(index)}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && (
                      <CheckIcon className="size-3" weight="bold" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {model.name}
                    </div>
                    {subtitle && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {subtitle}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tags.map(t => (
                          <span
                            key={t.label}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                              t.highlight
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredModels?.length === 0 && searchQuery.trim() && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No models match "{searchQuery}"
              </p>
            )}
          </div>
          {selectedModelIds.length > 0 && (
            <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {selectedModelIds.length} model
              {selectedModelIds.length !== 1 ? "s" : ""} selected
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PromptSparkleMenu() {
  const prompt = useCanvasStore(s => s.prompt);
  const setPrompt = useCanvasStore(s => s.setPrompt);
  const referenceImages = useCanvasStore(s => s.referenceImages);
  const isGeneratingPrompt = useCanvasStore(s => s.isGeneratingPrompt);
  const setIsGeneratingPrompt = useCanvasStore(s => s.setIsGeneratingPrompt);
  const promptModelId = useCanvasStore(s => s.promptModelId);
  const promptModelProvider = useCanvasStore(s => s.promptModelProvider);
  const setPromptModel = useCanvasStore(s => s.setPromptModel);
  const promptPersonaId = useCanvasStore(s => s.promptPersonaId);
  const setPromptPersonaId = useCanvasStore(s => s.setPromptPersonaId);

  const managedToast = useToast();
  const generatePrompt = useAction(
    api.ai.prompt_generation.generateImagePrompt
  );
  const personas = useQuery(api.personas.list) ?? [];

  const [showFilePicker, setShowFilePicker] = useState(false);
  const describeFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useConvexFileUpload();

  // Get text models that support vision for the model picker
  const textModels = useModelCatalogStore(s => s.userModels);
  const visionModels = textModels.filter(m => m.supportsImages);

  // Shared args for both modes
  const sharedArgs = useCallback(() => {
    return {
      ...(promptModelId && promptModelProvider
        ? { provider: promptModelProvider, modelId: promptModelId }
        : {}),
      ...(promptPersonaId
        ? { personaId: promptPersonaId as Id<"personas"> }
        : {}),
    };
  }, [promptModelId, promptModelProvider, promptPersonaId]);

  const handleEnhancePrompt = useCallback(async () => {
    setIsGeneratingPrompt(true);
    try {
      const result = await generatePrompt({
        mode: "enhance_prompt",
        simplePrompt: prompt || undefined,
        ...sharedArgs(),
      });
      setPrompt(result);
    } catch (err) {
      console.error("Failed to enhance prompt:", err);
      managedToast.error(
        err instanceof Error ? err.message : "Failed to enhance prompt"
      );
    } finally {
      setIsGeneratingPrompt(false);
    }
  }, [
    prompt,
    sharedArgs,
    generatePrompt,
    setPrompt,
    setIsGeneratingPrompt,
    managedToast.error,
  ]);

  const handleDescribeImage = useCallback(
    async (storageId: Id<"_storage">) => {
      setIsGeneratingPrompt(true);
      try {
        const result = await generatePrompt({
          mode: "describe_image",
          imageStorageId: storageId,
          ...sharedArgs(),
        });
        setPrompt(result);
      } catch (err) {
        console.error("Failed to describe image:", err);
        managedToast.error(
          err instanceof Error ? err.message : "Failed to describe image"
        );
      } finally {
        setIsGeneratingPrompt(false);
      }
    },
    [
      sharedArgs,
      generatePrompt,
      setPrompt,
      setIsGeneratingPrompt,
      managedToast.error,
    ]
  );

  const handleLibrarySelect = useCallback(
    (attachments: Attachment[]) => {
      const imageAttachment = attachments.find(
        a => a.type === "image" && a.storageId
      );
      if (imageAttachment?.storageId) {
        handleDescribeImage(imageAttachment.storageId as Id<"_storage">);
      } else {
        managedToast.error("Please select an image file");
      }
    },
    [handleDescribeImage, managedToast.error]
  );

  const handleUploadForDescribe = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        return;
      }

      setIsGeneratingPrompt(true);
      try {
        const converted = await compressImage(file, 1024, 0.8, "image/jpeg");
        const bytes = base64ToUint8Array(converted.base64);
        const compressedFile = new File([bytes], file.name || "image.jpg", {
          type: converted.mimeType,
        });
        const attachment = await uploadFile(compressedFile);
        if (!attachment.storageId) {
          throw new Error("Upload succeeded but no storage ID returned");
        }
        const result = await generatePrompt({
          mode: "describe_image",
          imageStorageId: attachment.storageId,
          ...sharedArgs(),
        });
        setPrompt(result);
      } catch (err) {
        console.error("Failed to upload and describe image:", err);
        managedToast.error(
          err instanceof Error ? err.message : "Failed to describe image"
        );
      } finally {
        setIsGeneratingPrompt(false);
      }
    },
    [
      uploadFile,
      generatePrompt,
      sharedArgs,
      setPrompt,
      setIsGeneratingPrompt,
      managedToast.error,
    ]
  );

  const activePersona = personas.find(p => p._id === promptPersonaId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isGeneratingPrompt}
          className={cn(
            "absolute right-2 top-2 flex size-7 items-center justify-center rounded-md transition-colors",
            isGeneratingPrompt
              ? "text-primary"
              : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
          )}
        >
          {isGeneratingPrompt ? (
            <Spinner className="size-4" />
          ) : (
            <SparkleIcon className="size-4" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
          <DropdownMenuItem onClick={handleEnhancePrompt}>
            <SparkleIcon className="size-4" />
            Enhance prompt
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Reference image thumbnails */}
          {referenceImages.length > 0 && (
            <div className="flex gap-1.5 px-2 py-1.5">
              {referenceImages.map((img, i) => (
                <button
                  key={img.storageId}
                  type="button"
                  onClick={() =>
                    handleDescribeImage(img.storageId as Id<"_storage">)
                  }
                  className="group relative size-9 shrink-0 overflow-hidden rounded-md border border-border/50 transition-all hover:border-primary/50 hover:ring-1 hover:ring-primary/20"
                  title={`Describe reference ${i + 1}`}
                >
                  <img
                    src={img.previewUrl}
                    alt={`Reference ${i + 1}`}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          <DropdownMenuItem
            onClick={() => describeFileInputRef.current?.click()}
          >
            <UploadSimpleIcon className="size-4" />
            Describe uploaded image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowFilePicker(true)}>
            <ImageIcon className="size-4" />
            Describe from library
          </DropdownMenuItem>

          {/* Settings submenus */}
          <DropdownMenuSeparator />

          {/* Model picker */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs text-muted-foreground">
              <SparkleIcon className="size-3.5" />
              Model
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => setPromptModel(undefined, undefined)}
              >
                <CheckIcon
                  className={cn(
                    "size-3",
                    promptModelId ? "opacity-0" : "opacity-100"
                  )}
                />
                Built-in (default)
              </DropdownMenuItem>
              {visionModels.length > 0 && <DropdownMenuSeparator />}
              {visionModels.map(model => (
                <DropdownMenuItem
                  key={`${model.provider}-${model.modelId}`}
                  onClick={() => setPromptModel(model.modelId, model.provider)}
                >
                  <CheckIcon
                    className={cn(
                      "size-3",
                      promptModelId === model.modelId &&
                        promptModelProvider === model.provider
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  {model.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Persona picker */}
          {personas.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs text-muted-foreground">
                {activePersona?.icon ? (
                  <span className="text-sm">{activePersona.icon}</span>
                ) : (
                  <PencilSimpleIcon className="size-3.5" />
                )}
                Persona
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setPromptPersonaId(undefined)}>
                  <CheckIcon
                    className={cn(
                      "size-3",
                      promptPersonaId ? "opacity-0" : "opacity-100"
                    )}
                  />
                  None
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {personas.map(persona => (
                  <DropdownMenuItem
                    key={persona._id}
                    onClick={() => setPromptPersonaId(persona._id)}
                  >
                    <CheckIcon
                      className={cn(
                        "size-3",
                        promptPersonaId === persona._id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    {persona.icon && (
                      <span className="text-sm">{persona.icon}</span>
                    )}
                    {persona.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={describeFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUploadForDescribe}
      />
      <FileSelectorDialog
        open={showFilePicker}
        onOpenChange={setShowFilePicker}
        onSelectFiles={handleLibrarySelect}
        supportsImages
      />
    </>
  );
}

export function CanvasGenerationForm() {
  const prompt = useCanvasStore(s => s.prompt);
  const setPrompt = useCanvasStore(s => s.setPrompt);
  const selectedModelIds = useCanvasStore(s => s.selectedModelIds);
  const toggleModel = useCanvasStore(s => s.toggleModel);
  const aspectRatio = useCanvasStore(s => s.aspectRatio);
  const setAspectRatio = useCanvasStore(s => s.setAspectRatio);
  const advancedParams = useCanvasStore(s => s.advancedParams);
  const setAdvancedParams = useCanvasStore(s => s.setAdvancedParams);

  const referenceImages = useCanvasStore(s => s.referenceImages);
  const addReferenceImage = useCanvasStore(s => s.addReferenceImage);
  const removeReferenceImage = useCanvasStore(s => s.removeReferenceImage);
  const clearReferenceImages = useCanvasStore(s => s.clearReferenceImages);
  const isGeneratingPrompt = useCanvasStore(s => s.isGeneratingPrompt);

  const managedToast = useToast();

  // Revoke blob URLs for reference images on unmount
  useEffect(() => {
    return () => {
      useCanvasStore.getState().clearReferenceImages();
    };
  }, []);

  const availableModels = useEnabledImageModels();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useConvexFileUpload();

  // Filter out built-in free models (which are now disabled)
  // biome-ignore lint/suspicious/noExplicitAny: image model shape from dynamic query
  const models = availableModels?.filter((m: any) => !(m.isBuiltIn && m.free));

  const filteredModels = models?.filter((model: ImageModel) => {
    if (!searchQuery.trim()) {
      return true;
    }
    const q = searchQuery.toLowerCase();
    return (
      model.name?.toLowerCase().includes(q) ||
      model.modelId?.toLowerCase().includes(q)
    );
  });

  const showSearch = (models?.length ?? 0) >= 5;

  const activeQuality = advancedParams.quality ?? 25;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      document.getElementById("canvas-generate-btn")?.click();
    }
  }, []);

  const setIsGeneratingPrompt = useCanvasStore(s => s.setIsGeneratingPrompt);
  const promptModelId = useCanvasStore(s => s.promptModelId);
  const promptModelProvider = useCanvasStore(s => s.promptModelProvider);
  const promptPersonaId = useCanvasStore(s => s.promptPersonaId);
  const generatePrompt = useAction(
    api.ai.prompt_generation.generateImagePrompt
  );

  const [isDragging, setIsDragging] = useState(false);

  const describeImageFromFile = useCallback(
    async (file: File) => {
      setIsGeneratingPrompt(true);
      try {
        const converted = await compressImage(file, 1024, 0.8, "image/jpeg");
        const bytes = base64ToUint8Array(converted.base64);
        const compressedFile = new File([bytes], file.name || "image.jpg", {
          type: converted.mimeType,
        });
        const attachment = await uploadFile(compressedFile);
        if (!attachment.storageId) {
          throw new Error("Upload succeeded but no storage ID returned");
        }
        const sharedArgs = {
          ...(promptModelId && promptModelProvider
            ? { provider: promptModelProvider, modelId: promptModelId }
            : {}),
          ...(promptPersonaId
            ? { personaId: promptPersonaId as Id<"personas"> }
            : {}),
        };
        const result = await generatePrompt({
          mode: "describe_image",
          imageStorageId: attachment.storageId,
          ...sharedArgs,
        });
        setPrompt(result);
      } catch (err) {
        console.error("Failed to describe image:", err);
        managedToast.error(
          err instanceof Error ? err.message : "Failed to describe image"
        );
      } finally {
        setIsGeneratingPrompt(false);
      }
    },
    [
      uploadFile,
      generatePrompt,
      setPrompt,
      setIsGeneratingPrompt,
      promptModelId,
      promptModelProvider,
      promptPersonaId,
      managedToast.error,
    ]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      const imageFile = files.find(f => f.type.startsWith("image/"));
      if (!imageFile) {
        return;
      }
      e.preventDefault();
      // Materialize the clipboard data immediately — the browser may
      // revoke access to the underlying blob after the event returns.
      const buffer = await imageFile.arrayBuffer();
      const file = new File([buffer], imageFile.name || "pasted-image.png", {
        type: imageFile.type,
      });
      describeImageFromFile(file);
    },
    [describeImageFromFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      const hasImageType = Array.from(e.dataTransfer.types).includes("Files");
      if (hasImageType) {
        e.preventDefault();
        if (!isDragging) {
          setIsDragging(true);
        }
      }
    },
    [isDragging]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset if leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find(f => f.type.startsWith("image/"));
      if (imageFile) {
        describeImageFromFile(imageFile);
      }
    },
    [describeImageFromFile]
  );

  const handleReferenceImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) {
        return;
      }
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";

      setIsUploading(true);
      try {
        for (const file of files) {
          const attachment = await uploadFile(file);
          if (attachment.storageId) {
            const previewUrl = URL.createObjectURL(file);
            addReferenceImage(attachment.storageId, previewUrl);
          }
        }
      } catch (err) {
        console.error("Failed to upload reference image:", err);
        managedToast.error("Failed to upload reference image");
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFile, addReferenceImage, managedToast.error]
  );

  return (
    <div className="stack-md pb-2">
      {/* Prompt */}
      <div className="stack-xs">
        <div
          className="relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            id="canvas-prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isGeneratingPrompt}
            placeholder="Describe the image you want to generate..."
            className={cn(
              "min-h-[100px] w-full resize-y rounded-lg border bg-sidebar-hover p-3 pr-10 text-sm text-sidebar-foreground placeholder:text-sidebar-muted/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-60",
              isDragging ? "border-primary border-dashed" : "border-border/50"
            )}
            rows={4}
          />
          <PromptSparkleMenu />
        </div>
      </div>

      {/* Reference Images */}
      <div className="stack-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-sidebar-muted">
            <ImageIcon className="mr-1 inline size-3.5 align-[-2px]" />
            References
            {referenceImages.length > 0 && (
              <span className="ml-1 text-sidebar-foreground/70">
                · {referenceImages.length}
              </span>
            )}
          </span>
          {referenceImages.length > 0 && (
            <button
              type="button"
              className="text-[11px] text-sidebar-muted transition-colors hover:text-sidebar-foreground"
              onClick={clearReferenceImages}
            >
              Clear
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleReferenceImageSelect}
        />
        {referenceImages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {referenceImages.map((img, index) => (
              <div
                key={img.storageId}
                className="group relative h-14 w-14 shrink-0"
              >
                <img
                  src={img.previewUrl}
                  alt={`Reference ${index + 1}`}
                  className="size-full rounded-md border border-border/50 object-cover"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                  onClick={() => removeReferenceImage(index)}
                  aria-label={`Remove reference ${index + 1}`}
                >
                  <XIcon className="size-2.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={isUploading}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border/50 text-sidebar-muted transition-colors hover:border-primary/40 hover:text-sidebar-foreground disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
            >
              <PlusIcon className="size-5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isUploading}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border/50 bg-sidebar-hover/50 px-3 py-2.5 text-xs text-sidebar-muted transition-colors hover:border-primary/40 hover:text-sidebar-foreground disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusIcon className="size-3.5" />
            {isUploading ? "Uploading..." : "Add reference images"}
          </button>
        )}
        <p className="text-[10px] text-sidebar-muted/60">
          Only models that support image input will use these
        </p>
      </div>

      {/* Model selection */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">Models</span>
        {!models || models.length === 0 ? (
          <p className="text-xs text-sidebar-muted/70">
            No image models available. Add models in{" "}
            <a href="/settings/models/image" className="text-primary underline">
              Settings
            </a>
            .
          </p>
        ) : (
          <ModelPickerPopover
            models={models}
            filteredModels={filteredModels}
            selectedModelIds={selectedModelIds}
            toggleModel={toggleModel}
            showSearch={showSearch}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            referenceImages={referenceImages}
          />
        )}
      </div>

      {/* Aspect ratio */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">
          Aspect Ratio
        </span>
        <div className="flex gap-1.5">
          {ASPECT_RATIOS.map(ar => {
            const active = aspectRatio === ar.value;
            return (
              <button
                key={ar.value}
                type="button"
                className={cn(
                  "flex flex-1 flex-col items-center gap-1.5 rounded-lg py-2.5 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-hover text-sidebar-muted hover:text-sidebar-foreground"
                )}
                onClick={() => setAspectRatio(ar.value)}
              >
                <div className="flex h-6 items-center justify-center">
                  <div
                    className={cn(
                      "rounded-[3px] border-[1.5px]",
                      active
                        ? "border-primary-foreground"
                        : "border-sidebar-muted/50"
                    )}
                    style={{ width: ar.w, height: ar.h }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums">
                  {ar.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution */}
      <div className="stack-xs">
        <span className="text-xs font-medium text-sidebar-muted">
          Resolution
        </span>
        <div className="flex gap-1.5">
          {RESOLUTION_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-center transition-colors",
                activeQuality === preset.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-hover text-sidebar-muted hover:text-sidebar-foreground"
              )}
              onClick={() => setAdvancedParams({ quality: preset.value })}
            >
              <div className="text-xs font-medium">{preset.label}</div>
              <div className="text-[10px] opacity-70">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        <CaretDownIcon
          className={cn(
            "size-3 transition-transform",
            showAdvanced && "rotate-180"
          )}
        />
        Advanced Settings
        {(advancedParams.steps !== undefined ||
          advancedParams.guidanceScale !== undefined ||
          advancedParams.seed !== undefined ||
          !!advancedParams.negativePrompt) && (
          <span className="size-1.5 rounded-full bg-primary" />
        )}
      </button>

      {showAdvanced && (
        <div className="stack-sm rounded-lg border border-border/40 p-3">
          {/* Steps */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-steps"
              className="text-xs text-sidebar-muted"
            >
              Steps
            </label>
            <input
              id="canvas-steps"
              type="number"
              min={1}
              max={100}
              value={advancedParams.steps ?? ""}
              onChange={e =>
                setAdvancedParams({
                  steps: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Auto"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Guidance */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-guidance"
              className="text-xs text-sidebar-muted"
            >
              Guidance Scale
            </label>
            <input
              id="canvas-guidance"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={advancedParams.guidanceScale ?? ""}
              onChange={e =>
                setAdvancedParams({
                  guidanceScale: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="Auto"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Seed */}
          <div className="stack-xs">
            <label htmlFor="canvas-seed" className="text-xs text-sidebar-muted">
              Seed
            </label>
            <input
              id="canvas-seed"
              type="number"
              min={0}
              value={advancedParams.seed ?? ""}
              onChange={e =>
                setAdvancedParams({
                  seed: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="Random"
              className="w-full rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
            />
          </div>

          {/* Negative prompt */}
          <div className="stack-xs">
            <label
              htmlFor="canvas-neg-prompt"
              className="text-xs text-sidebar-muted"
            >
              Negative Prompt
            </label>
            <textarea
              id="canvas-neg-prompt"
              value={advancedParams.negativePrompt ?? ""}
              onChange={e =>
                setAdvancedParams({
                  negativePrompt: e.target.value || undefined,
                })
              }
              placeholder="Things to avoid..."
              className="w-full resize-y rounded-md border border-border/50 bg-sidebar-hover px-2.5 py-1.5 text-sm text-sidebar-foreground"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasGenerateButton() {
  const prompt = useCanvasStore(s => s.prompt);
  const selectedModelIds = useCanvasStore(s => s.selectedModelIds);
  const aspectRatio = useCanvasStore(s => s.aspectRatio);
  const advancedParams = useCanvasStore(s => s.advancedParams);
  const referenceImages = useCanvasStore(s => s.referenceImages);
  const resetForm = useCanvasStore(s => s.resetForm);

  const startBatch = useAction(api.generations.startCanvasBatch);
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate =
    prompt.trim().length > 0 && selectedModelIds.length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) {
      return;
    }
    setIsGenerating(true);
    try {
      const batchId = crypto.randomUUID();
      await startBatch({
        prompt: prompt.trim(),
        modelIds: selectedModelIds,
        params: {
          aspectRatio,
          ...advancedParams,
          ...(referenceImages.length > 0
            ? { referenceImageIds: referenceImages.map(img => img.storageId) }
            : {}),
        },
        batchId,
      });
      resetForm();
      document
        .getElementById("canvas-grid-scroll")
        ?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsGenerating(false);
    }
  }, [
    canGenerate,
    prompt,
    selectedModelIds,
    aspectRatio,
    advancedParams,
    referenceImages,
    startBatch,
    resetForm,
  ]);

  return (
    <Button
      id="canvas-generate-btn"
      className="w-full gap-2"
      disabled={!canGenerate}
      onClick={handleGenerate}
    >
      <SparkleIcon className="size-4" />
      {isGenerating
        ? "Generating..."
        : `Generate${selectedModelIds.length > 1 ? ` · ${selectedModelIds.length} models` : ""}`}
    </Button>
  );
}
