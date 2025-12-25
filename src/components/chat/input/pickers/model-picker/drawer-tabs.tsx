// This component is separate from Tabs.tsx because it implements a mobile-specific

// UI with a toggleable search mode and uses a custom list implementation (DrawerModelList)
// instead of the cmdk-based approach used in the desktop version.
import type { Doc } from "@convex/_generated/dataModel";
import {
  ChatCircle,
  GearIcon,
  Image as ImageIcon,
  KeyIcon,
  MagnifyingGlass,
  SignInIcon,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ProviderIcon } from "@/components/models/provider-icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { HydratedModel } from "@/types";
import { DrawerItem } from "../../drawer-item";
import { DrawerModelList } from "./drawer-model-list";

type AvailableModel = HydratedModel;

type Size = "sm" | "md";

export function ModelDrawerTabs({
  activeTab,
  onActiveTabChange,
  modelGroups,
  onSelectTextModel,
  hasReachedPollyLimit,
  imageModels,
  selectedImageModelId,
  onSelectImageModel,
  size = "sm",
  isSearching: isSearchingProp,
  setIsSearching: setIsSearchingProp,
  selectedModelId,
  className,
  autoFocusSearch,
  showImagesTab = true,
  imageTabEmptyState,
  showTextSearch = true,
  showImageSearch = true,
  showApiKeysPrompt = false,
  onDismissApiKeysPrompt,
  showSignInPrompt = false,
}: {
  activeTab: "text" | "image";
  onActiveTabChange: (tab: "text" | "image") => void;
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  onSelectTextModel: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  selectedModelId?: string;
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
  isSearching?: boolean;
  setIsSearching?: (isSearching: boolean) => void;
  className?: string;
  autoFocusSearch?: boolean;
  showImagesTab?: boolean;
  imageTabEmptyState?: "needs-models" | null;
  showTextSearch?: boolean;
  showImageSearch?: boolean;
  showApiKeysPrompt?: boolean;
  onDismissApiKeysPrompt?: () => void;
  showSignInPrompt?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [internalIsSearching, setInternalIsSearching] =
    useState(autoFocusSearch);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearching = isSearchingProp ?? internalIsSearching;
  const setIsSearching = setIsSearchingProp ?? setInternalIsSearching;

  // Focus input when entering search mode
  useEffect(() => {
    if (isSearching) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearchQuery("");
    }
  }, [isSearching]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && isSearching) {
        setIsSearching(false);
        e.stopPropagation();
      }
    },
    [isSearching, setIsSearching]
  );

  // Sort image models with built-in first, then filter by search query
  const sortedImageModels = [...imageModels].sort((a, b) => {
    if (a.isBuiltIn && !b.isBuiltIn) {
      return -1;
    }
    if (!a.isBuiltIn && b.isBuiltIn) {
      return 1;
    }
    return 0;
  });

  const filteredImageModels = searchQuery
    ? sortedImageModels.filter(
        m =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.modelId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sortedImageModels;

  return (
    <div
      className={cn("flex w-full flex-1 flex-col overflow-hidden", className)}
      onKeyDown={handleKeyDown}
    >
      {/* Header: Tabs or Search Input */}
      <div className="flex items-center justify-between px-4 pb-2 shrink-0 h-[52px]">
        {isSearching ? (
          <div className="flex w-full items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search all models..."
                className="h-9 pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-input transition-colors"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setIsSearching(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            {showImagesTab ? (
              <div className="flex-1 flex items-center gap-1 bg-muted/50 p-1 rounded-lg h-9 mr-2">
                <button
                  onClick={() => onActiveTabChange("text")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 h-full text-sm font-medium rounded-md transition-all",
                    activeTab === "text"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ChatCircle className="h-4 w-4" />
                  Text
                </button>
                <button
                  onClick={() => onActiveTabChange("image")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 h-full text-sm font-medium rounded-md transition-all",
                    activeTab === "image"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ImageIcon className="h-4 w-4" />
                  Image
                </button>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            {((activeTab === "text" && showTextSearch) ||
              (activeTab === "image" && showImageSearch)) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setIsSearching(true)}
              >
                <MagnifyingGlass className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      {isSearching && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Text Models
          </div>
          <DrawerModelList
            modelGroups={modelGroups}
            handleSelect={onSelectTextModel}
            hasReachedPollyLimit={hasReachedPollyLimit}
            selectedModelId={selectedModelId}
            itemSize="md"
            searchQuery={searchQuery}
          />

          {filteredImageModels.length > 0 && (
            <>
              <div className="px-4 py-2 mt-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-t border-border/40">
                Image Models
              </div>
              <div className="pb-4">
                {filteredImageModels.map(model => (
                  <DrawerItem
                    key={model.modelId}
                    icon={
                      <ProviderIcon
                        provider={model.free ? "polly" : "replicate"}
                        className="h-5 w-5"
                      />
                    }
                    name={model.name}
                    badges={
                      model.free ? (
                        <Badge variant="status-free" size="xs">
                          Free
                        </Badge>
                      ) : undefined
                    }
                    selected={selectedImageModelId === model.modelId}
                    onClick={() => onSelectImageModel(model.modelId)}
                    iconWrapper={false}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!isSearching && activeTab === "text" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* API Keys Prompt Banner */}
          {showApiKeysPrompt && (
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 border-b border-border/40">
              <KeyIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="flex-1 text-sm text-muted-foreground">
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
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <DrawerModelList
              modelGroups={modelGroups}
              handleSelect={onSelectTextModel}
              hasReachedPollyLimit={hasReachedPollyLimit}
              selectedModelId={selectedModelId}
              itemSize="md"
            />
          </div>
        </div>
      )}

      {!isSearching && activeTab === "image" && (
        <div className="flex w-full flex-1 flex-col overflow-y-auto">
          {imageTabEmptyState ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-base font-medium text-foreground mb-1">
                No Image Models Available
              </p>
              <p className="text-sm text-muted-foreground mb-6 max-w-[240px]">
                Enable image models in settings to start generating images.
              </p>
              <Link
                to={ROUTES.SETTINGS.IMAGE_MODELS}
                className={buttonVariants({
                  variant: "secondary",
                  size: "default",
                })}
              >
                <GearIcon className="h-4 w-4 mr-2" />
                Open Settings
              </Link>
            </div>
          ) : (
            filteredImageModels.map(model => (
              <DrawerItem
                key={model.modelId}
                icon={
                  <ProviderIcon
                    provider={model.free ? "polly" : "replicate"}
                    className="h-5 w-5"
                  />
                }
                name={model.name}
                badges={
                  model.free ? (
                    <Badge variant="status-free" size="xs">
                      Free
                    </Badge>
                  ) : undefined
                }
                selected={selectedImageModelId === model.modelId}
                onClick={() => onSelectImageModel(model.modelId)}
                iconWrapper={false}
              />
            ))
          )}
        </div>
      )}

      {/* Sign-in prompt for anonymous users */}
      {showSignInPrompt && (
        <div className="shrink-0 border-t border-border/40 bg-muted/30 px-4 py-3">
          <Link
            to={ROUTES.AUTH}
            className="flex items-center justify-between gap-2 group"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SignInIcon className="h-4 w-4" />
              <span>
                <span className="font-medium text-foreground group-hover:underline">
                  Sign in
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
