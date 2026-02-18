// This component is separate from DrawerTabs.tsx because it uses cmdk for a

// keyboard-friendly, compact desktop dropdown experience, whereas the mobile version
// uses a custom drawer layout with different interaction patterns.
import type { Doc } from "@convex/_generated/dataModel";
import {
  CheckCircle,
  GearIcon,
  ImageIcon,
  KeyIcon,
  MagnifyingGlass,
  SignInIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { HydratedModel } from "@/types";
import { ModelList } from "./model-list";

type AvailableModel = HydratedModel;

type Size = "sm" | "md";

function ImageTabEmptyState() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center p-6 text-center">
      <ImageIcon className="size-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">
        No Image Models Available
      </p>
      <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
        Enable image models in settings to start generating images.
      </p>
      <Link
        to={ROUTES.SETTINGS.IMAGE_MODELS}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <GearIcon className="size-3.5 mr-1.5" />
        Open Settings
      </Link>
    </div>
  );
}

export function ModelPickerTabs({
  activeTab,
  onActiveTabChange,
  modelGroups,
  onSelectTextModel,
  hasReachedPollyLimit,
  imageModels,
  selectedImageModelId,
  onSelectImageModel,
  size = "sm",
  autoFocusSearch,
  className,
  selectedModelId,
  showImagesTab = true,
  imageTabEmptyState,
  showTextSearch = true,
  showImageSearch = true,
  showApiKeysPrompt = false,
  onDismissApiKeysPrompt,
  showSignInPrompt = false,
  generationMode,
}: {
  activeTab: "text" | "image";
  onActiveTabChange: (tab: "text" | "image") => void;
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  onSelectTextModel: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  imageModels: Array<{
    modelId: string;
    name: string;
    description?: string;
    free?: boolean;
    isBuiltIn?: boolean;
  }>;
  selectedImageModelId?: string;
  onSelectImageModel: (modelId: string) => void;
  size?: Size;
  autoFocusSearch?: boolean;
  className?: string;
  selectedModelId?: string;
  showImagesTab?: boolean;
  imageTabEmptyState?: "needs-models" | null;
  showTextSearch?: boolean;
  showImageSearch?: boolean;
  showApiKeysPrompt?: boolean;
  onDismissApiKeysPrompt?: () => void;
  showSignInPrompt?: boolean;
  generationMode: "text" | "image";
}) {
  const h = size === "sm" ? "h-9" : "h-10";
  const padX = size === "sm" ? "px-2.5" : "px-3";
  const padY = size === "sm" ? "py-2" : "py-2.5";

  // Sort image models with built-in first
  const sortedImageModels = [...imageModels].sort((a, b) => {
    if (a.isBuiltIn && !b.isBuiltIn) {
      return -1;
    }
    if (!a.isBuiltIn && b.isBuiltIn) {
      return 1;
    }
    return 0;
  });

  // Refs to focus the appropriate input when switching tabs
  const textInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Focus the appropriate input when tab changes
  useEffect(() => {
    // Small delay to ensure the DOM has updated
    const timer = setTimeout(() => {
      if (activeTab === "text") {
        textInputRef.current?.focus();
      } else if (activeTab === "image" && !imageTabEmptyState) {
        imageInputRef.current?.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab, imageTabEmptyState]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only handle arrow keys for tab switching if images tab is shown
    if (!showImagesTab || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) {
      return;
    }
    const target = e.target as HTMLElement | null;
    const isInput = target?.tagName === "INPUT";
    const isTextarea = target?.tagName === "TEXTAREA";
    const isEditable = !!target?.isContentEditable;

    const hasModifier = e.metaKey || e.ctrlKey || e.altKey;

    if ((isInput || isTextarea || isEditable) && !hasModifier) {
      // If search input focused and empty, allow arrow toggle; otherwise, keep caret movement.
      if (isInput) {
        const inputEl = target as HTMLInputElement;
        const isEmpty = inputEl.value.trim().length === 0;
        if (!isEmpty) {
          return; // let caret move
        }
      } else {
        return;
      }
    }

    e.preventDefault();
    if (e.key === "ArrowLeft") {
      onActiveTabChange(activeTab === "image" ? "text" : "image");
    } else if (e.key === "ArrowRight") {
      onActiveTabChange(activeTab === "text" ? "image" : "text");
    }
  };

  return (
    <div
      className={cn(
        "flex h-full w-full min-h-0 flex-col overflow-hidden",
        className
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Segmented control styled like Settings nav */}
      {showImagesTab && (
        <div className="flex w-full flex-col flex-shrink-0">
          <div className="flex w-full border-b border-border/40">
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                "flex-1 whitespace-nowrap rounded-none text-xs font-medium transition-all duration-200",
                padX,
                padY,
                h,
                activeTab === "text"
                  ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                activeTab === "text"
                  ? "hover:from-primary hover:to-primary/90"
                  : "",
                "border-r border-border/40 last:border-r-0",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              onClick={() => onActiveTabChange("text")}
            >
              Text
            </button>
            <button
              type="button"
              tabIndex={-1}
              className={cn(
                "flex-1 whitespace-nowrap rounded-none text-xs font-medium transition-all duration-200",
                padX,
                padY,
                h,
                activeTab === "image"
                  ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                activeTab === "image"
                  ? "hover:from-primary hover:to-primary/90"
                  : "",
                "border-l border-border/40 first:border-l-0",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              onClick={() => onActiveTabChange("image")}
            >
              Images
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === "text" && (
        <div
          key="text-tab"
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
        >
          {/* API Keys Prompt Banner */}
          {showApiKeysPrompt && (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/40">
              <KeyIcon className="size-4 text-muted-foreground shrink-0" />
              <p className="flex-1 text-xs text-muted-foreground">
                <Link
                  to={ROUTES.SETTINGS.API_KEYS}
                  className="text-foreground hover:underline font-medium"
                >
                  Add your API keys
                </Link>{" "}
                to unlock more models
              </p>
              {onDismissApiKeysPrompt && (
                <button
                  type="button"
                  onClick={onDismissApiKeysPrompt}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          <Command
            className={cn(
              "flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0",
              showTextSearch &&
                "[&_[cmdk-input-wrapper]]:sticky [&_[cmdk-input-wrapper]]:top-0 [&_[cmdk-input-wrapper]]:z-10 [&_[cmdk-input-wrapper]]:mx-0 [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input-wrapper]]:rounded-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40 [&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-1.5 [&_[cmdk-input-wrapper]]:gap-2 [&_[cmdk-input-wrapper]]:shadow-sm [&_[cmdk-input-wrapper]_svg]:h-3.5 [&_[cmdk-input-wrapper]_svg]:w-3.5 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground [&_[cmdk-input]]:h-8 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:rounded-none [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-xs",
              !showTextSearch && "[&_[cmdk-input-wrapper]]:sr-only"
            )}
          >
            <CommandInput
              ref={textInputRef}
              placeholder="Search text models..."
              className="h-8 w-full text-xs"
              autoFocus={autoFocusSearch}
            />
            <CommandList className="max-h-[min(calc(100dvh-14rem),260px)] overflow-y-auto">
              <CommandEmpty>
                <div className="p-4 text-center">
                  <MagnifyingGlass className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                  <p className="mb-1 text-sm text-muted-foreground">
                    No models found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search terms
                  </p>
                </div>
              </CommandEmpty>
              <ModelList
                modelGroups={modelGroups}
                handleSelect={onSelectTextModel}
                hasReachedPollyLimit={hasReachedPollyLimit}
                selectedModelId={
                  generationMode === "text" ? selectedModelId : undefined
                }
              />
            </CommandList>
          </Command>
        </div>
      )}

      {activeTab === "image" && imageTabEmptyState && <ImageTabEmptyState />}

      {activeTab === "image" && !imageTabEmptyState && (
        <div
          key="image-tab"
          className="flex-1 min-h-0 overflow-hidden flex flex-col"
        >
          <Command
            className={cn(
              "flex h-full min-h-0 flex-1 flex-col overflow-hidden",
              showImageSearch && [
                // Style the input wrapper to look like Settings search
                "[&_[cmdk-input-wrapper]]:sticky [&_[cmdk-input-wrapper]]:top-0 [&_[cmdk-input-wrapper]]:z-10 [&_[cmdk-input-wrapper]]:mx-0 [&_[cmdk-input-wrapper]]:mb-0 [&_[cmdk-input-wrapper]]:w-full [&_[cmdk-input-wrapper]]:rounded-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/40",
                "[&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-1.5 [&_[cmdk-input-wrapper]]:gap-2 [&_[cmdk-input-wrapper]]:shadow-sm dark:[&_[cmdk-input-wrapper]]:bg-muted/20",
                // Tune the search icon and input sizing
                "[&_[cmdk-input-wrapper]_svg]:h-3.5 [&_[cmdk-input-wrapper]_svg]:w-3.5 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground",
                "[&_[cmdk-input]]:h-8 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:rounded-none [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-xs",
              ],
              !showImageSearch && "[&_[cmdk-input-wrapper]]:sr-only"
            )}
          >
            <CommandInput
              ref={imageInputRef}
              className="h-8 w-full rounded-none text-xs"
              placeholder="Search image models..."
              autoFocus={autoFocusSearch}
            />
            <CommandList className="max-h-[min(calc(100dvh-14rem),260px)] overflow-y-auto">
              <CommandEmpty>
                <div className="p-4 text-center">
                  <MagnifyingGlass className="mx-auto mb-3 size-8 text-muted-foreground/50" />
                  <p className="mb-1 text-sm text-muted-foreground">
                    No models found
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try adjusting your search terms
                  </p>
                </div>
              </CommandEmpty>
              {sortedImageModels.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No image models available
                </div>
              ) : (
                <CommandGroup className="p-0">
                  {sortedImageModels.map(m => (
                    <CommandItem
                      key={m.modelId}
                      value={`${m.name ?? m.modelId} ${m.modelId}`}
                      onSelect={() => onSelectImageModel(m.modelId)}
                      className={cn(
                        "cursor-pointer rounded-none px-3 py-2.5 text-xs transition-colors hover:bg-muted",
                        generationMode === "image" &&
                          selectedImageModelId === m.modelId &&
                          "bg-muted/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ProviderIcon
                            provider={m.free ? "polly" : "replicate"}
                            className="h-5 w-5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-xs truncate">
                              {m.name || m.modelId}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {m.free && (
                                <Badge variant="status-free" size="xs">
                                  Free
                                </Badge>
                              )}
                              {m.description && (
                                <div className="text-overline text-muted-foreground truncate">
                                  {m.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {generationMode === "image" &&
                          selectedImageModelId === m.modelId && (
                            <CheckCircle
                              className="size-5 shrink-0 fill-primary text-primary-foreground"
                              weight="fill"
                            />
                          )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}

      {/* Sign-in prompt for anonymous users */}
      {showSignInPrompt && (
        <div className="shrink-0 border-t border-border/40 bg-muted/30 px-3 py-2.5">
          <Link
            to={ROUTES.AUTH}
            className="flex items-center justify-between gap-2 group"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SignInIcon className="size-4" />
              <span>
                <span className="font-medium text-foreground group-hover:underline">
                  Sign up
                </span>{" "}
                for higher limits, BYOK & more
              </span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
