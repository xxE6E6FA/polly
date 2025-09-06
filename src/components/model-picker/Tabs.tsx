import type { Doc } from "@convex/_generated/dataModel";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ModelList } from "./ModelList";

type AvailableModel = Doc<"userModels"> | Doc<"builtInModels">;

type Size = "sm" | "md";

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
}: {
  activeTab: "text" | "image";
  onActiveTabChange: (tab: "text" | "image") => void;
  modelGroups: {
    freeModels: AvailableModel[];
    providerModels: Record<string, AvailableModel[]>;
  };
  onSelectTextModel: (modelId: string, provider: string) => void;
  hasReachedPollyLimit: boolean;
  imageModels: Array<{ modelId: string; name: string; description?: string }>;
  selectedImageModelId?: string;
  onSelectImageModel: (modelId: string) => void;
  size?: Size;
  autoFocusSearch?: boolean;
}) {
  const h = size === "sm" ? "h-7" : "h-8";
  const padX = size === "sm" ? "px-2" : "px-2.5";
  const padY = size === "sm" ? "py-1.5" : "py-2";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
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
    <div className="w-full" onKeyDown={handleKeyDown}>
      {/* Segmented control styled like Settings nav */}
      <div className="flex items-center justify-center p-2 border-b border-border/40">
        <div className="w-full">
          <div className="bg-muted/50 border border-border/40 rounded-full p-1 backdrop-blur-[1px]">
            <div className="flex space-x-1 overflow-x-auto">
              <button
                type="button"
                className={cn(
                  "flex-1 whitespace-nowrap rounded-full text-xs font-medium transition-all duration-200",
                  padX,
                  padY,
                  h,
                  activeTab === "text"
                    ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:shadow-sm",
                  activeTab === "text"
                    ? "hover:from-primary hover:to-primary/90"
                    : "",
                  "hover:scale-[1.02]"
                )}
                onClick={() => onActiveTabChange("text")}
              >
                Text
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 whitespace-nowrap rounded-full text-xs font-medium transition-all duration-200",
                  padX,
                  padY,
                  h,
                  activeTab === "image"
                    ? "bg-gradient-to-r from-primary/80 to-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:shadow-sm",
                  activeTab === "image"
                    ? "hover:from-primary hover:to-primary/90"
                    : "",
                  "hover:scale-[1.02]"
                )}
                onClick={() => onActiveTabChange("image")}
              >
                Images
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === "text" ? (
        <ModelList
          modelGroups={modelGroups}
          handleSelect={onSelectTextModel}
          hasReachedPollyLimit={hasReachedPollyLimit}
          autoFocusSearch={autoFocusSearch}
        />
      ) : (
        <Command
          className={cn(
            "pt-2",
            // Style the input wrapper to look like Settings search
            "[&_[cmdk-input-wrapper]]:mx-2 [&_[cmdk-input-wrapper]]:mb-2 [&_[cmdk-input-wrapper]]:rounded-md [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:border-border/50",
            "[&_[cmdk-input-wrapper]]:bg-muted/40 dark:[&_[cmdk-input-wrapper]]:bg-muted/20 [&_[cmdk-input-wrapper]]:px-3",
            // Tune the search icon and input sizing
            "[&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input-wrapper]_svg]:mr-2 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground",
            "[&_[cmdk-input]]:h-9 [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-sm"
          )}
        >
          <CommandInput
            placeholder="Search image models..."
            autoFocus={autoFocusSearch}
          />
          <CommandList className="max-h-[calc(100vh-10rem)] sm:max-h-[350px]">
            <CommandEmpty>
              <div className="p-4 text-center">
                <MagnifyingGlassIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="mb-1 text-sm text-muted-foreground">
                  No models found
                </p>
                <p className="text-xs text-muted-foreground">
                  Try adjusting your search terms
                </p>
              </div>
            </CommandEmpty>
            {imageModels.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No image models available
              </div>
            ) : (
              <CommandGroup>
                {imageModels.map(m => (
                  <CommandItem
                    key={m.modelId}
                    value={`${m.name ?? m.modelId} ${m.modelId}`}
                    onSelect={() => onSelectImageModel(m.modelId)}
                    className={cn(
                      "cursor-pointer mx-2 rounded-md px-3 py-2.5",
                      selectedImageModelId === m.modelId && "bg-accent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {m.name || m.modelId}
                      </div>
                      {m.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {m.description}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      )}
    </div>
  );
}
